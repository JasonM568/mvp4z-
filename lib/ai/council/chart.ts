// 巽風 council｜把會員填的表單接到排盤引擎
//
// 這是唯一的橋接點：council 的輸入型別（全是字串、可能缺漏）在這裡
// 轉成排盤引擎要的結構化輸入。引擎本身不認識 council 的資料形狀，
// 這樣換掉任何一邊都不會牽動另一邊。
//
// 排盤失敗一律回 null 讓報告照常產出——引擎的 bug 不該有能力讓收費產品下線。

import { buildYixueChart, type BirthInput, type YixueChart } from "@/lib/yixue";
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

export function buildChartForCouncil(
  input: CouncilInput,
  school: SchoolConfig
): { chart: YixueChart | null; computeMs: number; error: string | null } {
  const birth = toBirthInput(input);
  if (!birth) return { chart: null, computeMs: 0, error: "缺少出生年月日，無法排盤" };

  const started = Date.now();
  try {
    const chart = buildYixueChart(
      { birth, modules: input.yixue?.modules || { bazi: true } },
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
