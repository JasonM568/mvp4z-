import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FACE_ANALYSIS_BUCKET } from "@/lib/face-analysis/config";

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

  return NextResponse.json({
    ok: true,
    cutoff,
    candidate_count: data?.length || 0,
    deleted_count: results.filter((item) => item.status === "deleted").length,
    skipped_count: results.filter((item) => item.status === "skipped").length,
    failed_count: results.filter((item) => item.status === "failed").length,
    results
  });
}

export async function GET(request: NextRequest) {
  return cleanup(request);
}

export async function POST(request: NextRequest) {
  return cleanup(request);
}
