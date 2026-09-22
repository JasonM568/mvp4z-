import { describe, expect, it } from "vitest";
import { buildFleeting, FLEETING_MONTH_COUNT } from "./fleeting";
import { makeSolarTime } from "../calendar/tyme";

describe("流年流月", () => {
  it("基準時刻的流年流月與四柱同一套規則", () => {
    // 2026-09-22 14:00 在白露之後、寒露之前 → 丙午年 丁酉月。
    const f = buildFleeting(makeSolarTime(2026, 9, 22, 14, 0));
    expect(f.year.label).toBe("丙午");
    expect(f.months[0].ganzhi.label).toBe("丁酉");
    expect(f.months[0].term).toBe("白露");
    expect(f.months[0].current).toBe(true);
  });

  it("流月逐節推進，節名與月柱同步", () => {
    const f = buildFleeting(makeSolarTime(2026, 9, 22, 14, 0));
    expect(f.months.map((m) => m.ganzhi.label)).toEqual([
      "丁酉",
      "戊戌",
      "己亥",
      "庚子",
      "辛丑",
      "壬寅"
    ]);
    expect(f.months.map((m) => m.term)).toEqual([
      "白露",
      "寒露",
      "立冬",
      "大雪",
      "小寒",
      "立春"
    ]);
  });

  it("跨立春時流年跟著換——這正是流月與流年連動的地方", () => {
    const f = buildFleeting(makeSolarTime(2026, 9, 22, 14, 0));
    // 前五個月仍屬丙午年，第六個月（立春起的壬寅月）已進丁未年。
    expect(f.months.slice(0, 5).every((m) => m.year.label === "丙午")).toBe(true);
    const liChun = f.months[5];
    expect(liChun.term).toBe("立春");
    expect(liChun.year.label).toBe("丁未");
  });

  it("節氣時刻取秒級原始值，只在顯示時才收斂", () => {
    const f = buildFleeting(makeSolarTime(2026, 9, 22, 14, 0));
    // 2027 立春為 2027-02-04 09:46（已與氣象署公布值核對過的同一套來源）。
    expect(f.months[5].termAt.startsWith("2027-02-04 09:46")).toBe(true);
  });

  it("立春當下即屬新流年，不等到農曆年", () => {
    // 2027-02-04 09:46 交立春；取 12:00 已在立春之後。
    const f = buildFleeting(makeSolarTime(2027, 2, 4, 12, 0));
    expect(f.year.label).toBe("丁未");
    expect(f.months[0].term).toBe("立春");
  });

  it("立春前一刻仍屬舊流年", () => {
    const f = buildFleeting(makeSolarTime(2027, 2, 4, 8, 0));
    expect(f.year.label).toBe("丙午");
    expect(f.months[0].term).toBe("小寒");
  });

  it("預設長度為六個月，且可指定", () => {
    expect(buildFleeting(makeSolarTime(2026, 9, 22, 14, 0)).months).toHaveLength(
      FLEETING_MONTH_COUNT
    );
    expect(buildFleeting(makeSolarTime(2026, 9, 22, 14, 0), 3).months).toHaveLength(3);
  });

  it("長度給 0 或負數時保底給一個月，不得回空陣列", () => {
    // 空陣列會讓 months[0] 爆掉，也會讓 prompt 出現一個沒有內容的流月段。
    expect(buildFleeting(makeSolarTime(2026, 9, 22, 14, 0), 0).months).toHaveLength(1);
    expect(buildFleeting(makeSolarTime(2026, 9, 22, 14, 0), -5).months).toHaveLength(1);
  });

  it("跨西元年推進不會斷掉", () => {
    const f = buildFleeting(makeSolarTime(2026, 12, 20, 9, 0));
    expect(f.months[0].term).toBe("大雪");
    expect(f.months.map((m) => m.ganzhi.label)).toEqual([
      "庚子",
      "辛丑",
      "壬寅",
      "癸卯",
      "甲辰",
      "乙巳"
    ]);
  });
});
