import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "@/app/api/_helpers";
import { requireNamedAdmin } from "@/lib/auth/admin";
import { errorBody, errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * 後台退款（半自動，第一階段）。
 *
 * 綠界的信用卡請退款 API 沒有測試環境，第一次驗證只能拿正式交易做，
 * 所以這一版**不呼叫綠界**：實際退款由管理員到綠界後台操作，
 * 這支 API 負責事前試算與事後登錄（點數回收、訂單狀態、課程報名狀態一次寫完）。
 *
 * GET  ：退款試算，唯讀，給 UI 在按下確認前顯示數字。
 * POST ：登錄一筆已在綠界完成的退款。
 *
 * 只允許具名管理員 —— 用共用 ADMIN_KEY 的話 audit log 記不到是誰按的，
 * 這種財務動作不能容忍。
 */

const refundSchema = z.object({
  amount: z.number().int().positive("退款金額必須大於 0"),
  idempotency_key: z.string().uuid("退款請求識別碼格式錯誤"),
  reason: z.string().trim().min(2, "請填寫退款原因").max(500),
  provider_reference: z.string().trim().max(200).optional().default(""),
  // UI 的二次確認：管理員必須先在綠界後台完成實際退款，才來這裡登錄。
  confirmed_in_ecpay: z.literal(true, {
    errorMap: () => ({ message: "請先在綠界後台完成實際退款，並勾選確認" })
  })
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireNamedAdmin(request);
    const { id } = await context.params;
    const admin = createSupabaseAdminClient();

    const { data, error } = await admin.rpc("preview_order_refund", { p_order_id: id });
    if (error) throw error;
    const preview = Array.isArray(data) ? data[0] : data;
    if (!preview) throw statusError("找不到訂單", 404);

    const { data: history, error: historyError } = await admin
      .from("refunds")
      .select("id, kind, amount, credits_expected, credits_reclaimed, credits_shortfall, reason, provider_reference, admin_email, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false });
    if (historyError) throw historyError;

    return apiJson({ ok: true, preview, refunds: history || [] });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { profile } = await requireNamedAdmin(request);
    if (!profile) throw statusError("需要具名管理員", 403);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const input = refundSchema.parse(body);

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("commit_manual_refund", {
      p_order_id: id,
      p_admin_profile_id: profile.id,
      p_admin_email: profile.email,
      p_amount: input.amount,
      p_reason: input.reason,
      p_provider_reference: input.provider_reference || null,
      p_idempotency_key: input.idempotency_key
    });
    if (error) {
      const message = String(error.message || "");
      if (message.includes("REFUND_IDEMPOTENCY_CONFLICT")) {
        throw Object.assign(new Error("此退款請求識別碼已用於不同內容，請確認既有退款紀錄"), {
          status: 409,
          code: "REFUND_IDEMPOTENCY_CONFLICT"
        });
      }
      if (message.includes("REFUND_AMOUNT_EXCEEDS_REMAINING")) {
        throw Object.assign(new Error("退款金額超過訂單剩餘可退金額"), {
          status: 400,
          code: "REFUND_AMOUNT_EXCEEDS_REMAINING"
        });
      }
      if (message.includes("REFUND_ALREADY_FULLY_REFUNDED")) {
        throw Object.assign(new Error("此訂單已全額退款"), {
          status: 409,
          code: "REFUND_ALREADY_FULLY_REFUNDED"
        });
      }
      if (message.includes("REFUND_ORDER_STATUS_CONFLICT")) {
        throw Object.assign(new Error("此訂單狀態不允許退款"), {
          status: 409,
          code: "REFUND_ORDER_STATUS_CONFLICT"
        });
      }
      if (message.includes("REFUND_ORDER_NOT_FOUND")) {
        throw statusError("找不到訂單", 404);
      }
      throw error;
    }

    const result = (Array.isArray(data) ? data[0] : data) as
      | { refund_id: string; order_status: string; credits_expected: number; credits_reclaimed: number; credits_shortfall: number; idempotent_replay: boolean }
      | undefined;
    if (!result) throw new Error("commit_manual_refund 沒有回傳結果");
    return apiJson({ ok: true, ...result });
  } catch (error) {
    return apiJson(errorBody(error), errorStatus(error));
  }
}
