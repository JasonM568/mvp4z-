import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const STATUSES = new Set(["created", "uploaded", "quality_rejected", "analyzing", "completed", "failed", "deleted"]);

function validDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const url = request.nextUrl;
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 30), 1), 100);
    const cursor = validDate(url.searchParams.get("cursor"));
    const from = validDate(url.searchParams.get("from"));
    const to = validDate(url.searchParams.get("to"));
    const status = url.searchParams.get("status") || "";
    const model = (url.searchParams.get("model") || "").trim().slice(0, 100);
    const errorCode = (url.searchParams.get("error") || "").trim().slice(0, 100);

    if (status && !STATUSES.has(status)) return apiJson({ error: "無效的狀態篩選" }, 400);

    const admin = createSupabaseAdminClient();
    let query = admin
      .from("face_analysis_runs")
      .select(
        "id, user_id, mode, subject_age, status, mime_type, credits_charged, error_code, image_expires_at, image_deleted_at, completed_at, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) query = query.lt("created_at", cursor);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    if (status) query = query.eq("status", status);
    if (errorCode) query = query.eq("error_code", errorCode);
    if (model) query = query.filter("model_trace->report->>model", "eq", model);

    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    const hasMore = rows.length > limit;
    const runs = rows.slice(0, limit);

    // Compact operational sample only: no image path, report, vision, quality JSON or PII.
    const { data: metricRows, error: metricError } = await admin
      .from("face_analysis_runs")
      .select(
        "status, credits_charged, error_code, created_at, completed_at, usage_logs!face_analysis_runs_usage_log_id_fkey(cost_estimate)"
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (metricError) throw metricError;

    const metrics = summarizeMetrics(metricRows || []);
    return apiJson({
      ok: true,
      runs,
      metrics,
      pagination: {
        has_more: hasMore,
        next_cursor: hasMore && runs.length ? runs[runs.length - 1].created_at : null
      }
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

type MetricRow = {
  status: string;
  credits_charged: number | null;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
  usage_logs: Array<{ cost_estimate: number | string | null }> | null;
};

function summarizeMetrics(rows: MetricRow[]) {
  const started = rows.length;
  const completed = rows.filter((row) => row.status === "completed");
  const qualityKnown = rows.filter((row) =>
    ["quality_rejected", "analyzing", "completed", "failed"].includes(row.status)
  );
  const qualityPassed = qualityKnown.filter((row) => row.status !== "quality_rejected").length;
  const durations = completed
    .map((row) => new Date(row.completed_at || "").getTime() - new Date(row.created_at).getTime())
    .filter((value) => Number.isFinite(value) && value >= 0);
  const errors = new Map<string, number>();
  for (const row of rows) {
    if (row.error_code) errors.set(row.error_code, (errors.get(row.error_code) || 0) + 1);
  }

  return {
    sample_size: started,
    started,
    quality_pass_rate: qualityKnown.length ? qualityPassed / qualityKnown.length : null,
    completion_rate: started ? completed.length / started : null,
    average_duration_ms: durations.length
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : null,
    average_cost_estimate: average(
      rows
        .map((row) => Number(usageCost(row.usage_logs)))
        .filter((value) => Number.isFinite(value) && value >= 0)
    ),
    credits_charged_total: rows.reduce((sum, row) => sum + Number(row.credits_charged || 0), 0),
    top_errors: [...errors.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, count]) => ({ code, count }))
  };
}

function usageCost(value: MetricRow["usage_logs"] | { cost_estimate?: number | string | null } | null) {
  return Array.isArray(value) ? value[0]?.cost_estimate : value?.cost_estimate;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
