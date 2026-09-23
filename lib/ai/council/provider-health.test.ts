// 門檻設錯的兩種壞法都要擋住：
//   狂叫   → 沒有人再看告警，等於沒有告警
//   不叫   → 出事了也沒人知道，等於沒有告警
// 所以這裡兩個方向都測。

import { describe, expect, it } from "vitest";
import {
  buildHealthAlert,
  needsAlert,
  summarizeProviderHealth,
  type ProviderCall
} from "./provider-health";

const NOW = new Date("2026-09-23T10:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

function calls(spec: { role: string; ok: boolean; hours: number; error?: string; status?: number }[]): ProviderCall[] {
  return spec.map((s) => ({
    role: s.role,
    ok: s.ok,
    error: s.error ?? (s.ok ? null : "This model is currently experiencing high demand."),
    status: s.status ?? (s.ok ? 200 : 503),
    created_at: hoursAgo(s.hours)
  }));
}

const gemini = (n: number, ok: boolean, hours: number) =>
  Array.from({ length: n }, () => ({ role: "geminiFengYi", ok, hours }));

describe("小樣本不判定——這是付費報告，一天只有幾份", () => {
  it("七日內只有幾次呼叫、其中一次失敗，不算異常", () => {
    const h = summarizeProviderHealth(calls([...gemini(4, true, 40), ...gemini(1, false, 40)]), NOW);
    const g = h.find((x) => x.role === "geminiFengYi")!;
    expect(g.level).toBe("ok");
    expect(g.reason).toContain("樣本不足");
    // 五次裡失敗一次是 20%，超過 15% 門檻——沒有最小樣本數就會在這裡誤報
    expect(g.week.rate).toBeCloseTo(0.2);
  });

  it("完全沒有呼叫紀錄的 provider 不會被判成異常", () => {
    const h = summarizeProviderHealth([], NOW);
    expect(h).toHaveLength(3);
    expect(h.every((x) => x.level === "ok")).toBe(true);
    expect(needsAlert(h)).toBe(false);
  });
});

describe("真的出事要叫", () => {
  it("樣本夠、七日失敗率超過 15% → 注意", () => {
    const h = summarizeProviderHealth(calls([...gemini(16, true, 100), ...gemini(4, false, 100)]), NOW);
    const g = h.find((x) => x.role === "geminiFengYi")!;
    expect(g.level).toBe("warn");
    expect(g.reason).toContain("七日失敗率");
  });

  it("樣本不足但 24 小時內失敗 3 次 → 仍要叫，不能以樣本不足為由沉默", () => {
    const h = summarizeProviderHealth(calls(gemini(3, false, 2)), NOW);
    const g = h.find((x) => x.role === "geminiFengYi")!;
    expect(g.level).toBe("warn");
    expect(g.reason).toContain("24 小時內失敗 3 次");
  });

  it("24 小時內全數失敗且樣本足夠 → 疑似整個不可用", () => {
    const h = summarizeProviderHealth(calls(gemini(6, false, 3)), NOW);
    expect(h.find((x) => x.role === "geminiFengYi")!.level).toBe("down");
  });

  it("3 次全失敗只算「注意」，不算不可用——一份報告就會打兩次，3 次還不夠下這個結論", () => {
    const h = summarizeProviderHealth(calls(gemini(3, false, 2)), NOW);
    expect(h.find((x) => x.role === "geminiFengYi")!.level).toBe("warn");
  });

  it("一家壞不會把另外兩家一起標紅", () => {
    const h = summarizeProviderHealth(
      calls([...gemini(6, false, 3), { role: "openaiFengYi", ok: true, hours: 3 }]),
      NOW
    );
    expect(h.find((x) => x.role === "geminiFengYi")!.level).toBe("down");
    expect(h.find((x) => x.role === "openaiFengYi")!.level).toBe("ok");
    expect(h.find((x) => x.role === "deepseekAttack")!.level).toBe("ok");
  });
});

describe("時間視窗要真的分開算", () => {
  it("三十天前的失敗不進三十日視窗", () => {
    const h = summarizeProviderHealth(calls(gemini(5, false, 24 * 31)), NOW);
    const g = h.find((x) => x.role === "geminiFengYi")!;
    expect(g.month.calls).toBe(0);
    expect(g.day.calls).toBe(0);
    expect(g.level).toBe("ok");
    // 但「最後一次失敗」仍要看得到，否則會以為從來沒壞過
    expect(g.lastFailureAt).not.toBeNull();
  });

  it("24 小時／七日／三十日各自獨立", () => {
    const h = summarizeProviderHealth(
      calls([...gemini(1, false, 2), ...gemini(1, false, 100), ...gemini(1, false, 600)]),
      NOW
    );
    const g = h.find((x) => x.role === "geminiFengYi")!;
    expect(g.day.failures).toBe(1);
    expect(g.week.failures).toBe(2);
    expect(g.month.failures).toBe(3);
  });
});

describe("告警信", () => {
  const health = summarizeProviderHealth(calls(gemini(6, false, 3)), NOW);

  it("全綠時不寄信——沒事不要吵人", () => {
    expect(needsAlert(summarizeProviderHealth(calls(gemini(5, true, 3)), NOW))).toBe(false);
  });

  it("信裡要講清楚會員受到什麼影響，不是只丟一個數字", () => {
    const { text } = buildHealthAlert(health, NOW);
    expect(text).toContain("三家意見變成兩家");
    expect(text).toContain("會員看不出任何差別");
  });

  it("信裡帶得出實際數字、錯誤訊息與後台連結", () => {
    const { subject, text } = buildHealthAlert(health, NOW);
    expect(subject).toContain("Gemini");
    expect(text).toContain("high demand");
    expect(text).toContain("/admin/provider-health");
  });

  it("正常的那幾家也列出來，讓人知道是單一家的問題", () => {
    const mixed = summarizeProviderHealth(
      calls([...gemini(6, false, 3), { role: "openaiFengYi", ok: true, hours: 3 }]),
      NOW
    );
    expect(buildHealthAlert(mixed, NOW).text).toContain("其餘正常");
  });
});
