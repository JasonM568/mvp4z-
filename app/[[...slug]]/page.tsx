import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegacyPage } from "@/components/LegacyPage";
import { HomeLanding } from "@/components/landing/HomeLanding";
import { readLegacyPage } from "@/lib/site/legacy-page";

// 根目錄 "/" 由 HomeLanding 接管（新版巽風首頁）
// 其餘路徑仍走 legacy HTML
const ROUTES: Record<string, string> = {
  about: "about.html",
  services: "services.html",
  enterprise: "enterprise.html",
  cases: "cases.html",
  courses: "courses.html",
  booking: "booking.html",
  thanks: "thanks.html",
  privacy: "privacy.html",
  ai: "ai.html",
  login: "login.html",
  member: "member.html",
  "member-ai": "member-ai.html",
  "member-admin": "member-admin.html",
  "member-pricing": "member-pricing.html"
};

type PageProps = {
  params: Promise<{ slug?: string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug = [] } = await params;
  const key = slug.join("/");
  if (key === "") {
    return {
      title: "巽風堪輿｜易學決策系統｜風羿老師",
      description:
        "結合八字、奇門遁甲、卜卦／六爻、梅花易數的四術同步決策顧問系統。專業會員可使用 AI 諮詢與多維校核易學決策報告。"
    };
  }

  const fileName = ROUTES[key];
  if (!fileName) return {};

  const page = await readLegacyPage(fileName);
  return {
    title: page.title,
    description: page.description
  };
}

export default async function Page({ params }: PageProps) {
  const { slug = [] } = await params;
  const key = slug.join("/");

  if (key === "") return <HomeLanding />;

  const fileName = ROUTES[key];
  if (!fileName) notFound();

  const page = await readLegacyPage(fileName);
  return <LegacyPage html={page.html} scripts={page.scripts} />;
}
