import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../_helpers";
import { errorMessage, errorStatus, readJson, statusError } from "@/lib/auth/member";
import { createCheckoutParams, createMerchantTradeNo, ecpayActionUrl } from "@/lib/payments/ecpay";
import { invoiceRequestSchema, normalizeAmount } from "@/lib/payments/orders";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const courseCheckoutSchema = z.object({
  course_code: z.string().trim().min(1).default("zhangzhongjue-115-01"),
  registration_type: z.enum(["new", "returning"]),
  name: z.string().trim().min(1, "請填寫姓名").max(80),
  gender: z.string().trim().max(20).optional().nullable(),
  phone: z.string().trim().min(6, "請填寫聯絡電話").max(40),
  line_id: z.string().trim().max(80).optional().nullable(),
  email: z.string().trim().email("Email 格式錯誤").transform((v) => v.toLowerCase()),
  learning_background: z.string().trim().max(80).optional().nullable(),
  interests: z.array(z.string().trim().max(40)).max(12).default([]),
  motivation: z.string().trim().max(1000).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  invoice_request: invoiceRequestSchema
});

export async function GET() {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("course_products")
      .select("code, title, subtitle, description, course_date, starts_at, ends_at, location, price_new, price_returning, currency")
      .eq("code", "zhangzhongjue-115-01")
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw statusError("目前沒有可報名的課程", 404);

    return apiJson({ ok: true, course: data });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await readJson(request, courseCheckoutSchema);
    const admin = createSupabaseAdminClient();

    const { data: course, error: courseError } = await admin
      .from("course_products")
      .select("id, code, title, subtitle, price_new, price_returning, currency, is_active")
      .eq("code", input.course_code)
      .eq("is_active", true)
      .maybeSingle();

    if (courseError) throw courseError;
    if (!course) throw statusError("目前沒有可報名的課程", 404);
    if (course.currency !== "TWD") throw statusError("綠界付款目前僅支援 TWD", 400);

    const amount = normalizeAmount(input.registration_type === "returning" ? course.price_returning : course.price_new);
    const itemName = `${course.title}${course.subtitle ? ` ${course.subtitle}` : ""} ${input.registration_type === "returning" ? "複訓" : "新生"} ${amount}元`;

    const profile = await findOrCreateCourseProfile(admin, {
      email: input.email,
      name: input.name,
      phone: input.phone
    });

    const orderNo = createMerchantTradeNo();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        order_no: orderNo,
        user_id: profile.id,
        plan_id: null,
        order_type: "course",
        course_product_id: course.id,
        item_name: itemName,
        amount,
        currency: course.currency,
        status: "pending",
        provider: "ecpay",
        invoice_request: input.invoice_request
      })
      .select("id, order_no, amount, currency, status, created_at")
      .single();

    if (orderError) throw orderError;

    const { error: registrationError } = await admin
      .from("course_registrations")
      .insert({
        order_id: order.id,
        user_id: profile.id,
        course_product_id: course.id,
        status: "pending",
        registration_type: input.registration_type,
        amount,
        currency: course.currency,
        name: input.name,
        gender: input.gender || null,
        phone: input.phone,
        line_id: input.line_id || null,
        email: input.email,
        learning_background: input.learning_background || null,
        interests: input.interests || [],
        motivation: input.motivation || null,
        note: input.note || null
      });

    if (registrationError) throw registrationError;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const clientBackUrl = siteUrl ? `${siteUrl.replace(/\/$/, "")}/courses#courseCheckout` : undefined;
    const checkoutParams = createCheckoutParams({
      merchantTradeNo: orderNo,
      totalAmount: amount,
      itemName,
      tradeDesc: "Xunfeng Course",
      clientBackUrl
    });

    return apiJson({
      ok: true,
      order,
      checkout: {
        action: ecpayActionUrl(),
        method: "POST",
        params: checkoutParams
      }
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

async function findOrCreateCourseProfile(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  input: { email: string; name: string; phone: string }
) {
  const { data: existing, error: findError } = await admin
    .from("profiles")
    .select("id, name, phone")
    .eq("email", input.email)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) {
    const { data: updated, error: updateError } = await admin
      .from("profiles")
      .update({
        name: existing.name || input.name,
        phone: existing.phone || input.phone,
        updated_at: new Date().toISOString()
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (updateError) throw updateError;
    return updated;
  }

  const { data: created, error: createError } = await admin
    .from("profiles")
    .insert({
      email: input.email,
      name: input.name,
      phone: input.phone,
      role: "member"
    })
    .select("id")
    .single();

  if (createError) throw createError;
  return created;
}
