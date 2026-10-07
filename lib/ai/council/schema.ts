// 巽風 council API 輸入驗證
// 對應前台 app/member-ai/decision/page.tsx 送來的表單結構

import { z } from "zod";

/**
 * 數值欄位：允許「未填」（undefined 或空字串，前端用 "" 表示沒填），
 * 有填就必須是範圍內的整數。不轉型，保留原本的 number | string。
 * 2026-10-07 QA-C2：原本年=-99999、月=13、年='abc' 都能通過，排盤失敗後仍照扣 20 點。
 */
const rangedInt = (label: string, min: number, max: number) =>
  z
    .union([z.number(), z.string().trim().max(8)])
    .optional()
    .refine(
      (v) => {
        if (v === undefined || v === "") return true;
        const n = typeof v === "number" ? v : Number(v);
        return Number.isInteger(n) && n >= min && n <= max;
      },
      { message: `${label}須為 ${min}–${max} 的整數` }
    );

const YEAR_MAX = 2100;

/** 國曆日期要真的存在（2/30、4/31 不行）。農曆月大小要查曆，留給排盤引擎判斷。 */
function isRealGregorianDate(y: unknown, m: unknown, d: unknown) {
  const [yy, mm, dd] = [y, m, d].map((v) => (v === undefined || v === "" ? NaN : Number(v)));
  if ([yy, mm, dd].some((n) => !Number.isFinite(n))) return true; // 沒填齊就不在這裡判
  const dt = new Date(Date.UTC(yy, mm - 1, dd));
  return dt.getUTCFullYear() === yy && dt.getUTCMonth() === mm - 1 && dt.getUTCDate() === dd;
}

export const councilSchema = z.object({
  question: z.string().trim().min(2, "請輸入問題").max(2000, "問題過長"),
  context: z.string().trim().max(4000).optional().default(""),
  topic: z.string().trim().max(40).optional(),
  deliverableMode: z.string().trim().max(40).optional(),
  clientProfile: z.string().trim().max(120).optional(),
  yixue: z
    .object({
      clientName: z.string().trim().max(40).optional(),
      gender: z.string().trim().max(20).optional(),
      /** 身分／角色，自由填寫。不參與術數計算，只作判讀背景。 */
      identity: z.string().trim().max(40).optional(),
      birth: z
        .object({
          calendar: z.string().max(10).optional(),
          isLeapMonth: z.string().max(10).optional(),
          year: rangedInt("出生年", 1900, YEAR_MAX),
          month: rangedInt("出生月", 1, 12),
          day: rangedInt("出生日", 1, 31),
          hourBranch: z.string().max(10).optional(),
          timeKnown: z.string().max(10).optional(),
          // 2026-08-09 新增的精度欄位，一律 optional：舊版前端與既有測試腳本
          // 不帶這些欄位仍須通過驗證，不可回 400。
          hour: rangedInt("出生時", 0, 23),
          minute: rangedInt("出生分", 0, 59),
          place: z.string().trim().max(60).optional()
        })
        .refine((b) => b.calendar === "農曆" || isRealGregorianDate(b.year, b.month, b.day), {
          message: "出生日期不存在，請確認月份與日期"
        })
        .optional(),
      eventTime: z
        .object({
          year: rangedInt("事件年", 1900, YEAR_MAX),
          month: rangedInt("事件月", 1, 12),
          day: rangedInt("事件日", 1, 31),
          hour: rangedInt("事件時", 0, 23),
          minute: rangedInt("事件分", 0, 59)
        })
        .refine((e) => isRealGregorianDate(e.year, e.month, e.day), {
          message: "事件日期不存在，請確認月份與日期"
        })
        .optional(),
      modules: z
        .object({
          bazi: z.boolean().optional(),
          qimen: z.boolean().optional(),
          liuyao: z.boolean().optional(),
          meihua: z.boolean().optional()
        })
        .optional(),
      qimen: z
        .object({
          mode: z.string().max(20).optional(),
          direction: z.string().max(40).optional(),
          time: z.string().max(40).optional()
        })
        .optional(),
      liuyao: z
        .object({
          mode: z.string().max(20).optional(),
          // 2026-09-08 前端加了「現在時間」起卦並送 timeMode／time，但這裡沒宣告，
          // Zod object 預設會把未宣告欄位剝掉——那個功能因此從上線起就沒作用過，
          // 六爻一律退回事件時間起卦。2026-09-23 敵意稽核抓到。
          timeMode: z.string().max(20).optional(),
          time: z.string().max(40).optional(),
          yao: z.array(z.string().max(12)).max(6).optional()
        })
        .optional(),
      meihua: z
        .object({
          mode: z.string().max(20).optional(),
          timeMode: z.string().max(20).optional(),
          time: z.string().max(40).optional(),
          numbers: z.array(z.union([z.number(), z.string().max(12)])).max(3).optional(),
          upperTrigram: z.string().max(10).nullable().optional(),
          lowerTrigram: z.string().max(10).nullable().optional(),
          movingLine: z.string().max(10).nullable().optional()
        })
        .optional()
    })
    .optional()
});

export type CouncilRequest = z.infer<typeof councilSchema>;
