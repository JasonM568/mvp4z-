import { describe, expect, it } from "vitest";
import type { CouncilRole, ModelResult } from "./providers";
import {
  checkRoundsComplete,
  failedPersonaNames,
  incompleteFinalLabel,
  skippedFinalResult
} from "./verification";

const LABEL: Record<string, string> = {
  openaiFengYi: "巽風主判讀分身",
  geminiFengYi: "巽風策略推演分身",
  deepseekAttack: "巽風攻防反證分身"
};

function r(role: CouncilRole, ok = true, status: number | null = null, suffix = ""): ModelResult {
  return {
    role,
    label: LABEL[role] + suffix,
    ok,
    text: ok ? "內容" : "",
    error: ok ? undefined : "boom",
    status,
    tokensIn: 0,
    tokensOut: 0
  };
}

const allOk = (suffix = "") => [r("openaiFengYi", true, null, suffix), r("geminiFengYi", true, null, suffix), r("deepseekAttack", true, null, suffix)];

describe("checkRoundsComplete 三方必到", () => {
  it("兩輪三家都成功才算完成", () => {
    expect(checkRoundsComplete(allOk(), allOk("｜修正"))).toEqual({ complete: true, failures: [] });
  });

  it("第二輪未啟用時只看第一輪", () => {
    expect(checkRoundsComplete(allOk(), null).complete).toBe(true);
    expect(checkRoundsComplete([r("openaiFengYi"), r("geminiFengYi", false, 400), r("deepseekAttack")], null).complete).toBe(false);
  });

  it("第一輪有一家失敗 → 未完成，記下輪次與 HTTP status", () => {
    const check = checkRoundsComplete([r("openaiFengYi"), r("geminiFengYi"), r("deepseekAttack", false, 401)], allOk("｜修正"));
    expect(check.complete).toBe(false);
    expect(check.failures).toEqual([
      { role: "deepseekAttack", label: "巽風攻防反證分身", round: 1, error: "boom", status: 401 }
    ]);
  });

  it("第二輪失敗也算未完成", () => {
    const check = checkRoundsComplete(allOk(), [r("openaiFengYi", true, null, "｜修正"), r("geminiFengYi", false, null, "｜修正"), r("deepseekAttack", true, null, "｜修正")]);
    expect(check.complete).toBe(false);
    expect(check.failures[0]).toMatchObject({ role: "geminiFengYi", round: 2, status: null });
  });

  it("某一輪少了一家的結果（不是失敗而是不見了）也算缺席", () => {
    const check = checkRoundsComplete([r("openaiFengYi"), r("geminiFengYi")], null);
    expect(check.complete).toBe(false);
    expect(check.failures[0]).toMatchObject({ role: "deepseekAttack", round: 1 });
  });

  it("兩家同時失敗（2026-11-07 的情形）全部列出", () => {
    const check = checkRoundsComplete(
      [r("openaiFengYi"), r("geminiFengYi", false, 400), r("deepseekAttack", false, 401)],
      [r("openaiFengYi", true, null, "｜修正"), r("geminiFengYi", false, 400, "｜修正"), r("deepseekAttack", false, 401, "｜修正")]
    );
    expect(check.failures).toHaveLength(4);
    expect(failedPersonaNames(check.failures)).toEqual(["巽風策略推演分身", "巽風攻防反證分身"]);
  });
});

describe("校核未完成的標示", () => {
  const failures = checkRoundsComplete([r("openaiFengYi"), r("geminiFengYi", false, 400), r("deepseekAttack")], null).failures;

  it("標籤固定含「校核未完成」與失敗分身名，且不含廠牌名", () => {
    const label = incompleteFinalLabel(failures);
    expect(label).toContain("校核未完成");
    expect(label).toContain("巽風策略推演分身");
    expect(label).not.toMatch(/OpenAI|Gemini|DeepSeek/i);
  });

  it("代替終稿的結果是失敗、零 token，不會被當成可交付", () => {
    const skipped = skippedFinalResult(failures);
    expect(skipped.ok).toBe(false);
    expect(skipped.text).toBe("");
    expect(skipped.tokensIn + skipped.tokensOut).toBe(0);
  });
});
