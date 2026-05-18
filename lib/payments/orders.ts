import { z } from "zod";

export const createOrderSchema = z.object({
  plan_id: z.string().uuid("方案格式錯誤").optional(),
  plan_code: z.string().trim().min(1, "請選擇方案").optional()
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
