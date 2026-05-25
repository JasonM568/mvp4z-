import { z } from "zod";

// 結帳時收集的發票買受人資訊。
// 個人發票支援 Email 雲端、手機條碼、捐贈碼；公司發票支援統編三聯式。
export const invoiceRequestSchema = z.object({
  buyer_type: z.enum(["personal", "company"]),
  buyer_name: z.string().trim().min(1, "請填寫抬頭").max(60),
  buyer_id: z.string().trim().regex(/^\d{8}$/, "統一編號為 8 碼數字").nullable().optional(),
  buyer_email: z.string().trim().email("Email 格式錯誤").nullable().optional(),
  carrier_type: z.enum(["none", "cellphone", "citizen_digital", "ecpay_member"]).default("none"),
  carrier_num: z.string().trim().nullable().optional(),
  donation_code: z.string().trim().regex(/^\d{4,7}$/, "捐贈碼為 4-7 碼數字").nullable().optional()
}).refine(
  (v) => v.buyer_type === "personal" || (v.buyer_id && /^\d{8}$/.test(v.buyer_id)),
  { message: "公司發票必須填統一編號 8 碼", path: ["buyer_id"] }
).refine(
  (v) => v.carrier_type !== "cellphone" || (v.carrier_num && /^\/[0-9A-Z.+-]{7}$/i.test(v.carrier_num)),
  { message: "手機條碼需為 / 開頭加 7 碼英數符號", path: ["carrier_num"] }
).refine(
  (v) => !v.donation_code || v.buyer_type === "personal",
  { message: "捐贈碼僅支援個人發票", path: ["donation_code"] }
);

export type InvoiceRequest = z.infer<typeof invoiceRequestSchema>;

export const createOrderSchema = z.object({
  plan_id: z.string().uuid("方案格式錯誤").optional(),
  plan_code: z.string().trim().min(1, "請選擇方案").optional(),
  invoice_request: invoiceRequestSchema.optional()
}).refine((value) => value.plan_id || value.plan_code, {
  message: "請選擇方案"
});

export type Plan = {
  id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  credits: number;
  duration_days: number;
  is_active: boolean;
};

export type OrderWithPlan = {
  id: string;
  order_no: string;
  user_id: string;
  plan_id: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  provider_trade_no: string | null;
  paid_at: string | null;
  created_at: string;
  plans: Plan | null;
};

export function normalizeAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("付款金額格式錯誤");
  return Math.round(amount);
}

export function normalizeOrderWithPlan(order: unknown) {
  const value = order as Omit<OrderWithPlan, "plans"> & { plans?: Plan | Plan[] | null };
  return {
    ...value,
    plans: Array.isArray(value.plans) ? value.plans[0] || null : value.plans || null
  } as OrderWithPlan;
}
