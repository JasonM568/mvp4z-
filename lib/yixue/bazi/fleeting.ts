// 巽風易學排盤引擎｜流年與流月
//
// 為什麼要有這個模組：2026-09-22 查證發現，每一份報告都在跟會員要大運流年流月。
// 模型的行為其實是對的——判節奏本來就要這些，沒有就該降權——但流年流月是
// 四柱之外純粹推導得出的東西，系統自己算得出來，不該當成「缺少的客戶資料」。
// 結果是付 20 點的人看到的行動方案第一條寫著「補齊大運、流年流月資料」。
//
// 大運不在這個檔：它需要性別（陽男陰女順排、陰男陽女逆排）與起運法，
// 而起運法是老師要拍板的流派分歧，尚未簽核。見 SCHOOL-DECISIONS.md。
//
// ★ 純函式。時刻由參數傳入，不取 Date.now()。

import { fleetingMonthAt, type EngineTime } from "../calendar/tyme";
import type { StemBranch } from "../types";

/**
 * 流月序列長度。
 *
 * 取 6 是為了蓋住報告實際會用到的兩段：行動方案最遠到 30 日，
 * 時間節奏要講「中期局勢可能移動的方向」。少於 4 個月接不到中期，
 * 多於 6 個月只是讓 prompt 變長——超過半年的月令對一個具體決策沒有判讀價值。
 *
 * 不做成流派設定欄位：這是顯示範圍不是術數分歧，
 * 而 school/types.ts 的規則是「沒有能區分選項的 golden case 就不准加欄位」。
 */
export const FLEETING_MONTH_COUNT = 6;

export type FleetingMonth = {
  /** 月柱干支。 */
  ganzhi: StemBranch;
  /**
   * 該月所屬的流年干支。
   * 每個月各自帶一份而不是共用最上層那個：流年在立春換，
   * 而立春就是節之一，所以一段六個月的序列本來就可能跨兩個流年。
   */
  year: StemBranch;
  /** 這個節月起於哪一個節。 */
  term: string;
  /** 該節的精確時刻，秒級。 */
  termAt: string;
  /** 是否為基準時刻當下所在的流月。 */
  current: boolean;
};

export type Fleeting = {
  /** 基準時刻所在的流年干支（以立春分界，與四柱年柱同一套規則）。 */
  year: StemBranch;
  /** 自基準時刻所在節月起算，往後數個節月。第一個的 current 為 true。 */
  months: FleetingMonth[];
};

/**
 * 以基準時刻推出流年與接下來的流月。
 *
 * 基準時刻用的是事件／起局時間，不是出生時間——會員問的是「現在這件事」，
 * 流年流月要對齊的是決策當下，不是他出生那年。
 */
export function buildFleeting(at: EngineTime, monthCount = FLEETING_MONTH_COUNT): Fleeting {
  const count = Math.max(1, Math.floor(monthCount));
  const months: FleetingMonth[] = [];

  for (let i = 0; i < count; i += 1) {
    const m = fleetingMonthAt(at, i);
    months.push({
      ganzhi: m.month,
      year: m.year,
      term: m.term,
      termAt: m.termAt,
      current: i === 0
    });
  }

  return { year: months[0].year, months };
}
