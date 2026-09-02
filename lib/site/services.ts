// 舊入口保留給既有 import；實際資料源已搬到 lib/site/content.ts（Supabase → JSON fallback）。
import { readPublishedContent, type ServiceItem } from "./content";

export type { ServiceItem } from "./content";
export { groupServicesByCategory } from "./content";

export async function readServices(): Promise<ServiceItem[]> {
  return readPublishedContent<ServiceItem>("services");
}
