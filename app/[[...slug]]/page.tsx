import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegacyPage } from "@/components/LegacyPage";
import { readLegacyPage } from "@/lib/site/legacy-page";

const ROUTES: Record<string, string> = {
  "": "index.html",
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
