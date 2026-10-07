// 後台：奇門任意時間試排。老師拿自己的盤與系統比對用。
// 不扣點、不呼叫 LLM、不寫任何紀錄。

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../../_helpers";
import { errorMessage, errorStatus, readJson } from "@/lib/auth/member";
import { requireAdmin } from "@/lib/auth/admin";
import { loadSchool } from "@/lib/school-settings/load";
import { buildQimenChart } from "@/lib/yixue/qimen/qimen";
import { qimenGrid, qimenHeadlines } from "@/lib/yixue/qimen/review";
import { makeSolarTime } from "@/lib/yixue/calendar/tyme";

const schema = z.object({
  year: z.coerce.number().int().min(1900).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  day: z.coerce.number().int().min(1).max(31),
  hour: z.coerce.number().int().min(0).max(23),
  minute: z.coerce.number().int().min(0).max(59)
});

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const t = await readJson(request, schema);
    const { school } = await loadSchool(Date.now());
    try {
      const chart = buildQimenChart(school, makeSolarTime(t.year, t.month, t.day, t.hour, t.minute));
      return apiJson({ ok: true, headlines: qimenHeadlines(chart), grid: qimenGrid(chart), error: null });
    } catch (e) {
      // 例如 2 月 30 日：回「這個時間排不出來」，不讓整頁壞掉。
      return apiJson({ ok: true, headlines: [], grid: [], error: e instanceof Error ? e.message : String(e) });
    }
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}
