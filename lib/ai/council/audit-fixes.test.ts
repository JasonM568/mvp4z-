// 2026-09-23 敵意稽核抓到的資料流缺口。
//
// 這四條的共同形狀是「會員填了，但值在中途被丟掉」，而且都不會報錯——
// 會員拿到一份用別的輸入算出來的付費報告，沒有任何跡象。

import { describe, expect, it } from "vitest";
import { councilSchema } from "./schema";
import { resolveSchool } from "@/lib/yixue";
import { buildInitialForm } from "@/app/member-ai/decision/_form-config";
import { buildChartForCouncil, toBirthInput, toLiuyaoTime, toMeihuaSource } from "./chart";
import type { CouncilInput } from "./personas";

const SCHOOL = resolveSchool("fengyi-v1");

function base(yixue: Record<string, unknown>) {
  return { question: "測試問題", topic: "事業／工作", yixue } as unknown as CouncilInput;
}

/** 一組完整到排得出大運的輸入，只有性別是變數。 */
function genderedInput(gender: string) {
  return base({
    clientName: "測試",
    gender,
    modules: { bazi: true },
    birth: {
      calendar: "國曆", isLeapMonth: "否",
      year: 1985, month: 7, day: 12, hourBranch: "午", timeKnown: "是"
    }
  });
}

describe("#3 六爻的起卦時間不可被 schema 剝掉", () => {
  it("liuyao.time 與 timeMode 要通過驗證並保留", () => {
    // 前端 2026-09-08 就開始送這兩個欄位，但 schema 沒宣告，
    // Zod 預設剝除未宣告欄位，於是「現在時間」起卦從上線起就沒作用過。
    const parsed = councilSchema.safeParse({
      question: "測試問題",
      yixue: { liuyao: { mode: "時間起卦", timeMode: "現在時間", time: "2026-09-23 10:00" } }
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.yixue?.liuyao?.time).toBe("2026-09-23 10:00");
  });

  it("六爻拿自己的起卦時間，不會退回事件時間", () => {
    const t = toLiuyaoTime(base({
      liuyao: { mode: "時間起卦", time: "2026-09-23 10:00" },
      eventTime: { year: 2020, month: 1, day: 1, hour: 0, minute: 0 }
    }));
    expect(t).toMatchObject({ year: 2026, month: 9, day: 23, hour: 10 });
  });
});

describe("#4 梅花手選動爻不可被當成 NaN", () => {
  it("中文爻位標籤要轉成 1–6", () => {
    for (const [label, n] of [["初爻",1],["二爻",2],["三爻",3],["四爻",4],["五爻",5],["上爻",6]] as const) {
      const src = toMeihuaSource(base({
        meihua: { mode: "上下卦起卦", upperTrigram: "乾", lowerTrigram: "坤", movingLine: label }
      }));
      expect(src, label).toMatchObject({ mode: "上下卦起卦", movingLine: n });
    }
  });

  it("數字字串仍然收（舊 payload 相容）", () => {
    const src = toMeihuaSource(base({
      meihua: { mode: "上下卦起卦", upperTrigram: "乾", lowerTrigram: "坤", movingLine: "3" }
    }));
    expect(src).toMatchObject({ movingLine: 3 });
  });

  it("真的不合法才退回時間起卦", () => {
    const src = toMeihuaSource(base({
      meihua: { mode: "上下卦起卦", upperTrigram: "乾", lowerTrigram: "坤", movingLine: "第七爻" }
    }));
    expect(src).toEqual({ mode: "時間起卦" });
  });
});

describe("#5 時辰不確定要真的不確定", () => {
  const birth = { calendar: "國曆", year: 1990, month: 5, day: 20, hourBranch: "寅", hour: "14", minute: "30" };

  it("timeKnown 為否時不採信時辰，也不採信精確鐘點", () => {
    // 只擋 hourBranch 會變成「不排時柱、卻仍用一個他說不準的時刻推真太陽時與大運」。
    const b = toBirthInput(base({ birth: { ...birth, timeKnown: "否" } }))!;
    expect(b.hourBranch).toBeNull();
    expect(b.hour).toBeNull();
    expect(b.minute).toBeNull();
  });

  it("「不確定」這種說法也要擋", () => {
    const b = toBirthInput(base({ birth: { ...birth, timeKnown: "不確定" } }))!;
    expect(b.hourBranch).toBeNull();
  });

  it("timeKnown 為是時一切照舊", () => {
    const b = toBirthInput(base({ birth: { ...birth, timeKnown: "是" } }))!;
    expect(b.hourBranch).toBe("寅");
    expect(b.hour).toBe(14);
  });
});

describe("#2 性別預設值不得替會員決定大運方向", () => {
  // 2026-09-22 大運上線前，gender 沒有任何計算會讀它，預設「男」是無害的。
  // 上線隔天它變成「女性會員沒改下拉就拿到男性的大運」——順逆整個相反，
  // 每一步大運的干支全錯。寧可不排，也不能排一個她沒說過的方向。
  it("表單預設不預選任何性別", () => {
    expect(buildInitialForm().gender).toBe("");
  });

  it("性別留空時不排大運，而不是默默當成男性", () => {
    const chart = buildChartForCouncil(genderedInput(""), SCHOOL).chart!;
    expect(chart.bazi!.luck).toBeNull();
  });

  it("「不指定」與留空一樣不排大運", () => {
    const chart = buildChartForCouncil(genderedInput("不指定"), SCHOOL).chart!;
    expect(chart.bazi!.luck).toBeNull();
  });

  it("女性與男性排出方向相反的大運（證明性別真的有進到計算）", () => {
    const male = buildChartForCouncil(genderedInput("男"), SCHOOL).chart!.bazi!.luck!;
    const female = buildChartForCouncil(genderedInput("女"), SCHOOL).chart!.bazi!.luck!;
    expect(male.direction).not.toBe(female.direction);
    expect(male.cycles[0].ganzhi.label).not.toBe(female.cycles[0].ganzhi.label);
  });
});
