import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const COURSE_CODE = "zhangzhongjue-115-01";

const patchSchema = z.object({
  title: z.string().trim().min(1, "請填寫課程名稱").max(200),
  subtitle: z.string().trim().max(200),
  description: z.string().trim().max(2000),
  course_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "請選擇正確的上課日期"),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "開始時間格式錯誤"),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "結束時間格式錯誤"),
  location: z.string().trim().max(500),
  price_new: z.coerce.number().int().min(0).max(10_000_000),
  price_returning: z.coerce.number().int().min(0).max(10_000_000)
}).superRefine((value, context) => {
  const [year, month, day] = value.course_date.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["course_date"], message: "請選擇正確的上課日期" });
  }
});

const select = "id, code, title, subtitle, description, course_date, starts_at, ends_at, location, price_new, price_returning, currency, is_active, updated_at";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { data, error } = await createSupabaseAdminClient()
      .from("course_products")
      .select(select)
      .eq("code", COURSE_CODE)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw statusError("找不到報名課程設定", 404);
    return apiJson({ ok: true, course: data });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    const input = patchSchema.parse(await request.json().catch(() => ({})));
    const startsAt = taipeiIso(input.course_date, input.start_time);
    const endsAt = taipeiIso(input.course_date, input.end_time);
    if (Date.parse(endsAt) <= Date.parse(startsAt)) throw statusError("結束時間必須晚於開始時間", 400);

    const { start_time: _startTime, end_time: _endTime, ...fields } = input;
    const { data, error } = await createSupabaseAdminClient()
      .from("course_products")
      .update({ ...fields, subtitle: input.subtitle || null, description: input.description || null, location: input.location || null, starts_at: startsAt, ends_at: endsAt })
      .eq("code", COURSE_CODE)
      .select(select)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw statusError("找不到報名課程設定", 404);

    await writeAdminAudit({
      adminUserId: auth.profile?.id,
      action: "course_product.update",
      targetType: "course_products",
      targetId: data.id,
      metadata: { code: data.code, course_date: data.course_date, starts_at: data.starts_at, ends_at: data.ends_at }
    });
    return apiJson({ ok: true, course: data });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

function taipeiIso(date: string, time: string) {
  const value = `${date}T${time}:00+08:00`;
  if (Number.isNaN(Date.parse(value))) throw statusError("課程日期或時間格式錯誤", 400);
  return value;
}
