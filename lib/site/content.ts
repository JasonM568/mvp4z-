// 網站內容（老師服務／案例實績／課程講座／主打課程推廣）的單一資料源。
//
// 讀取順序：Supabase → content/*.json。
// DB 是後台可編輯的正本；JSON 只是 fallback，讓資料表還沒建、環境變數沒帶到或 DB 暫時掛掉時，
// 前台仍然顯示搬遷當下的內容而不是一片空白。fallback 觸發時會在 server log 留下原因。

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ServiceItem = {
  id?: string;
  title: string;
  category: string;
  price: string;
  note: string;
  description: string;
  href?: string;
};

export type CaseItem = {
  id?: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  image?: string;
};

export type CourseItem = {
  id?: string;
  title: string;
  audience: string;
  description: string;
  image?: string;
  schedule?: string;
  location?: string;
  price_text?: string;
  href?: string;
};

export type CoursePromo = {
  active: boolean;
  publishStart: string;
  publishEnd: string;
  label: string;
  title: string;
  titleSuffix: string;
  headline: string;
  subheadline: string;
  body: string;
  highlights: string;
  limitedText: string;
  ctaText: string;
  registerUrl: string;
  lineCtaText: string;
  posterMain: string;
  posterSecond: string;
  posterThird: string;
  videoCover: string;
  videoOne: string;
  videoOneTitle: string;
  videoTwo: string;
  videoTwoTitle: string;
  notice: string;
};

export type SiteContentType = "services" | "cases" | "courses";

export const CONTENT_TABLES: Record<SiteContentType, string> = {
  services: "site_services",
  cases: "site_cases",
  courses: "site_courses"
};

export const PROMO_TABLE = "site_course_promo";
export const PROMO_ID = "default";

/** 每種內容可編輯的欄位。後台送進來的 payload 只會採用這裡列到的 key。 */
export const CONTENT_FIELDS: Record<SiteContentType, string[]> = {
  services: ["title", "category", "price", "note", "description", "href"],
  cases: ["title", "category", "summary", "body", "image"],
  courses: ["title", "audience", "description", "image", "schedule", "location", "price_text", "href"]
};

export const PROMO_FIELDS = [
  "active", "publish_start", "publish_end", "label", "title", "title_suffix",
  "headline", "subheadline", "body", "highlights", "limited_text", "cta_text",
  "register_url", "line_cta_text", "poster_main", "poster_second", "poster_third",
  "video_cover", "video_one", "video_one_title", "video_two", "video_two_title", "notice"
] as const;

const SELECT: Record<SiteContentType, string> = {
  services: "id, title, category, price, note, description, href, is_published, sort_order, updated_at",
  cases: "id, title, category, summary, body, image, is_published, sort_order, updated_at",
  courses:
    "id, title, audience, description, image, schedule, location, price_text, href, is_published, sort_order, updated_at"
};

const CONTENT_DIR = path.join(process.cwd(), "content");

/** 資料表還沒建（42P01）或 Supabase 環境變數沒帶到時，都當成「還沒搬遷」而不是壞掉。 */
function isMissingTable(error: unknown) {
  return Boolean(error && typeof error === "object" && String((error as { code?: string }).code) === "42P01");
}

async function readJsonFallback<T>(file: string, key: string): Promise<T[]> {
  try {
    const raw = await readFile(path.join(CONTENT_DIR, file), "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const list = data?.[key];
    return Array.isArray(list) ? (list as T[]) : [];
  } catch {
    return [];
  }
}

const FALLBACK_FILES: Record<SiteContentType, { file: string; key: string }> = {
  services: { file: "services.json", key: "services" },
  cases: { file: "cases.json", key: "cases" },
  courses: { file: "courses.json", key: "courses" }
};

/**
 * 前台用：只回已上架的項目，依 sort_order 排列。
 * DB 讀不到或一筆都沒有時，退回 content/*.json，讓網站永遠有東西可顯示。
 */
export async function readPublishedContent<T>(type: SiteContentType): Promise<T[]> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from(CONTENT_TABLES[type])
      .select(SELECT[type])
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      if (!isMissingTable(error)) console.warn(`[site-content] ${type} 讀取失敗，改用 JSON fallback：`, error.message);
      throw error;
    }
    if (data && data.length) return data as T[];
  } catch {
    // 落到下面的 JSON fallback
  }
  const fallback = FALLBACK_FILES[type];
  return readJsonFallback<T>(fallback.file, fallback.key);
}

/** 後台用：含未上架項目，並保留 is_published / sort_order 供介面操作。 */
export async function readAllContent(type: SiteContentType) {
  const { data, error } = await createSupabaseAdminClient()
    .from(CONTENT_TABLES[type])
    .select(SELECT[type])
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  // Supabase 的型別是從 generated types 推出來的，這幾張新表不在裡面，統一當成一般紀錄處理。
  return (data || []) as unknown as Record<string, unknown>[];
}

/** DB 的 snake_case 欄位轉成前台 cms-render.js 既有的 camelCase 介面。 */
export function toPromoPayload(row: Record<string, unknown> | null): CoursePromo | null {
  if (!row) return null;
  const text = (key: string) => String(row[key] ?? "");
  return {
    active: Boolean(row.active),
    publishStart: row.publish_start ? String(row.publish_start) : "",
    publishEnd: row.publish_end ? String(row.publish_end) : "",
    label: text("label"),
    title: text("title"),
    titleSuffix: text("title_suffix"),
    headline: text("headline"),
    subheadline: text("subheadline"),
    body: text("body"),
    highlights: text("highlights"),
    limitedText: text("limited_text"),
    ctaText: text("cta_text"),
    registerUrl: text("register_url"),
    lineCtaText: text("line_cta_text"),
    posterMain: text("poster_main"),
    posterSecond: text("poster_second"),
    posterThird: text("poster_third"),
    videoCover: text("video_cover"),
    videoOne: text("video_one"),
    videoOneTitle: text("video_one_title"),
    videoTwo: text("video_two"),
    videoTwoTitle: text("video_two_title"),
    notice: text("notice")
  };
}

export async function readCoursePromo(): Promise<CoursePromo | null> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from(PROMO_TABLE)
      .select("*")
      .eq("id", PROMO_ID)
      .maybeSingle();
    if (error) throw error;
    if (data) return toPromoPayload(data as Record<string, unknown>);
  } catch {
    // 落到 JSON fallback
  }
  try {
    const raw = await readFile(path.join(CONTENT_DIR, "course_promo.json"), "utf8");
    return JSON.parse(raw) as CoursePromo;
  } catch {
    return null;
  }
}

export function groupServicesByCategory(services: ServiceItem[]): Record<string, ServiceItem[]> {
  const order: string[] = [];
  const map: Record<string, ServiceItem[]> = {};
  for (const service of services) {
    if (!map[service.category]) {
      map[service.category] = [];
      order.push(service.category);
    }
    map[service.category].push(service);
  }
  return order.reduce<Record<string, ServiceItem[]>>((acc, key) => {
    acc[key] = map[key];
    return acc;
  }, {});
}
