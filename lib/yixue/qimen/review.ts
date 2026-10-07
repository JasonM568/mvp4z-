// 奇門校對盤例與盤面文字。
//
// 純函式、無 I/O（lib/yixue 的護欄）。後台頁面與簽核 API 共用，
// 讓老師在後台看到的格式與 docs/specs/yixue-engine/SCHOOL-DECISIONS.md 的盤例完全一致，
// 也讓簽核 API 可以自己重算盤面，而不是信任前端送來的內容。

import type { QimenChart } from "../types";
import { LUOSHU_LAYOUT } from "./tables";

export type QimenReviewCase = {
  id: "case1" | "case2" | "case3";
  label: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/** 與 SCHOOL-DECISIONS.md「校對盤例」三盤相同。改這裡要同步改文件。 */
export const QIMEN_REVIEW_CASES: readonly QimenReviewCase[] = [
  { id: "case1", label: "盤例一：2024-01-01 23:30", year: 2024, month: 1, day: 1, hour: 23, minute: 30 },
  { id: "case2", label: "盤例二：2026-09-08 10:33", year: 2026, month: 9, day: 8, hour: 10, minute: 33 },
  { id: "case3", label: "盤例三：2026-06-25 14:00", year: 2026, month: 6, day: 25, hour: 14, minute: 0 }
];

/** 盤頭兩行，格式與文件一致。 */
export function qimenHeadlines(c: QimenChart): string[] {
  return [
    `${c.termName}．符頭${c.futou}．${c.yuan}．${c.dun}${numeral(c.ju)}局　日柱${c.dayGanzhi}　時柱${c.hourGanzhi}　旬首${c.xunshou}遁${c.xunshouYi}`,
    `值符${c.zhiFuStar}落 ${c.zhiFuPalace} 宮　值使${c.zhiShiDoor}落 ${c.zhiShiPalace} 宮　中五宮地盤干${c.centerStem}`
  ];
}

/** 九宮格：依洛書方位三列三欄（上南下北、左東右西），每格一行文字，與文件相同。 */
export function qimenGrid(c: QimenChart): string[][] {
  const by = new Map(c.cells.map((x) => [x.palace, x]));
  return LUOSHU_LAYOUT.map((row) =>
    row.map((p) => {
      const cell = by.get(p);
      if (!cell) return `中${p} 地${c.centerStem}`;
      // 天禽寄坤二：星與天盤干要把「兼」的部分一起印出來，與文件格式一致。
      return `${cell.gua}${p} ${cell.god} ${cell.star} ${cell.door} 天${cell.skyStem} 地${cell.earthStem}`;
    })
  );
}

const NUM = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
function numeral(n: number) {
  return NUM[n] ?? String(n);
}
