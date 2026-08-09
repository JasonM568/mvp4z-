// 巽風 council｜prompt 輸出基準線
//
// 這些 snapshot 凍結的是「把寫死內容搬進後台之前」的實際 prompt 輸出。
//
// 為什麼需要：這些字串直接決定每份 20 點報告的內容。把它們從寫死改成
// 可由老師在後台編輯的資料，是在收費路徑上動刀——重構本身絕不能改變輸出。
//
// 規則：重構期間 snapshot 一個字元都不准變。
// 日後若要「刻意」改變預設內容，必須是獨立的一次改動，並在 PR 說明為什麼，
// 不可以夾帶在重構裡用 -u 更新掉。

import { describe, expect, it } from "vitest";
import { XUNFENG_PERSONA_CHAT } from "@/lib/ai/brand";
import { DEFAULT_PROMPT_SETTINGS } from "./settings/defaults";
import { renderBrandRules } from "./settings/render";
import {
  deepseekAttackSystem,
  fengYiFinalSystem,
  geminiFengYiSystem,
  openaiFengYiSystem,
  yixueDataBlock,
  type CouncilInput
} from "./personas";
import { buildFinalFormatPrompt, buildQualityGate, buildSafeFallbackReport } from "./quality";

function input(over: Partial<CouncilInput> = {}): CouncilInput {
  return {
    question: "是否要在第三季擴店",
    context: "目前兩家店，現金流可支撐六個月",
    topic: "事業／工作",
    deliverableMode: "商業決策顧問報告",
    clientProfile: "王先生",
    yixue: {
      clientName: "王先生",
      gender: "男",
      birth: {
        calendar: "國曆",
        isLeapMonth: "否",
        year: 1985,
        month: 7,
        day: 12,
        hourBranch: "午",
        timeKnown: "是"
      },
      eventTime: { year: 2026, month: 8, day: 9, hour: 14, minute: 30 },
      modules: { bazi: true, qimen: true, liuyao: true, meihua: true },
      qimen: { mode: "現在起局", direction: "震" },
      liuyao: { mode: "三枚銅錢", yao: ["少陽", "少陰", "老陽", "少陰", "少陽", "老陰"] },
      meihua: { mode: "數字起卦", numbers: [7, 3, 5], upperTrigram: "艮", lowerTrigram: "離", movingLine: "五爻" }
    },
    ...over
  } as CouncilInput;
}

const ALL_TERMS = ["八字命理", "奇門遁甲", "卜卦／六爻", "梅花易數"];

describe("分身 system prompt", () => {
  it("主判讀分身", () => expect(openaiFengYiSystem()).toMatchSnapshot());
  it("策略推演分身", () => expect(geminiFengYiSystem()).toMatchSnapshot());
  it("攻防反證分身", () => expect(deepseekAttackSystem()).toMatchSnapshot());
  it("最終定稿分身", () => expect(fengYiFinalSystem()).toMatchSnapshot());
});

describe("品牌規則", () => {
  // 這個 snapshot 是從改版前 brand.ts 的 XUNFENG_BRAND_RULES 常數寫入的。
  // 常數已移除，改由設定渲染——比對通過即證明渲染結果與原常數逐字元相同。
  it("council 共用品牌規則", () => expect(renderBrandRules(DEFAULT_PROMPT_SETTINGS)).toMatchSnapshot());
  it("會員問答人設", () => expect(XUNFENG_PERSONA_CHAT).toMatchSnapshot());
});

describe("品質門檻", () => {
  it("四術全開", () => expect(buildQualityGate(input())).toMatchSnapshot());

  it("只開八字", () =>
    expect(
      buildQualityGate(input({ yixue: { ...input().yixue, modules: { bazi: true } } } as Partial<CouncilInput>))
    ).toMatchSnapshot());

  it("未指定 topic 時的措辭", () =>
    expect(buildQualityGate(input({ topic: undefined }))).toMatchSnapshot());
});

describe("報告骨架", () => {
  it("四術全開（含交叉驗證段）", () => expect(buildFinalFormatPrompt(ALL_TERMS)).toMatchSnapshot());

  it("單術（交叉驗證段應消失，序號要接得上）", () =>
    expect(buildFinalFormatPrompt(["八字命理"])).toMatchSnapshot());

  it("兩術", () => expect(buildFinalFormatPrompt(["八字命理", "梅花易數"])).toMatchSnapshot());

  it("空陣列時保底給八字", () => expect(buildFinalFormatPrompt([])).toMatchSnapshot());
});

describe("兜底報告", () => {
  it("資料齊全", () => expect(buildSafeFallbackReport(input())).toMatchSnapshot());

  it("完全沒有易學資料", () =>
    expect(buildSafeFallbackReport({ question: "要不要換工作" } as CouncilInput)).toMatchSnapshot());
});

describe("易學資料區塊", () => {
  it("四術全開", () => expect(yixueDataBlock(input())).toMatchSnapshot());

  it("農曆閏月（2026-08-09 補上的欄位）", () =>
    expect(
      yixueDataBlock(
        input({
          yixue: {
            ...input().yixue,
            birth: { ...input().yixue!.birth, calendar: "農曆", isLeapMonth: "是" }
          }
        } as Partial<CouncilInput>)
      )
    ).toMatchSnapshot());

  it("梅花時間起卦", () =>
    expect(
      yixueDataBlock(
        input({
          yixue: {
            ...input().yixue,
            meihua: { mode: "時間起卦", timeMode: "現在時間", time: "2026-08-09 14:30" }
          }
        } as Partial<CouncilInput>)
      )
    ).toMatchSnapshot());
});
