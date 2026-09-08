// 全時段掃描。
//
// 這不是功能測試，是防「某些時刻排不出盤」的護欄。
// 奇門就是靠同型的掃描抓到「時干落中五宮時 zhiFuPalace 為 5，而 5 不在八宮圓周上」——
// 那個 bug 每個月都會發生幾次，但主案例永遠碰不到。
//
// 三術一起掃：任何一個時刻只要有一術 throw 或回傳殘缺結構，這裡就會紅。
//
// 逾時刻意放寬到 30 秒。這條要排近兩千張盤，單獨跑約 4 秒，但整套測試並行時
// 曾衝到 6.6 秒而撞上 vitest 預設的 5 秒逾時——**閃爍的測試比沒有測試更糟**，
// 它會訓練人把紅燈當雜訊。與其縮小掃描範圍換取速度，不如給足時間保住覆蓋率。

import { describe, expect, it } from "vitest";
import { buildYixueChart } from "./index";
import { resolveSchool } from "./school/schools";
import type { SchoolConfig } from "./school/types";

const BASE = resolveSchool("fengyi-v1");

const SCHOOLS: Array<[string, SchoolConfig]> = [
  ["預設", BASE],
  ["晚子不進位", { ...BASE, calendar: { ...BASE.calendar, lateZiDayPillar: "same", earlyLateZiHourPillar: "merge" } }],
  ["梅花國曆＋年數", { ...BASE, meihua: { timeQuaDateBasis: "國曆", timeQuaYearNumber: "農曆年數" } }],
  ["六爻農曆月建", { ...BASE, liuyao: { monthRule: "農曆月" } }]
];

/** 涵蓋十二個月、四個日期、十二個時辰——含 23 時晚子與 00 時早子。 */
function samples() {
  const out: Array<{ year: number; month: number; day: number; hour: number; minute: number }> = [];
  for (const year of [2025, 2026]) {
    for (let month = 1; month <= 12; month++) {
      for (const day of [4, 12, 20, 28]) {
        for (const hour of [0, 5, 11, 17, 23]) {
          out.push({ year, month, day, hour, minute: 30 });
        }
      }
    }
  }
  return out;
}

describe("四術全時段掃描", () => {
  const ALL = samples();

  it(`${ALL.length} 個時刻 × ${SCHOOLS.length} 組流派都排得出盤，且無 warning 洩漏排盤失敗`, { timeout: 30_000 }, () => {
    const failures: string[] = [];

    for (const [label, school] of SCHOOLS) {
      for (const s of ALL) {
        const tag = `${label} ${s.year}-${s.month}-${s.day} ${s.hour}時`;
        let chart;
        try {
          chart = buildYixueChart(
            {
              birth: {
                calendar: "國曆",
                isLeapMonth: false,
                year: 1980,
                month: 5,
                day: 5,
                hourBranch: "午",
                hour: 12,
                minute: 0,
                placeLabel: "臺北市",
                longitude: null,
                latitude: null
              },
              modules: { bazi: true, qimen: true, liuyao: true, meihua: true },
              divinationTime: s,
              meihua: { mode: "時間起卦" },
              liuyao: { mode: "時間起卦" }
            },
            school
          );
        } catch (error) {
          failures.push(`${tag}：throw ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }

        // 四術都必須排出來。任何一個是 null 代表引擎自己吞掉了錯誤。
        if (!chart.bazi) failures.push(`${tag}：八字為 null`);
        if (!chart.meihua) failures.push(`${tag}：梅花為 null`);
        if (!chart.liuyao) failures.push(`${tag}：六爻為 null`);
        if (!chart.qimen) failures.push(`${tag}：奇門為 null`);

        // warnings 裡不該出現排盤失敗的字樣（缺資料的 warning 另當別論，這裡資料是齊的）
        const bad = chart.warnings.filter((w) => w.includes("失敗") || w.includes("未排"));
        if (bad.length) failures.push(`${tag}：${bad.join("／")}`);
      }
    }

    expect(failures.slice(0, 20)).toEqual([]);
  });

  it("結構完整性：每一盤的必填欄位都有值", { timeout: 30_000 }, () => {
    for (const s of ALL.filter((_, i) => i % 17 === 0)) {
      const chart = buildYixueChart(
        {
          birth: {
            calendar: "國曆",
            isLeapMonth: false,
            year: 1980,
            month: 5,
            day: 5,
            hourBranch: "午",
            hour: 12,
            minute: 0,
            placeLabel: "臺北市",
            longitude: null,
            latitude: null
          },
          modules: { bazi: true, qimen: true, liuyao: true, meihua: true },
          divinationTime: s,
          meihua: { mode: "時間起卦" },
          liuyao: { mode: "時間起卦" }
        },
        BASE
      );
      const tag = `${s.year}-${s.month}-${s.day} ${s.hour}時`;

      expect(chart.meihua!.ben.name, tag).toBeTruthy();
      expect(chart.meihua!.movingLine, tag).toBeGreaterThanOrEqual(1);
      expect(chart.meihua!.movingLine, tag).toBeLessThanOrEqual(6);

      expect(chart.liuyao!.lines, tag).toHaveLength(6);
      expect(chart.liuyao!.lines.filter((l) => l.isShi), tag).toHaveLength(1);
      expect(chart.liuyao!.lines.filter((l) => l.isYing), tag).toHaveLength(1);
      chart.liuyao!.lines.forEach((l) => {
        expect(l.ganzhi.label, `${tag} ${l.positionName}`).toHaveLength(2);
        expect(l.relative, `${tag} ${l.positionName}`).toBeTruthy();
        expect(l.god, `${tag} ${l.positionName}`).toBeTruthy();
      });

      expect(chart.qimen!.cells, tag).toHaveLength(8);
      chart.qimen!.cells.forEach((c) => {
        expect(c.door, `${tag} ${c.palace}宮`).toBeTruthy();
        expect(c.god, `${tag} ${c.palace}宮`).toBeTruthy();
        expect(c.star, `${tag} ${c.palace}宮`).toBeTruthy();
      });

      // JSON 可序列化——盤面會落地到 council_runs.chart
      expect(() => JSON.stringify(chart), tag).not.toThrow();
    }
  });
});
