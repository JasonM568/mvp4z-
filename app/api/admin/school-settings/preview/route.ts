// 後台：排盤試算
//
// 老師調流派參數後，立刻用一組生辰算出四柱給他看。不扣點、不呼叫 LLM、不寫任何紀錄。
// 這是他做流派決策的依據——沒有這個，那些選項對他來說只是沒有回饋的文字。
//
// 支援一次算兩組設定，讓「A 派 vs B 派」的差異直接並列出來。

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../../_helpers";
import { errorMessage, errorStatus, readJson } from "@/lib/auth/member";
import { requireAdmin } from "@/lib/auth/admin";
import { buildYixueChart, type BirthInput } from "@/lib/yixue";
import { schoolConfigSchema } from "@/lib/yixue/school/schema";
import type { SchoolConfig } from "@/lib/yixue/school/types";

const previewSchema = z.object({
  birth: z.object({
    calendar: z.enum(["國曆", "農曆"]),
    isLeapMonth: z.boolean().default(false),
    year: z.coerce.number().int().min(1900).max(2100),
    month: z.coerce.number().int().min(1).max(12),
    day: z.coerce.number().int().min(1).max(31),
    hourBranch: z.string().nullable().default(null),
    hour: z.coerce.number().int().min(0).max(23).nullable().default(null),
    minute: z.coerce.number().int().min(0).max(59).nullable().default(null),
    placeLabel: z.string().nullable().default(null)
  }),
  /** 要比對的流派設定，1 或 2 組。 */
  schools: z.array(schoolConfigSchema).min(1).max(2)
});

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const input = await readJson(request, previewSchema);

    // readJson 的泛型會退化成 zod 的 input 型別（帶預設值的欄位仍是 optional），
    // 這裡明確補齊，避免把 undefined 當成「沒填」傳進引擎。
    const b = input.birth;
    const birth: BirthInput = {
      calendar: b.calendar,
      isLeapMonth: b.isLeapMonth ?? false,
      year: b.year,
      month: b.month,
      day: b.day,
      hourBranch: b.hourBranch ?? null,
      hour: b.hour ?? null,
      minute: b.minute ?? null,
      placeLabel: b.placeLabel ?? null,
      longitude: null,
      latitude: null
    };

    const results = input.schools.map((raw) => {
      const school = schoolConfigSchema.parse(raw) as SchoolConfig;
      try {
        const started = Date.now();
        const chart = buildYixueChart({ birth, modules: { bazi: true } }, school);
        return { label: school.label, chart: { ...chart, computeMs: Date.now() - started }, error: null };
      } catch (error) {
        // 試算失敗只回錯誤訊息，不 throw——老師可能填了 2 月 31 日這種日期，
        // 那應該顯示「這個日期排不出來」，而不是整頁壞掉。
        return {
          label: school.label,
          chart: null,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    return apiJson({ ok: true, results });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}
