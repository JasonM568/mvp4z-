// 巽風易學排盤引擎｜流派設定驗證
//
// 純驗證，無 I/O——維持 lib/yixue 的純函式約束（guard.test.ts 在管）。
// 讀資料庫的部分在 lib/school-settings/load.ts。
//
// 每個欄位都對應 docs/specs/yixue-engine/SCHOOL-DECISIONS.md 的一個決策，
// 且後台會顯示選項說明。新增欄位前先讀那份文件的規則。

import { z } from "zod";

export const calendarSchoolSchema = z.object({
  timezone: z.literal("Asia/Taipei"),
  trueSolarTime: z.enum(["off", "longitude", "longitude+eot"]),
  defaultLongitude: z.number().min(118).max(122),
  lateZiDayPillar: z.enum(["next", "same"]),
  earlyLateZiHourPillar: z.enum(["split", "merge"]),
  termTieBreak: z.enum(["instant", "day"])
});

/**
 * 梅花設定。兩個欄位都給 default，因為 2026-08 之前存進 ai_school_profiles 的
 * 版本沒有這一段——沒有 default 會讓舊紀錄整份 parse 失敗、靜默退回程式預設，
 * 老師在後台改過的曆法設定就會一起消失。
 */
export const meihuaSchoolSchema = z.object({
  timeQuaDateBasis: z.enum(["農曆", "國曆"]).default("農曆"),
  timeQuaYearNumber: z.enum(["地支序", "農曆年數"]).default("地支序")
});

export const schoolConfigSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1, "請填流派名稱").max(60),
  decidedAt: z.string().default(""),
  decidedBy: z.string().default(""),
  calendar: calendarSchoolSchema,
  meihua: meihuaSchoolSchema.default({ timeQuaDateBasis: "農曆", timeQuaYearNumber: "地支序" })
});

/**
 * 後台顯示用：每個決策的選項與白話說明。
 * 老師不讀程式，選項旁邊必須說清楚差在哪、影響什麼。
 */
export const SCHOOL_FIELD_GUIDE = [
  {
    section: "calendar",
    path: "lateZiDayPillar",
    title: "晚子時（23:00–23:59）的日柱",
    why: "日柱是日主所在，直接決定十神與旺衰。這一項只影響 23 點到 24 點之間出生的人，但對他們影響是整份報告。",
    options: [
      { value: "next", label: "進位到隔日", hint: "子時已屬新一日。2024-01-01 23:30 出生 → 日柱乙丑" },
      { value: "same", label: "不進位，仍算當日", hint: "同一個例子 → 日柱甲子" }
    ]
  },
  {
    section: "calendar",
    path: "earlyLateZiHourPillar",
    title: "早子與晚子的時柱",
    why: "時柱決定子女宮與晚年運。與上一項通常連動：日柱若不進位，時柱多半也不分。",
    options: [
      { value: "split", label: "分早子／晚子", hint: "晚子的時干依隔日日干起" },
      { value: "merge", label: "合併不分", hint: "一律視為同一個子時" }
    ]
  },
  {
    section: "calendar",
    path: "trueSolarTime",
    title: "真太陽時校正",
    why: "時鐘時間不等於太陽位置。台東與金門經度差約 13 分鐘，出生在時辰交界前後的人會排出不同時柱。選校正需要會員填出生地（已加在進階欄位）。",
    options: [
      { value: "off", label: "不校正", hint: "直接用時鐘時間" },
      { value: "longitude", label: "只校正經度時差", hint: "每偏離東經 120 度一度加減 4 分鐘" },
      { value: "longitude+eot", label: "經度時差 ＋ 均時差", hint: "再加季節性誤差，全年 −14 到 +16 分鐘" }
    ]
  },
  {
    section: "calendar",
    path: "termTieBreak",
    title: "交節當日的歸屬",
    why: "月柱以節分界，月令是判旺衰最重要的依據。系統的節氣時刻已驗證與中央氣象署一致。",
    options: [
      { value: "instant", label: "依精確時刻", hint: "2025 立春 22:10，當天 22:00 出生算前月、22:30 算後月" },
      { value: "day", label: "整日歸新月", hint: "交節當天不分時刻" }
    ]
  },
  {
    section: "meihua",
    path: "timeQuaDateBasis",
    title: "梅花時間起卦：數農曆還是國曆",
    why: "時間起卦以年月日時四個數字取卦。數農曆是邵雍原法；數國曆的日數最大到 31、月數對應節氣的關係也不同，兩者幾乎必然排出不同的卦。",
    options: [
      { value: "農曆", label: "農曆（邵雍原法）", hint: "數農曆月與農曆日" },
      { value: "國曆", label: "國曆", hint: "直接數國曆月日" }
    ]
  },
  {
    section: "meihua",
    path: "timeQuaYearNumber",
    title: "梅花時間起卦：年數怎麼取",
    why: "年數與月、日、時相加後取餘數定卦。取地支序（1–12）與取年數（2026）量級差很大，餘數幾乎必然不同，等於整組本卦、互卦、變卦都會變。",
    options: [
      { value: "地支序", label: "地支序（子1…亥12）", hint: "2026 丙午年 → 年數 7" },
      { value: "農曆年數", label: "農曆年數", hint: "2026 年 → 年數 2026" }
    ]
  }
] as const;
