import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegacyPage } from "@/components/LegacyPage";
import { readLegacyPage } from "@/lib/site/legacy-page";

// v2 主首頁仍走 legacy index.html，保持原品牌視覺
// 易學決策報告（v3）以服務卡片自動透過 services.json + cms-render.js 顯示在
// 首頁的「服務項目」區塊；單獨工作台位於 /member-ai/decision
const ROUTES: Record<string, string> = {
  "": "index.html"
  // 已遷移到 app/(public)/* 的頁面：
  //   about / services / enterprise / cases / courses / booking
  //   ai / privacy / thanks / login
  //   member / member-ai / member-admin / member-pricing
  // 只剩首頁 index 待 Phase 3 處理
};

type PageProps = {
  params: Promise<{ slug?: string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const fileName = await resolveFileName(params);
  if (!fileName) return {};

  const page = await readLegacyPage(fileName);
  return {
    title: page.title,
    description: page.description
  };
}

export default async function Page({ params }: PageProps) {
  const fileName = await resolveFileName(params);
  if (!fileName) notFound();

  const page = await readLegacyPage(fileName);
  return <LegacyPage html={page.html} scripts={page.scripts} />;
}

async function resolveFileName(params: PageProps["params"]) {
  const { slug = [] } = await params;
  const key = slug.join("/");
  return ROUTES[key];
}
