// 巽風 admin｜council 報告列表 + 詳情
// GET /api/admin/council-runs?limit=30 → 列表（含 user email、cost、tokens）
// GET /api/admin/council-runs?id=<uuid>  → 單筆完整原始（含 first_round/debate_round 全文）

import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const admin = createSupabaseAdminClient();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const { data, error } = await admin
        .from("council_runs")
        .select(
          "id, user_id, entitlement_id, usage_log_id, request, first_round, debate_round, final_label, final_text, final_ok, fallback_used, total_tokens_in, total_tokens_out, credits_charged, free_quota_used, generated_at, created_at, profiles!council_runs_user_id_fkey(email, name)"
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return apiJson({ error: "找不到該報告" }, 404);
      return apiJson({ ok: true, run: data });
    }

    const limit = Math.min(Number(url.searchParams.get("limit") || 30), 200);
    const { data, error } = await admin
      .from("council_runs")
      .select(
        "id, user_id, credits_charged, free_quota_used, fallback_used, final_ok, total_tokens_in, total_tokens_out, created_at, profiles!council_runs_user_id_fkey(email, name)"
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return apiJson({ ok: true, runs: data || [] });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}
