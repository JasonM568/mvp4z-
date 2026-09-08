import { describe, expect, it } from "vitest";
import { diffSchool, describeSchoolValue } from "./diff";
import type { SchoolConfig } from "@/lib/yixue/school/types";

const LIVE: SchoolConfig = {
  id: "fengyi-v1",
  label: "風羿老師流派 v1（暫定，待簽核）",
  decidedAt: "",
  decidedBy: "",
  calendar: {
    timezone: "Asia/Taipei",
    trueSolarTime: "longitude+eot",
    defaultLongitude: 121.5654,
    lateZiDayPillar: "next",
    earlyLateZiHourPillar: "split",
    termTieBreak: "instant"
  },
  meihua: {
    timeQuaDateBasis: "農曆",
    timeQuaYearNumber: "地支序"
  },
  liuyao: {
    monthRule: "節月"
  }
};

describe("diffSchool", () => {
  it("重現 2026-08-10 那份草稿：晚子時日柱改成不進位，必須被說出口", () => {
    // 這就是實際躺在 ai_school_profiles 一個月沒發布的那筆草稿的內容。
    const draft = {
      id: "fengyi-v1",
      label: "風羿老師流派 v1（暫定，待簽核）",
      calendar: {
        timezone: "Asia/Taipei",
        termTieBreak: "instant",
        trueSolarTime: "longitude+eot",
        lateZiDayPillar: "same",
        defaultLongitude: 121.5654,
        earlyLateZiHourPillar: "split"
      }
    };
    expect(diffSchool(LIVE, draft)).toEqual([
      "晚子時日柱：進位到隔日 → 不進位，仍算當日"
    ]);
  });

  it("草稿與生效值相同時不產生差異，不催發布", () => {
    expect(diffSchool(LIVE, { calendar: { ...LIVE.calendar } })).toEqual([]);
  });

  it("多個欄位不同時逐條列出", () => {
    const changes = diffSchool(LIVE, {
      calendar: { lateZiDayPillar: "same", trueSolarTime: "off", termTieBreak: "day" }
    });
    expect(changes).toHaveLength(3);
    expect(changes).toContain("真太陽時校正：經度時差＋均時差 → 不校正");
    expect(changes).toContain("交節判定：依精確時刻 → 當日整日歸新月");
  });

  it("數值欄位沒有對照表時直接印數字", () => {
    expect(diffSchool(LIVE, { calendar: { defaultLongitude: 120.5 } })).toEqual([
      "預設經度：121.5654 → 120.5"
    ]);
  });

  it("草稿只帶部分欄位時，沒帶到的欄位不算差異", () => {
    expect(diffSchool(LIVE, { calendar: { lateZiDayPillar: "next" } })).toEqual([]);
  });

  it("草稿形狀壞掉一律回空陣列，不得丟例外", () => {
    // 草稿是 DB 來的 jsonb，形狀不可信。這頁的職責是提醒不是驗證，
    // 壞掉就當作沒有草稿，絕不能讓後台整頁掛掉。
    expect(diffSchool(LIVE, null)).toEqual([]);
    expect(diffSchool(LIVE, undefined)).toEqual([]);
    expect(diffSchool(LIVE, "不是物件")).toEqual([]);
    expect(diffSchool(LIVE, {})).toEqual([]);
    expect(diffSchool(LIVE, { calendar: null })).toEqual([]);
    expect(diffSchool(LIVE, { calendar: "壞掉" })).toEqual([]);
  });

  it("草稿多出未知欄位時忽略，不報錯也不列出", () => {
    expect(diffSchool(LIVE, { calendar: { 未知欄位: "x" } })).toEqual([]);
  });
});

describe("describeSchoolValue", () => {
  it("已知選項轉成中文", () => {
    expect(describeSchoolValue("lateZiDayPillar", "next")).toBe("進位到隔日");
    expect(describeSchoolValue("termTieBreak", "day")).toBe("當日整日歸新月");
  });

  it("未知欄位或未知值直接印原值", () => {
    expect(describeSchoolValue("defaultLongitude", 121.5654)).toBe("121.5654");
    expect(describeSchoolValue("lateZiDayPillar", "未知派")).toBe("未知派");
  });
});
