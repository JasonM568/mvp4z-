import { readFile } from "node:fs/promises";
import path from "node:path";

type LegacyPage = {
  html: string;
  title?: string;
  description?: string;
  scripts: string[];
};

const LEGACY_DIR = path.join(process.cwd(), "legacy-pages");

export async function readLegacyPage(fileName: string): Promise<LegacyPage> {
  const raw = await readFile(path.join(LEGACY_DIR, fileName), "utf8");
  const title = matchFirst(raw, /<title>(.*?)<\/title>/is);
  const description = matchFirst(
    raw,
    /<meta\s+name=["']description["']\s+content=["'](.*?)["']\s*\/?>/is
  );
  const body = matchFirst(raw, /<body[^>]*>([\s\S]*?)<\/body>/i) ?? raw;
  const scripts = Array.from(body.matchAll(/<script\s+src=["']([^"']+)["'][^>]*><\/script>/gi))
    .map((match) => normalizeAssetPath(match[1]))
    .filter(Boolean);
  const html = body.replace(/<script[\s\S]*?<\/script>/gi, "");

  return { html: normalizeLegacyHtml(html), title, description, scripts };
}

function matchFirst(value: string, regex: RegExp) {
  return value.match(regex)?.[1]?.trim();
}

function normalizeAssetPath(value: string) {
  if (value.startsWith("http")) return value;
  return value.startsWith("/") ? value : `/${value}`;
}

function normalizeLegacyHtml(value: string) {
  return value
    .replaceAll('href="index.html"', 'href="/"')
    .replaceAll('href="about.html"', 'href="/about"')
    .replaceAll('href="services.html"', 'href="/services"')
    .replaceAll('href="enterprise.html"', 'href="/enterprise"')
    .replaceAll('href="cases.html"', 'href="/cases"')
    .replaceAll('href="courses.html"', 'href="/courses"')
    .replaceAll('href="booking.html"', 'href="/booking"')
    .replaceAll('href="thanks.html"', 'href="/thanks"')
    .replaceAll('href="privacy.html"', 'href="/privacy"')
    .replaceAll('href="ai.html"', 'href="/ai"')
    .replaceAll('href="login.html"', 'href="/login"')
    .replaceAll('href="member.html"', 'href="/member"')
    .replaceAll('href="member-ai.html"', 'href="/member-ai"')
    .replaceAll('href="member-admin.html"', 'href="/member-admin"')
    .replaceAll('href="member-pricing.html"', 'href="/member-pricing"');
}
