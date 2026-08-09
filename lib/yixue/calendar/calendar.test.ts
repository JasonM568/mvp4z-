// 巽風易學排盤引擎｜Phase 0 曆法底座驗收
//
// 這些測試是排盤正確性的唯一自動化防線。加演算法就要加對應案例。
// 期望值來源分三類，每條測試都註明是哪一類：
//   [權威] 中央氣象署等外部權威資料
//   [交叉] 與 tyme4ts 獨立路徑交叉比對（抓自己的實作錯誤）
//   [性質] property test，不需外部資料就能抓 off-by-one

import { describe, expect, it } from "vitest";
import { buildYixueChart, resolveSchool, type YixueEngineInput } from "../index";
import { SCHOOL_PRESETS } from "../school/schools";
import {
  dayPillar,
  hourPillarByTyme,
  hourPillarFromDayStem,
  lunarToSolar,
  makeSolarTime,
  monthOrderAt,
  SOLAR_TERM_NAMES,
  solarTermAt,
  stemIndexOf,
  yearMonthPillars
} from "./tyme";
import { dayOfYear, equationOfTimeMinutes, trueSolarOffset } from "./truesolar";

const SCHOOL = resolveSchool("fengyi-v1");

function birth(over: Partial<YixueEngineInput["birth"]> = {}): YixueEngineInput["birth"] {
  return {
    calendar: "國曆",
    isLeapMonth: false,
    year: 1990,
    month: 5,
    day: 15,
    hourBranch: "巳",
    hour: 10,
    minute: 0,
    placeLabel: "臺北市",
    longitude: null,
    latitude: null,
    ...over
  };
}

function chartOf(over: Partial<YixueEngineInput["birth"]> = {}, schoolId = "fengyi-v1") {
  return buildYixueChart({ birth: birth(over), modules: { bazi: true } }, resolveSchool(schoolId));
}

// ------------------------------------------------------------------ 節氣

describe("節氣時刻", () => {
  // [權威] 中央氣象署「中華民國114年日曆資料表」臺灣時（UT+8）
  // 氣象署公布值四捨五入到分，我們給到秒，比對必須進位不可截斷。
  const CWA_2025: Array<[number, string, string]> = [
    [1, "小寒", "2025-01-05 10:33"],
    [2, "大寒", "2025-01-20 04:00"],
    [3, "立春", "2025-02-03 22:10"],
    [4, "雨水", "2025-02-18 18:07"],
    [5, "驚蟄", "2025-03-05 16:07"]
  ];

  it.each(CWA_2025)("[權威] 2025 index=%i %s 應為 %s（四捨五入到分）", (index, name, expected) => {
    const term = solarTermAt(2025, index as number);
    expect(term.name).toBe(name);
    expect(roundToMinute(term.at)).toBe(expected);
  });

  it("[性質] 24 節氣名稱表與 tyme4ts index 對齊且全為繁體", () => {
    expect(SOLAR_TERM_NAMES).toHaveLength(24);
    expect(SOLAR_TERM_NAMES[0]).toBe("冬至");
    expect(SOLAR_TERM_NAMES[3]).toBe("立春");
    // tyme4ts 原生輸出是簡體（惊蛰、谷雨、小满、芒种、处暑），我們必須全繁體
    for (const name of SOLAR_TERM_NAMES) {
      expect(name).not.toMatch(/[惊蛰谷满种处]/);
    }
  });
});

// ------------------------------------------------------------------ 年月柱分界

describe("年柱以立春分界、月柱以節分界", () => {
  it("[權威] 2024 立春（02-04 16:27）前後年柱改變", () => {
    const before = yearMonthPillars(makeSolarTime(2024, 2, 4, 15, 0));
    const after = yearMonthPillars(makeSolarTime(2024, 2, 4, 17, 0));
    expect(before.year.label).toBe("癸卯");
    expect(after.year.label).toBe("甲辰");
    expect(before.month.label).toBe("乙丑");
    expect(after.month.label).toBe("丙寅");
  });

  it("[權威] 年柱不以農曆正月初一分界", () => {
    // 2024 農曆正月初一 = 2024-02-10，已在立春（02-04）之後，
    // 故 02-05 ~ 02-09 這段：農曆還是癸卯年，八字年柱已是甲辰。
    const solar = lunarToSolar(2024, 1, 1, false);
    expect(`${solar.year}-${solar.month}-${solar.day}`).toBe("2024-2-10");
    expect(yearMonthPillars(makeSolarTime(2024, 2, 6, 12, 0)).year.label).toBe("甲辰");
  });

  it("[交叉] 月令只取節不取氣", () => {
    // 2025-03-20 是春分（氣）當日，月令應仍是驚蟄（節），不是春分
    const mo = monthOrderAt(makeSolarTime(2025, 3, 20, 12, 0));
    expect(mo.term).toBe("驚蟄");
    expect(mo.termAt).toBe("2025-03-05 16:07:18");
    expect(mo.daysIntoTerm).toBeGreaterThan(14);
  });
});

// ------------------------------------------------------------------ 晚子時流派

describe("晚子時日柱（流派決策 1）", () => {
  const lateZi = makeSolarTime(2024, 1, 1, 23, 30);

  it("[交叉] 兩派在晚子時給出不同日柱", () => {
    expect(dayPillar(lateZi, "next").label).toBe("乙丑");
    expect(dayPillar(lateZi, "same").label).toBe("甲子");
  });

  it("[交叉] 非晚子時兩派一致", () => {
    for (const [h, mi] of [[22, 30], [0, 30], [12, 0]] as const) {
      const t = makeSolarTime(2024, 1, h === 0 ? 2 : 1, h, mi);
      expect(dayPillar(t, "next").label).toBe(dayPillar(t, "same").label);
    }
  });

  it("[交叉] 流派設定確實會改變輸出的盤（A/B 可區分）", () => {
    const a = chartOf({ year: 2024, month: 1, day: 1, hourBranch: "子", hour: 23, minute: 30 }, "fengyi-v1");
    const b = chartOf({ year: 2024, month: 1, day: 1, hourBranch: "子", hour: 23, minute: 30 }, "fengyi-alt-latezi");
    expect(a.bazi?.pillars.day.ganzhi.label).not.toBe(b.bazi?.pillars.day.ganzhi.label);
  });
});

// ------------------------------------------------------------------ 時柱自檢

describe("時柱五鼠遁自算", () => {
  it("[交叉] 預設流派下與 tyme4ts 完全一致（掃描全年每日每個時辰）", () => {
    // 這條是本引擎最重要的自檢：我們自己算時柱是為了讓流派可切換，
    // 但在預設流派下必須與套件完全相同，否則就是我們算錯。
    let checked = 0;
    for (let month = 1; month <= 12; month++) {
      for (const day of [1, 9, 17, 25]) {
        for (let hour = 0; hour < 24; hour++) {
          const t = makeSolarTime(2025, month, day, hour, 30);
          const basis = hour === 23 ? dayPillar(t, "next") : dayPillar(t, "same");
          const mine = hourPillarFromDayStem(stemIndexOf(basis), hour);
          expect(mine.label, `2025-${month}-${day} ${hour}:30`).toBe(hourPillarByTyme(t).label);
          checked++;
        }
      }
    }
    expect(checked).toBe(12 * 4 * 24);
  });

  it("[性質] 五鼠遁：日干甲己起甲子、乙庚起丙子、丙辛起戊子、丁壬起庚子、戊癸起壬子", () => {
    const expected = ["甲子", "丙子", "戊子", "庚子", "壬子"];
    for (let dayStem = 0; dayStem < 10; dayStem++) {
      expect(hourPillarFromDayStem(dayStem, 0).label).toBe(expected[dayStem % 5]);
    }
  });
});

// ------------------------------------------------------------------ 農曆與閏月

describe("農曆轉換", () => {
  it("[交叉] 2023 閏二月與正常二月是不同的月", () => {
    expect(lunarToSolar(2023, 2, 1, false)).toEqual({ year: 2023, month: 2, day: 20 });
    expect(lunarToSolar(2023, 2, 1, true)).toEqual({ year: 2023, month: 3, day: 22 });
  });

  it("[交叉] isLeapMonth 會改變排出的盤", () => {
    const normal = chartOf({ calendar: "農曆", year: 2023, month: 2, day: 1, isLeapMonth: false });
    const leap = chartOf({ calendar: "農曆", year: 2023, month: 2, day: 1, isLeapMonth: true });
    expect(normal.bazi?.pillars.month.ganzhi.label).not.toBe(leap.bazi?.pillars.month.ganzhi.label);
    expect(normal.resolvedTime.civil).toBe("2023-02-20 10:00:00");
    expect(leap.resolvedTime.civil).toBe("2023-03-22 10:00:00");
  });
});

// ------------------------------------------------------------------ 真太陽時

describe("真太陽時", () => {
  it("[性質] 經度時差每度 4 分鐘", () => {
    const { totalMinutes } = trueSolarOffset({
      year: 2025, month: 6, day: 21, longitude: 121, mode: "longitude"
    });
    expect(totalMinutes).toBeCloseTo(4, 5);
  });

  it("[性質] 均時差全年極值符合近似式應有範圍", () => {
    // 真實 EoT 極值約 −14.2（2 月中）與 +16.4（11 月初）分鐘。
    // 本近似式誤差約 ±0.5 分鐘，故邊界放寬到 ±0.8 涵蓋近似誤差；
    // 超出此範圍代表公式或 dayOfYear 寫錯，而非精度問題。
    const values = Array.from({ length: 365 }, (_, i) => equationOfTimeMinutes(i + 1));
    expect(Math.min(...values)).toBeGreaterThan(-15);
    expect(Math.min(...values)).toBeLessThan(-13.5);
    expect(Math.max(...values)).toBeGreaterThan(15.5);
    expect(Math.max(...values)).toBeLessThan(17);
  });

  it("[性質] dayOfYear 處理閏年", () => {
    expect(dayOfYear(2024, 3, 1)).toBe(61); // 閏年
    expect(dayOfYear(2025, 3, 1)).toBe(60);
    expect(dayOfYear(2000, 3, 1)).toBe(61); // 400 年閏
    expect(dayOfYear(1900, 3, 1)).toBe(60); // 100 年不閏
  });

  it("[交叉] 金門與臺東經度差導致時辰交界前後的時柱不同", () => {
    // 金門 118.32°E 約 −6.7 分鐘、臺東 121.14°E 約 +4.6 分鐘，差約 11 分鐘。
    // 取一個接近時辰交界（11:00 午時起）的時刻，讓校正把兩地推到不同時辰。
    const kinmen = chartOf({ placeLabel: "金門縣", hour: 11, minute: 2, hourBranch: "午" });
    const taitung = chartOf({ placeLabel: "臺東縣", hour: 11, minute: 2, hourBranch: "午" });
    expect(kinmen.resolvedTime.longitude).toBeCloseTo(118.3186, 4);
    expect(taitung.resolvedTime.longitude).toBeCloseTo(121.1444, 4);
    expect(kinmen.bazi?.pillars.hour?.ganzhi.branch).toBe("巳"); // 校正後退回巳時
    expect(taitung.bazi?.pillars.hour?.ganzhi.branch).toBe("午");
  });

  it("[性質] corrections 逐項列出可供驗算", () => {
    const c = chartOf().resolvedTime.corrections;
    expect(c.map((x) => x.kind)).toEqual(["longitude", "equationOfTime"]);
  });
});

// ------------------------------------------------------------------ 缺資料處理

describe("缺資料不猜、如實標記", () => {
  it("時辰不確定時不產出時柱", () => {
    const c = chartOf({ hourBranch: null, hour: null, minute: null });
    expect(c.bazi?.pillars.hour).toBeNull();
    expect(c.completeness.missing).toContain("出生時辰");
    expect(c.completeness.score).toBeLessThanOrEqual(60);
    expect(c.warnings.join()).toContain("不產出時柱");
  });

  it("只給時辰未給鐘點時，用時辰中點並標記缺漏", () => {
    const c = chartOf({ hourBranch: "寅", hour: null, minute: null });
    expect(c.bazi?.pillars.hour?.ganzhi.branch).toBe("寅");
    expect(c.completeness.missing).toContain("精確出生鐘點");
  });

  it("子時未給鐘點時明確警告早子晚子無法判定", () => {
    const c = chartOf({ hourBranch: "子", hour: null, minute: null });
    expect(c.warnings.join()).toContain("早子");
    expect(c.warnings.join()).toContain("晚子");
  });

  it("資料齊全時完整度 100", () => {
    expect(chartOf().completeness).toEqual({ score: 100, missing: [] });
  });

  it("未啟用八字模組時 bazi 為 null", () => {
    const c = buildYixueChart({ birth: birth(), modules: {} }, SCHOOL);
    expect(c.bazi).toBeNull();
  });
});

// ------------------------------------------------------------------ property test

describe("[性質] 大範圍掃描", () => {
  it("日柱在 1900–2100 逐日恰好前進一個甲子，不跳號不重複", () => {
    const SEXAGENARY = buildSexagenaryTable();
    let prev = SEXAGENARY.indexOf(dayPillar(makeSolarTime(1900, 1, 1, 12, 0), "same").label);
    expect(prev).toBeGreaterThanOrEqual(0);

    // 每年抽三段連續 40 天，避免整整 200 年逐日跑太久
    for (let year = 1900; year <= 2100; year += 1) {
      for (const [m, d] of [[3, 1], [7, 10], [11, 20]] as const) {
        let idx = SEXAGENARY.indexOf(dayPillar(makeSolarTime(year, m, d, 12, 0), "same").label);
        for (let k = 1; k <= 40; k++) {
          const t = makeSolarTime(year, m, d, 12, 0).next(k * 86400);
          const cur = SEXAGENARY.indexOf(dayPillar(t, "same").label);
          expect(cur, `${year}-${m}-${d} +${k}d`).toBe((idx + k) % 60);
        }
      }
    }
  });

  it("盤面可 JSON 序列化且無函式殘留", () => {
    const c = chartOf();
    expect(() => JSON.stringify(c)).not.toThrow();
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });

  it("所有 preset 都能解析且 calendar 欄位齊全", () => {
    for (const id of Object.keys(SCHOOL_PRESETS)) {
      const s = resolveSchool(id);
      expect(s.calendar.timezone).toBe("Asia/Taipei");
      expect(["off", "longitude", "longitude+eot"]).toContain(s.calendar.trueSolarTime);
      expect(["next", "same"]).toContain(s.calendar.lateZiDayPillar);
    }
  });

  it("未知流派 id 會明確報錯，不靜默退回預設", () => {
    expect(() => resolveSchool("does-not-exist")).toThrow(/未知的流派設定/);
  });
});

// ------------------------------------------------------------------ helpers

function roundToMinute(iso: string): string {
  const [date, time] = iso.split(" ");
  const [h, mi, s] = time.split(":").map(Number);
  const total = h * 3600 + mi * 60 + s + 30;
  const rounded = Math.floor(total / 60) * 60;
  const hh = Math.floor(rounded / 3600) % 24;
  const mm = Math.floor((rounded % 3600) / 60);
  return `${date} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function buildSexagenaryTable(): string[] {
  const stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  return Array.from({ length: 60 }, (_, i) => `${stems[i % 10]}${branches[i % 12]}`);
}
