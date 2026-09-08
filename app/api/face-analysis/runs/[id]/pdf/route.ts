// 面相報告 PDF 下載。
//
// 產生策略：第一次下載時才產，產完存進儲存桶，之後直接回存檔。
// 不在分析完成當下就產——analyze 那條路徑已經在跟 maxDuration 賽跑，
// 多塞一個 PDF 產生只會提高「報告產好了卻因逾時被砍」的風險，
// 而 PDF 隨時可以重產，報告不能。
//
// 儲存桶是 private 且沒有 client policy，瀏覽器碰不到，
// 一律經過這條路由驗 bearer token 與擁有權後才回傳位元組。

import { NextRequest } from "next/server";
import { apiJson } from "@/app/api/_helpers";
import { errorMessage, errorStatus, requireBearerProfile, statusError } from "@/lib/auth/member";
import { getOwnedRun } from "@/lib/face-analysis/runs";
import { renderFaceReportPdf } from "@/lib/face-analysis/pdf";
import { buildFacePdfPath, fetchStoredFacePdf, storeFacePdf } from "@/lib/face-analysis/storage";
import { isFaceAnalysisEnabled } from "@/lib/face-analysis/config";

export const runtime = "nodejs";
// 產生一份約 120KB 的 PDF 實測 60ms，但冷啟動要讀 5.4MB 字型；給足餘裕。
export const maxDuration = 30;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!isFaceAnalysisEnabled()) throw statusError("面相分析功能尚未開放", 404);
    const { profile } = await requireBearerProfile(request);
    const { id } = await context.params;

    // getOwnedRun 已經綁 user_id，別人的報告在這裡就查不到。
    const run = await getOwnedRun(profile.id, id);
    if (!run) throw statusError("找不到這份報告", 404);
    if (run.status !== "completed") {
      throw statusError("這份分析尚未完成，沒有可下載的報告", 409);
    }

    const path = buildFacePdfPath(profile.id, run.id);

    // 已存檔就直接回。重產一次也不會錯，只是白花時間。
    let bytes = await fetchStoredFacePdf(path);

    if (!bytes) {
      bytes = await renderFaceReportPdf({
        runId: run.id,
        mode: run.mode,
        completedAt: run.completed_at,
        createdAt: run.created_at,
        memberName: profile.name || profile.email || "會員",
        report: (run.report_structured as Record<string, unknown> | null) || null,
        reportText: run.report_text
      });

      // 存檔失敗不該讓會員拿不到檔案——他要的是這份 PDF，不是快取。
      try {
        await storeFacePdf(path, bytes);
      } catch (storeError) {
        console.warn("[face-pdf] 存檔失敗，本次仍直接回傳", { runId: run.id, storeError });
      }
    }

    const filename = `xunfeng-face-report-${run.id.slice(0, 8)}.pdf`;
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // attachment：手機瀏覽器才會直接下載而不是開在分頁裡再要求另存。
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}
