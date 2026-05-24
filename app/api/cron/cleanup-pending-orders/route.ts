// Vercel Cron：清掉超過 24h 仍 pending 的綠界訂單。
//
// 規則：
//   orders.status='pending' AND orders.created_at < now - 24h → 標為 'cancelled'
//
// 觸發：
//   - 每小時整點：vercel.json schedule "0 * * * *"
//   - 手動：curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/cleanup-pending-orders
//   - dry-run：?dry_run=1 不更新、只回筆數與抽樣（給人工驗證用）
//
// 驗證：Vercel cron 自帶 Authorization: Bearer $CRON_SECRET header。
// CRON_SECRET 必須在 Vercel project env 設好（preview + production 各設一份）。

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const STALE_HOURS = 24;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("Authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";
  const admin = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: candidates, error: queryError } = await admin
    .from("orders")
    .select("id, order_no, user_id, amount, created_at")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(500);

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const targets = candidates || [];
  const sampled = targets.slice(0, 5).map((o) => ({
    order_no: o.order_no,
    created_at: o.created_at,
    amount: o.amount
  }));

  if (dryRun || targets.length === 0) {
    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      cutoff,
      stale_hours: STALE_HOURS,
      candidate_count: targets.length,
      sampled,
      cleaned_count: 0
    });
  }

  const ids = targets.map((o) => o.id);
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("orders")
    .update({ status: "cancelled", updated_at: now })
    .in("id", ids)
    .eq("status", "pending")  // 競態保護：別處剛改成 paid 就不動
    .select("id");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const cleaned = updated?.length || 0;

  // 寫 audit log（用 service role，admin_user_id=null 表系統觸發）
  await admin.from("admin_audit_logs").insert({
    admin_user_id: null,
    action: "orders_auto_cancel",
    target_type: "orders",
    target_id: null,
    metadata: {
      stale_hours: STALE_HOURS,
      cutoff,
      cleaned_count: cleaned,
      sampled
    }
  });

  return NextResponse.json({
    ok: true,
    dry_run: false,
    cutoff,
    stale_hours: STALE_HOURS,
    candidate_count: targets.length,
    cleaned_count: cleaned,
    sampled
  });
}
