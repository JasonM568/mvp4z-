// Vercel Cron：把過期的會員資格標成 expired。
//
// 起因：2026-09-22 查正式庫時發現 7 筆 entitlement 標著 status='active'
// 但 expires_at 早就過了，最久的從 2026-06-01 放到現在——從來沒有東西在掃。
//
// 功能上不算漏洞：各扣點路由都有 `.gte("expires_at", now)`，過期的人用不了。
// 真正的傷害是**統計會說謊**：任何只看 status 的查詢都會高估有效會員數。
// 這次連我自己第一次查「有幾位會員卡在低點數」都被多算了一位。
//
// 規則：
//   member_entitlements.status='active' AND expires_at < now() → 'expired'
//
// 觸發：
//   - 每天台灣時間 09:05（UTC 01:05）：vercel.json schedule "5 1 * * *"
//   - 手動：curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/expire-entitlements
//   - dry-run：?dry_run=1 只回筆數與抽樣，不更新
//
// **刻意不動 credits_remaining。** 過期不等於點數歸零：會員續訂後
// commit_paid_entitlement 會把舊點數帶過去（續訂疊加是既有設計）。
// 在這裡清點數等於偷偷沒收他買過的東西。

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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
  const now = new Date().toISOString();

  const { data: candidates, error: queryError } = await admin
    .from("member_entitlements")
    .select("id, user_id, plan_id, credits_remaining, expires_at")
    .eq("status", "active")
    .lt("expires_at", now)
    .order("expires_at", { ascending: true })
    .limit(500);

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const targets = candidates || [];
  const sampled = targets.slice(0, 5).map((e) => ({
    expires_at: e.expires_at,
    credits_remaining: e.credits_remaining
  }));

  if (dryRun || targets.length === 0) {
    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      now,
      candidate_count: targets.length,
      sampled,
      expired_count: 0
    });
  }

  const ids = targets.map((e) => e.id);
  const { data: updated, error: updateError } = await admin
    .from("member_entitlements")
    .update({ status: "expired", updated_at: now })
    .in("id", ids)
    // 競態保護：這幾毫秒內若有人續訂把它改回 active，就不要覆蓋回去。
    .eq("status", "active")
    .lt("expires_at", now)
    .select("id");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const expiredCount = updated?.length || 0;

  // admin_user_id = null 表示系統觸發。
  await admin.from("admin_audit_logs").insert({
    admin_user_id: null,
    action: "entitlements_expired_by_cron",
    target_type: "member_entitlement",
    target_id: null,
    metadata: { expired_count: expiredCount, candidate_count: targets.length, now }
  });

  return NextResponse.json({
    ok: true,
    dry_run: false,
    now,
    candidate_count: targets.length,
    expired_count: expiredCount,
    sampled
  });
}
