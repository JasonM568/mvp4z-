import { NextRequest } from "next/server";
import { apiJson } from "@/app/api/_helpers";
import {
  errorMessage,
  errorStatus,
  readJson,
  requireBearerProfile,
  statusError
} from "@/lib/auth/member";
import { createRun } from "@/lib/face-analysis/runs";
import { createFaceRunSchema } from "@/lib/face-analysis/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canUseFaceAnalysis } from "@/lib/auth/face-tier";
import {
  FACE_ANALYSIS_CONSENT_VERSION,
  FACE_RUN_OPEN_LIMIT,
  FACE_RUN_OPEN_WINDOW_MINUTES,
  FACE_RUN_OPEN_WINDOW_MS,
  isFaceAnalysisEnabled
} from "@/lib/face-analysis/config";

export const runtime = "nodejs";

const PUBLIC_LIST_FIELDS =
  "id, request_id, mode, subject_age, status, report_structured, report_text, credits_charged, image_deleted_at, completed_at, created_at, updated_at";

export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireBearerProfile(request);
    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 20)));
    const cursor = decodeCursor(request.nextUrl.searchParams.get("cursor"));
    const admin = createSupabaseAdminClient();
    let query = admin
      .from("face_analysis_runs")
      .select(PUBLIC_LIST_FIELDS)
      .eq("user_id", profile.id)
      .in("status", ["completed", "failed"])
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (cursor) query = query.lt("created_at", cursor);

    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);
    return apiJson({
      ok: true,
      items,
      nextCursor: hasMore && last?.created_at ? encodeCursor(String(last.created_at)) : null
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isFaceAnalysisEnabled()) throw statusError("面相分析功能尚未開放", 404);
    const { profile } = await requireBearerProfile(request);
    const input = await readJson(request, createFaceRunSchema);
    if (input.consentVersion !== FACE_ANALYSIS_CONSENT_VERSION) {
      throw statusError("隱私同意版本已更新，請重新整理頁面後再試", 400);
    }
    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // 品質檢查是免費流程：只驗證方案有效，不限制剩餘點數。
    const { data: entitlements, error: entitlementError } = await admin
      .from("member_entitlements")
      .select("id, expires_at, plans(code)")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .gte("expires_at", now)
      .order("expires_at", { ascending: false })
      .limit(10);

    if (entitlementError) throw entitlementError;

    const entitlement = (entitlements || []).find((item) => {
      const plan = Array.isArray(item.plans) ? item.plans[0] : item.plans;
      return Boolean(plan?.code && canUseFaceAnalysis(plan.code));
    });

    if (!entitlement) {
      throw statusError("會員尚未啟用可使用面相分析的方案，或方案已到期", 403);
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // 併發保護只看「現在真的在跑的任務」：
    // - quality_rejected 不算，那是死路（照片沒過），會員唯一的出路就是換一張開新任務；
    //   把它算進來等於品質檢查失敗三次就永久鎖住帳號。
    // - 加時間窗，避免關掉分頁留下的 created / uploaded 永久累加。
    const openWindowStart = new Date(Date.now() - FACE_RUN_OPEN_WINDOW_MS).toISOString();
    const [{ count: recentCount, error: recentError }, { data: openRuns, error: openError }] =
      await Promise.all([
        admin
          .from("face_analysis_runs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .gte("created_at", hourAgo),
        admin
          .from("face_analysis_runs")
          .select("created_at, request_id")
          .eq("user_id", profile.id)
          .in("status", ["created", "uploaded", "analyzing"])
          .gte("created_at", openWindowStart)
          .order("created_at", { ascending: true })
          .limit(FACE_RUN_OPEN_LIMIT)
      ]);
    if (recentError) throw recentError;
    if (openError) throw openError;
    if ((recentCount || 0) >= 10) throw statusError("操作過於頻繁，請稍後再試", 429);
    // 同一個 requestId 是前端重送（createRun 本來就會回同一筆），不該被自己擋下。
    const isRetry = (openRuns || []).some((row) => row.request_id === input.requestId);
    if (!isRetry && (openRuns?.length || 0) >= FACE_RUN_OPEN_LIMIT) {
      throw statusError(openRunsMessage(openRuns?.[0]?.created_at), 429);
    }

    const run = await createRun({
      profileId: profile.id,
      entitlementId: entitlement.id,
      request: {
        ...input,
        subjectAge: input.subjectAge ?? null,
        thirdPartyConsent: input.thirdPartyConsent ?? false,
        collaborationAssessment: input.collaborationAssessment ?? false,
        collaborationProject: input.collaborationProject ?? null
      }
    });

    return apiJson({ ok: true, runId: run.id, status: run.status }, 201);
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

// 被擋下時要講得出「還要等多久」，否則會員只看得到一句沒有出口的錯誤訊息。
function openRunsMessage(oldestCreatedAt?: string | null) {
  const base = `目前有 ${FACE_RUN_OPEN_LIMIT} 個分析任務正在進行`;
  const startedAt = oldestCreatedAt ? Date.parse(oldestCreatedAt) : NaN;
  if (Number.isNaN(startedAt)) {
    return `${base}，請等最舊的一筆結束（最多 ${FACE_RUN_OPEN_WINDOW_MINUTES} 分鐘）後再建立新的。`;
  }
  const waitMinutes = Math.max(
    1,
    Math.ceil((startedAt + FACE_RUN_OPEN_WINDOW_MS - Date.now()) / 60000)
  );
  return `${base}，請完成後再建立新的；若前一次中途離開，約 ${waitMinutes} 分鐘後會自動釋放。`;
}

function encodeCursor(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeCursor(value: string | null) {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    return Number.isNaN(Date.parse(decoded)) ? null : decoded;
  } catch {
    return null;
  }
}
