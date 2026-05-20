// 巽風服務類別資料源｜single source of truth = content/services.json
// 首頁、/services、/member-pricing、legacy cmsServices 都讀同一份

import { readFile } from "node:fs/promises";
import path from "node:path";

export type ServiceItem = {
  title: string;
  category: string;
  price: string;
  note: string;
  description: string;
  href?: string;
  badge?: string;
  highlight?: boolean;
};

const CONTENT_DIR = path.join(process.cwd(), "content");

export async function readServices(): Promise<ServiceItem[]> {
  const raw = await readFile(path.join(CONTENT_DIR, "services.json"), "utf8");
  const data = JSON.parse(raw) as { services?: ServiceItem[] };
  return Array.isArray(data?.services) ? data.services : [];
}

export function groupServicesByCategory(services: ServiceItem[]): Record<string, ServiceItem[]> {
  const order: string[] = [];
  const map: Record<string, ServiceItem[]> = {};
  for (const s of services) {
    if (!map[s.category]) {
      map[s.category] = [];
      order.push(s.category);
    }
    map[s.category].push(s);
  }
  return order.reduce<Record<string, ServiceItem[]>>((acc, key) => {
    acc[key] = map[key];
    return acc;
  }, {});
}
