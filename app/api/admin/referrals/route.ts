import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import { requireAdmin } from "@/lib/auth/admin";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { escapeLikePattern, REFERRAL_CODE_PATTERN } from "@/lib/referral/attribution";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type OrderRow = {
  id: string;
  order_no: string;
  order_type: string | null;
  item_name: string | null;
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  referral_partner_id: string | null;
  referral_rate: number | null;
  profiles?: { name: string | null; email: string | null; phone: string | null } | null;
  plans?: { name: string | null } | null;
};

const ORDER_FIELDS =
  "id, order_no, order_type, item_name, amount, currency, status, paid_at, created_at, referral_partner_id, referral_rate, profiles(name, email, phone), plans(name)";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const admin = createSupabaseAdminClient();
    const partnerId = new URL(request.url).searchParams.get("partner");

    const { data: partners, error: partnersError } = await admin
      .from("referral_partners")
      .select("id, code, name, contact, commission_rate, note, is_active, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (partnersError) throw partnersError;

    // 單一業務：回完整訂單明細。
    if (partnerId) {
      const partner = (partners || []).find((row) => row.id === partnerId);
      if (!partner) throw statusError("找不到這位推廣夥伴", 404);

      const { data: orders, error: ordersError } = await admin
        .from("orders")
        .select(ORDER_FIELDS)
        .eq("referral_partner_id", partnerId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (ordersError) throw ordersError;

      const { count: signups } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .ilike("referral_code", escapeLikePattern(partner.code));

      const rows = normalizeOrders(orders);
      return apiJson({
        ok: true,
        partner,
        stats: summarize(rows, Number(partner.commission_rate || 0), signups || 0),
        orders: rows.map((order) => ({
          ...order,
          display_name: displayName(order),
          commission: commissionOf(order, Number(partner.commission_rate || 0))
        }))
      });
    }

    // 列表：一次撈回所有已歸因訂單，在記憶體內分組統計。
    const { data: orders, error: ordersError } = await admin
      .from("orders")
      .select("id, order_no, amount, status, paid_at, created_at, referral_partner_id, referral_rate")
      .not("referral_partner_id", "is", null)
      .limit(5000);
    if (ordersError) throw ordersError;

    const { data: signupRows, error: signupError } = await admin
      .from("profiles")
      .select("referral_code")
      .not("referral_code", "is", null)
      .limit(5000);
    if (signupError) throw signupError;

    const signupsByCode = new Map<string, number>();
    for (const row of signupRows || []) {
      const key = String(row.referral_code || "").toLowerCase();
      signupsByCode.set(key, (signupsByCode.get(key) || 0) + 1);
    }

    const byPartner = new Map<string, OrderRow[]>();
    for (const order of normalizeOrders(orders)) {
      const key = String(order.referral_partner_id);
      const bucket = byPartner.get(key) || [];
      bucket.push(order);
      byPartner.set(key, bucket);
    }

    return apiJson({
      ok: true,
      partners: (partners || []).map((partner) => ({
        ...partner,
        stats: summarize(
          byPartner.get(partner.id) || [],
          Number(partner.commission_rate || 0),
          signupsByCode.get(String(partner.code).toLowerCase()) || 0
        )
      }))
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const code = String(body.code || "").trim();
    const name = String(body.name || "").trim();
    if (!REFERRAL_CODE_PATTERN.test(code)) {
      throw statusError("推廣代碼只能使用英數字、底線與連字號，長度 2-32", 400);
    }
    if (!name) throw statusError("請填寫業務名稱", 400);

    const rate = normalizeRate(body.commission_rate);
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("referral_partners")
      .insert({
        code,
        name,
        contact: String(body.contact || "").trim(),
        commission_rate: rate,
        note: String(body.note || "").trim()
      })
      .select("id, code, name, contact, commission_rate, note, is_active, created_at")
      .single();

    if (error) {
      if (String(error.code) === "23505") throw statusError("這組推廣代碼已經有人用了", 409);
      throw error;
    }
    return apiJson({ ok: true, partner: data });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    if (!id) throw statusError("缺少 partner id", 400);

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.contact !== undefined) patch.contact = String(body.contact).trim();
    if (body.note !== undefined) patch.note = String(body.note).trim();
    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
    if (body.commission_rate !== undefined) patch.commission_rate = normalizeRate(body.commission_rate);
    if (Object.keys(patch).length === 0) throw statusError("沒有要更新的欄位", 400);

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("referral_partners")
      .update(patch)
      .eq("id", id)
      .select("id, code, name, contact, commission_rate, note, is_active, created_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw statusError("找不到這位推廣夥伴", 404);
    return apiJson({ ok: true, partner: data });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

/**
 * Supabase 的 join 欄位會回成陣列（即使是 to-one 關聯），這裡統一攤平成單一物件，
 * 讓後面的統計與輸出不必到處判斷是陣列還是物件。
 */
function normalizeOrders(rows: unknown): OrderRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const order = row as Record<string, unknown>;
    return {
      ...order,
      profiles: firstOrNull(order.profiles),
      plans: firstOrNull(order.plans)
    } as OrderRow;
  });
}

function firstOrNull<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return (value as T) ?? null;
}

function normalizeRate(value: unknown) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw statusError("分潤比例需為 0 到 1 之間的小數，例如 0.2 代表 20%", 400);
  }
  return Math.round(rate * 10000) / 10000;
}

/** 分潤一律以「成單當下的比例快照」計算；沒有快照的舊資料才退回目前設定值。 */
function commissionOf(order: { amount: number; status: string; referral_rate: number | null }, fallbackRate: number) {
  if (order.status !== "paid") return 0;
  const rate = order.referral_rate === null || order.referral_rate === undefined ? fallbackRate : Number(order.referral_rate);
  return Math.round(Number(order.amount || 0) * rate);
}

function summarize(orders: OrderRow[], fallbackRate: number, signups: number) {
  const paid = orders.filter((order) => order.status === "paid");
  return {
    signups,
    orders_total: orders.length,
    orders_paid: paid.length,
    revenue_paid: paid.reduce((sum, order) => sum + Number(order.amount || 0), 0),
    commission_paid: paid.reduce((sum, order) => sum + commissionOf(order, fallbackRate), 0),
    last_order_at: orders.reduce<string | null>(
      (latest, order) => (!latest || order.created_at > latest ? order.created_at : latest),
      null
    )
  };
}

function displayName(order: OrderRow) {
  return order.plans?.name || order.item_name || (order.order_type === "course" ? "課程報名" : "會員方案");
}
