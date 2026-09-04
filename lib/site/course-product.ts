import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// /courses Landing Page 與報名表共用的「報名商品」。
// 目前只有一個固定商品代碼；之後要賣多門課時，把 code 改成參數即可。
export const ACTIVE_COURSE_CODE = "zhangzhongjue-115-01";

export type CourseProduct = {
  code: string;
  title: string;
  subtitle: string;
  description: string;
  course_date: string;
  starts_at: string;
  ends_at: string;
  location: string;
  price_new: number;
  price_returning: number;
  currency: string;
};

export async function readActiveCourseProduct(): Promise<CourseProduct | null> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("course_products")
      .select("code, title, subtitle, description, course_date, starts_at, ends_at, location, price_new, price_returning, currency")
      .eq("code", ACTIVE_COURSE_CODE)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      code: String(data.code),
      title: String(data.title || ""),
      subtitle: String(data.subtitle || ""),
      description: String(data.description || ""),
      course_date: String(data.course_date || ""),
      starts_at: String(data.starts_at || ""),
      ends_at: String(data.ends_at || ""),
      location: String(data.location || ""),
      price_new: Number(data.price_new || 0),
      price_returning: Number(data.price_returning || 0),
      currency: String(data.currency || "TWD")
    };
  } catch (error) {
    console.error("[course-product] 讀取失敗", error);
    return null;
  }
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 2026-10-17 → 10/17（六）；withYear 時 → 2026/10/17（六） */
export function formatCourseDate(courseDate: string, withYear = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(courseDate || "");
  if (!m) return courseDate || "";
  const [, y, mo, d] = m;
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay()];
  return `${withYear ? `${y}/` : ""}${Number(mo)}/${Number(d)}（${weekday}）`;
}

export function formatTaipeiTime(iso: string) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function formatPrice(amount: number) {
  return `NT$${Math.round(amount).toLocaleString("en-US")}`;
}

/** 距開課天數（以台北日期計）；已過期回負數。 */
export function daysUntilCourse(courseDate: string, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(courseDate || "");
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const todayTaipei = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayTaipei);
  if (!t) return null;
  const today = Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3]));
  return Math.round((target - today) / 86_400_000);
}
