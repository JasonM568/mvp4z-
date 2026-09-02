import { NextResponse } from "next/server";
import {
  readCoursePromo,
  readPublishedContent,
  type CaseItem,
  type CourseItem,
  type ServiceItem
} from "@/lib/site/content";

// 前台公開內容：不需登入，只吐「已上架」的項目。
// CDN 快取 30 秒（背景再驗證 5 分鐘）——後台按下上架後最多半分鐘就會全面生效，
// 又不會讓每一次瀏覽都打一次 DB。
export const dynamic = "force-dynamic";

const CACHE_CONTROL = "public, s-maxage=30, stale-while-revalidate=300";

export async function GET() {
  try {
    const [services, cases, courses, coursePromo] = await Promise.all([
      readPublishedContent<ServiceItem>("services"),
      readPublishedContent<CaseItem>("cases"),
      readPublishedContent<CourseItem>("courses"),
      readCoursePromo()
    ]);

    return NextResponse.json(
      { ok: true, services, cases, courses, coursePromo },
      { headers: { "Cache-Control": CACHE_CONTROL } }
    );
  } catch (error) {
    // 前台不該因為後端問題整頁空白：回 ok:false，讓 cms-render.js 自己退回靜態 JSON。
    console.error("[site-content] 讀取失敗", error);
    return NextResponse.json(
      { ok: false, services: [], cases: [], courses: [], coursePromo: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
