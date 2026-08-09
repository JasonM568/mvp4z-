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

export const schoolConfigSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1, "請填流派名稱").max(60),
  decidedAt: z.string().default(""),
  decidedBy: z.string().default(""),
  calendar: calendarSchoolSchema
});

/**
 * 後台顯示用：每個決策的選項與白話說明。
 * 老師不讀程式，選項旁邊必須說清楚差在哪、影響什麼。
 */
export const SCHOOL_FIELD_GUIDE = [
  {
    path: "lateZiDayPillar",
    title: "晚子時（23:00–23:59）的日柱",
    why: "日柱是日主所在，直接決定十神與旺衰。這一項只影響 23 點到 24 點之間出生的人，但對他們影響是整份報告。",
    options: [
      { value: "next", label: "進位到隔日", hint: "子時已屬新一日。2024-01-01 23:30 出生 → 日柱乙丑" },
      { value: "same", label: "不進位，仍算當日", hint: "同一個例子 → 日柱甲子" }
    ]
  },
  {
    path: "earlyLateZiHourPillar",
    title: "早子與晚子的時柱",
    why: "時柱決定子女宮與晚年運。與上一項通常連動：日柱若不進位，時柱多半也不分。",
    options: [
      { value: "split", label: "分早子／晚子", hint: "晚子的時干依隔日日干起" },
      { value: "merge", label: "合併不分", hint: "一律視為同一個子時" }
    ]
  },
  {
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
    path: "termTieBreak",
    title: "交節當日的歸屬",
    why: "月柱以節分界，月令是判旺衰最重要的依據。系統的節氣時刻已驗證與中央氣象署一致。",
    options: [
      { value: "instant", label: "依精確時刻", hint: "2025 立春 22:10，當天 22:00 出生算前月、22:30 算後月" },
      { value: "day", label: "整日歸新月", hint: "交節當天不分時刻" }
    ]
  }
] as const;
