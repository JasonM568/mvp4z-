// 巽風 council｜把會員填的表單接到排盤引擎
//
// 這是唯一的橋接點：council 的輸入型別（全是字串、可能缺漏）在這裡
// 轉成排盤引擎要的結構化輸入。引擎本身不認識 council 的資料形狀，
// 這樣換掉任何一邊都不會牽動另一邊。
//
// 排盤失敗一律回 null 讓報告照常產出——引擎的 bug 不該有能力讓收費產品下線。

import {
  buildYixueChart,
  type BirthInput,
  type DivinationTimeInput,
  type LiuyaoSource,
  type MeihuaSource,
  type YixueChart
} from "@/lib/yixue";
import type { SchoolConfig } from "@/lib/yixue/school/types";
import type { CouncilInput } from "./personas";

const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function optionalNum(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toBirthInput(input: CouncilInput): BirthInput | null {
  const birth = input.yixue?.birth;
  if (!birth) return null;

  const year = optionalNum(birth.year);
  const month = optionalNum(birth.month);
  const day = optionalNum(birth.day);
  // 年月日缺一不可——沒有這三個就沒有任何一柱可排。
  if (year === null || month === null || day === null) return null;

  const branch = birth.hourBranch && BRANCHES.includes(birth.hourBranch) ? birth.hourBranch : null;

  // 「不確定」「海外／其他」都不是台灣縣市，findPlace 會查不到而退回預設經度，
  // 這裡先轉成 null 讓完整度分數如實反映「沒有出生地」。
  const place = birth.place && birth.place !== "不確定" && birth.place !== "海外／其他" ? birth.place : null;

  return {
    calendar: birth.calendar === "農曆" ? "農曆" : "國曆",
    isLeapMonth: birth.isLeapMonth === "是",
    year: num(year, 1990),
    month: num(month, 1),
    day: num(day, 1),
    hourBranch: branch,
    hour: optionalNum(birth.hour),
    minute: optionalNum(birth.minute),
    placeLabel: place,
    longitude: null,
    latitude: null
  };
}

/**
 * 起卦／起局時刻。
 *
 * 優先序：梅花自填的起卦時間 → 表單的事件時間。兩者常常不同——
 * 「現在時間」起卦取的是送出的當下，事件時間則是問事所指的時點。
 * 起卦要用前者，取不到才退而求其次，並在盤上留 warning 說明用了哪一個。
 */
/**
 * 解析前端送來的 "YYYY-MM-DD HH:mm"。
 *
 * 用正則而非 new Date()：Node 會把這個格式當 UTC、瀏覽器當當地時間，
 * 同一個字串在兩邊會差八小時，而八小時足以跨掉一個時辰甚至一天。
 * 前端送的已經是台北時間（見 _actions.ts 的 formatNowTaipei），這裡只做字面解析。
 */
function parseClockString(raw: unknown): DivinationTimeInput | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5])
  };
}

/** 表單的「事件／起局時間」。各術取不到自己的起卦時刻時共同的退路。 */
function eventTimeOf(input: CouncilInput): DivinationTimeInput | null {
  const e = input.yixue?.eventTime;
  const year = optionalNum(e?.year);
  const month = optionalNum(e?.month);
  const day = optionalNum(e?.day);
  if (year === null || month === null || day === null) return null;
  return {
    year,
    month,
    day,
    hour: optionalNum(e?.hour) ?? 0,
    minute: optionalNum(e?.minute) ?? 0
  };
}

/**
 * 全報告共用的起卦／起局時刻，也是各術取不到自己時刻時的預設。
 * 優先序：梅花自填的起卦時間 → 事件時間。
 */
export function toDivinationTime(input: CouncilInput): DivinationTimeInput | null {
  return parseClockString(input.yixue?.meihua?.time) || eventTimeOf(input);
}

/**
 * 六爻自己的起卦時刻。
 *
 * 會員可以在六爻區塊選「現在時間」，那時前端會送台北當下；沒選就用事件時間。
 * 不共用梅花的時間——兩術在表單上是兩個獨立的起卦動作，共用會讓其中一邊
 * 顯示的「起卦時間」與實際用的不符。
 */
export function toLiuyaoTime(input: CouncilInput): DivinationTimeInput | null {
  return parseClockString(input.yixue?.liuyao?.time) || eventTimeOf(input);
}

/**
 * 梅花起卦來源。
 *
 * 數字起卦一律回傳原始數字，不採用前端算好的上下卦——前端那份是為了即時預覽，
 * 真正出報告的盤必須由引擎重算，否則「程式排盤」又變成「相信前端」。
 */
export function toMeihuaSource(input: CouncilInput): MeihuaSource {
  const m = input.yixue?.meihua;
  const mode = m?.mode;

  if (mode === "數字起卦") {
    const numbers = (m?.numbers || [])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n !== 0);
    if (numbers.length) return { mode: "數字起卦", numbers };
    // 勾了數字起卦卻沒填數字：退回時間起卦，比排不出卦好。
    return { mode: "時間起卦" };
  }

  if (mode === "上下卦起卦" && m?.upperTrigram && m?.lowerTrigram) {
    const movingLine = Number(m.movingLine);
    if (Number.isInteger(movingLine) && movingLine >= 1 && movingLine <= 6) {
      return { mode: "上下卦起卦", upper: m.upperTrigram, lower: m.lowerTrigram, movingLine };
    }
  }

  return { mode: "時間起卦" };
}

/**
 * 六爻起卦來源。
 *
 * 表單的爻位下拉含「不會判斷，請用時間起卦」這個選項，實務上絕大多數會員都選它
 * （正式庫的紀錄裡六爻六個位置幾乎全是這個值）。只要有任何一爻不是合法爻象，
 * 就整組退回時間起卦——半組手動半組推算會排出一個誰也沒下過的卦。
 */
export function toLiuyaoSource(input: CouncilInput): LiuyaoSource {
  const yao = input.yixue?.liuyao?.yao;
  const mode = input.yixue?.liuyao?.mode;
  const VALID = ["少陽", "少陰", "老陽", "老陰"];

  if (mode !== "時間起卦" && Array.isArray(yao) && yao.length === 6 && yao.every((y) => VALID.includes(y))) {
    return { mode: "手動輸入", yao: [...yao] };
  }
  return { mode: "時間起卦" };
}

export function buildChartForCouncil(
  input: CouncilInput,
  school: SchoolConfig
): { chart: YixueChart | null; computeMs: number; error: string | null } {
  const birth = toBirthInput(input);
  if (!birth) return { chart: null, computeMs: 0, error: "缺少出生年月日，無法排盤" };

  const started = Date.now();
  try {
    const chart = buildYixueChart(
      {
        birth,
        modules: input.yixue?.modules || { bazi: true },
        divinationTime: toDivinationTime(input),
        meihua: toMeihuaSource(input),
        liuyao: toLiuyaoSource(input),
        liuyaoTime: toLiuyaoTime(input)
      },
      school
    );
    return { chart: { ...chart, computeMs: Date.now() - started }, computeMs: Date.now() - started, error: null };
  } catch (error) {
    return {
      chart: null,
      computeMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
