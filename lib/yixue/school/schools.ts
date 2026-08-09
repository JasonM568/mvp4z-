// 巽風易學排盤引擎｜流派設定實例
//
// 為什麼是 TS 常數而不是 env 或 DB：
// - env 無型別、打錯會靜默退回預設、各環境會漂移、無稽核軌跡。
// - DB 讓一個未經測試的值直接影響已收費的產出；而改流派會翻轉 golden test
//   的期望值，必須與測試更新綁在同一個 commit 才安全。
// 這裡改動 → golden test 立刻紅 → 逼你同步更新期望值與決策文件。這是刻意的。

import type { SchoolConfig } from "./types";

/**
 * 風羿老師流派 v1。
 *
 * ⚠️ 目前 calendar 各欄位是「主流做法暫定值」，尚未經風羿老師拍板。
 * 待 docs/specs/yixue-engine/SCHOOL-DECISIONS.md 簽核後更新 decidedAt/decidedBy，
 * 並把本註記移除。上線給真實會員前必須完成簽核。
 */
const FENGYI_V1: SchoolConfig = {
  id: "fengyi-v1",
  label: "風羿老師流派 v1（暫定，待簽核）",
  decidedAt: "",
  decidedBy: "",
  calendar: {
    timezone: "Asia/Taipei",
    trueSolarTime: "longitude+eot",
    defaultLongitude: 121.5654, // 台北
    lateZiDayPillar: "next",
    earlyLateZiHourPillar: "split",
    termTieBreak: "instant"
  }
};

/**
 * 對照組：晚子時日柱不進位。
 * 供 /admin/yixue-lab 做 A/B 並列，讓老師用眼睛比對兩派差異後再拍板。
 * 不作為正式出報告的設定。
 */
const FENGYI_ALT_LATEZI: SchoolConfig = {
  ...FENGYI_V1,
  id: "fengyi-alt-latezi",
  label: "對照組：晚子時日柱不進位",
  calendar: { ...FENGYI_V1.calendar, lateZiDayPillar: "same" }
};

export const SCHOOL_PRESETS: Readonly<Record<string, SchoolConfig>> = Object.freeze({
  [FENGYI_V1.id]: FENGYI_V1,
  [FENGYI_ALT_LATEZI.id]: FENGYI_ALT_LATEZI
});

/** 正式出報告採用的流派。切換此值等同全站改流派，必須連同 golden test 一起改。 */
export const ACTIVE_SCHOOL_ID = FENGYI_V1.id;

export function resolveSchool(id: string = ACTIVE_SCHOOL_ID): SchoolConfig {
  const found = SCHOOL_PRESETS[id];
  if (!found) {
    throw new Error(`未知的流派設定：${id}`);
  }
  return found;
}
