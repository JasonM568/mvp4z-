import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  FACE_ANALYSIS_BUCKET,
  FACE_RUN_STALE_ANALYZING_MINUTES,
  FACE_RUN_STALE_CREATED_MINUTES,
  FACE_RUN_STALE_PENDING_HOURS
} from "@/lib/face-analysis/config";

const BATCH_SIZE = 100;

async function cleanup(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("Authorization") || "";
  if (!expected) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const cutoff = new Date().toISOString();
  const { data, error } = await admin
    .from("face_analysis_runs")
    .select("id, user_id, storage_path, image_expires_at")
    .not("storage_path", "is", null)
    .is("image_deleted_at", null)
    .lte("image_expires_at", cutoff)
    .order("image_expires_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) return NextResponse.json({ error: "Failed to query expired images" }, { status: 500 });

  const results: Array<{ id: string; status: "deleted" | "skipped" | "failed" }> = [];
  for (const run of data || []) {
    const path = run.storage_path as string;
    try {
      const { error: removeError } = await admin.storage.from(FACE_ANALYSIS_BUCKET).remove([path]);
      if (removeError) throw new Error(removeError.message);

      const deletedAt = new Date().toISOString();
      const { data: updated, error: updateError } = await admin
        .from("face_analysis_runs")
        .update({ storage_path: null, image_deleted_at: deletedAt })
        .eq("id", run.id)
        .eq("storage_path", path)
        .is("image_deleted_at", null)
        .select("id")
        .maybeSingle();
      if (updateError) throw new Error(updateError.message);
      if (!updated) {
        results.push({ id: run.id, status: "skipped" });
        continue;
      }

      results.push({ id: run.id, status: "deleted" });
      await admin.from("face_analysis_events").insert({
        run_id: run.id,
        user_id: run.user_id,
        event_type: "image_cleanup_completed",
        metadata: { reason: "retention_expired", deleted_at: deletedAt }
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message.slice(0, 240) : "cleanup failed";
      // No object path or provider payload is written to events.
      await admin.from("face_analysis_events").insert({
        run_id: run.id,
        user_id: run.user_id,
        event_type: "image_cleanup_failed",
        metadata: { reason: "retention_expired", error: message }
      });
      results.push({ id: run.id, status: "failed" });
    }
  }

  const staleRuns = await sweepStaleRuns();

  return NextResponse.json({
    ok: true,
    cutoff,
    candidate_count: data?.length || 0,
    deleted_count: results.filter((item) => item.status === "deleted").length,
    skipped_count: results.filter((item) => item.status === "skipped").length,
    failed_count: results.filter((item) => item.status === "failed").length,
    results,
    stale_runs: staleRuns
  });
}

// 把走不下去的 run 收尾。沒有這段，中斷的任務會永遠留在「進行中」，
// 累積到上限後 POST /api/face-analysis/runs 會對該會員永久回 429。
async function sweepStaleRuns() {
  const admin = createSupabaseAdminClient();
  const now = Date.now();
  const minutesAgo = (minutes: number) => new Date(now - minutes * 60 * 1000).toISOString();

  const sweeps = [
    {
      key: "created_abandoned",
      // 建立了任務但照片從沒上傳成功（關分頁、斷線）。
      apply: () =>
        admin
          .from("face_analysis_runs")
          .update({ status: "expired", error_code: "RUN_ABANDONED" })
          .eq("status", "created")
          .lt("created_at", minutesAgo(FACE_RUN_STALE_CREATED_MINUTES))
          .select("id")
    },
    {
      key: "uploaded_expired",
      // 品質過了但沒有按下去產報告；圖片本身也已由上面的保存期限清理。
      // 錯誤碼跟 created 分開，後台品質通過率才算得出這筆「檢查過且通過」。
      apply: () =>
        admin
          .from("face_analysis_runs")
          .update({ status: "expired", error_code: "RUN_ABANDONED_AFTER_QUALITY" })
          .eq("status", "uploaded")
          .lt("updated_at", minutesAgo(FACE_RUN_STALE_PENDING_HOURS * 60))
          .select("id")
    },
    {
      key: "quality_rejected_expired",
      // 保留 QUALITY_REJECTED 錯誤碼，這是後台品質統計唯一的依據。
      apply: () =>
        admin
          .from("face_analysis_runs")
          .update({ status: "expired" })
          .eq("status", "quality_rejected")
          .lt("updated_at", minutesAgo(FACE_RUN_STALE_PENDING_HOURS * 60))
          .select("id")
    },
    {
      key: "analyzing_timeout",
      // analyze function 被 kill 時來不及自己標 failed，這裡照實補上。
      apply: () =>
        admin
          .from("face_analysis_runs")
          .update({ status: "failed", error_code: "ANALYSIS_TIMEOUT" })
          .eq("status", "analyzing")
          .lt("updated_at", minutesAgo(FACE_RUN_STALE_ANALYZING_MINUTES))
          .select("id")
    }
  ];

  const summary: Record<string, number | string> = {};
  for (const sweep of sweeps) {
    const { data: swept, error: sweepError } = await sweep.apply();
    if (sweepError) {
      summary[sweep.key] = `failed: ${sweepError.message.slice(0, 120)}`;
      continue;
    }
    summary[sweep.key] = swept?.length || 0;
  }
  return summary;
}

export async function GET(request: NextRequest) {
  return cleanup(request);
}

export async function POST(request: NextRequest) {
  return cleanup(request);
}
