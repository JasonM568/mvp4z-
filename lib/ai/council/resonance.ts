// 巽風 council｜四象共鳴度的計算
//
// 為什麼要有這個檔：
//
// 共鳴度原本是叫終稿模型自己在 JSON 裡寫一個數字，而 prompt 的範例 JSON 裡
// 寫著 "resonance":87。模型照抄。正式庫 2026-08-06 到 09-08 共 29 份報告，
// 87 出現 20 次、85 出現 8 次、75 出現 1 次——一個月又三天只出現過三個值，
// 連判「暫緩」的那份都給 85。它不隨判讀結果變動，是個裝飾。
//
// 現在改成程式算。四個分項全部來自真實資料，沒有一項是模型可以隨手填的：
//
//   A 一致度   各術結論方向是否同向（模型給的 signal，實測會變動）
//   C 確信度   各術判讀確信度平均（模型給的 confidence，實測 20–90 都有）
//   D 完整度   排盤引擎算出的資料完整度（缺時辰、缺出生地會扣）
//   E 覆蓋率   啟用的術數裡有多少是程式真排盤，而非模型自己推算
//
// 分數區間刻意壓在 60–90：低於 60 的報告不該出給客戶（該退費或補資料），
// 高於 90 則是在宣稱一種易學給不出的確定性。區間內要能拉開差距，
// 所以權重讓「一致度」佔最大——四術同向與四術打架本來就該差很多。

export type ResonanceSignal = "green" | "yellow" | "red" | undefined;

export type ResonanceInput = {
  /** 各術的判讀信號與確信度。只計入本次啟用且有值的術。 */
  aspects: Array<{ signal?: ResonanceSignal; confidence?: number }>;
  /** 排盤引擎的資料完整度 0–100。沒有排盤時傳 null。 */
  completeness: number | null;
  /** 本次啟用的術數總數。 */
  enabledCount: number;
  /** 其中由程式真排盤的術數數量。 */
  chartedCount: number;
};

export type ResonanceBasis = {
  agreement: number;
  confidence: number;
  completeness: number;
  coverage: number;
  /** 對外可讀的計算說明，讓老師與會員都能看懂這個分數怎麼來的。 */
  note: string;
};

export const RESONANCE_MIN = 60;
export const RESONANCE_MAX = 90;

const WEIGHTS = { agreement: 0.45, confidence: 0.25, completeness: 0.15, coverage: 0.15 };

const SIGNAL_VALUE: Record<string, number> = { green: 1, yellow: 0, red: -1 };

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * 一致度。
 *
 * 只有一個術時給 0.45——單一術數沒有交叉驗證的對象，本來就不該拿到跟四術同向一樣的分。
 * 這是「共鳴度」不是「確信度」，沒有共鳴對象就是低分。
 */
function agreementOf(signals: number[]): { value: number; note: string } {
  if (signals.length === 0) return { value: 0.4, note: "各術未給出明確吉凶信號" };
  if (signals.length === 1) return { value: 0.45, note: "僅啟用一個術數，無交叉驗證對象" };

  const spread = Math.max(...signals) - Math.min(...signals);
  if (spread === 0) return { value: 1, note: "各術結論方向完全一致" };
  if (spread === 1) return { value: 0.5, note: "各術方向大致相近，但有一術持保留" };
  return { value: 0.1, note: "各術結論方向分歧（同時出現有利與不利判讀）" };
}

export function computeResonance(input: ResonanceInput): { value: number; basis: ResonanceBasis } {
  const signals = input.aspects
    .map((a) => (a.signal ? SIGNAL_VALUE[a.signal] : undefined))
    .filter((v): v is number => v !== undefined);

  const confidences = input.aspects
    .map((a) => a.confidence)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const agreement = agreementOf(signals);
  // 沒有 confidence 可用時給 0.5，而不是給滿分——不知道就是不知道。
  const confidence = confidences.length
    ? clamp01(confidences.reduce((a, b) => a + b, 0) / confidences.length / 100)
    : 0.5;
  // 沒有排盤時完整度不能當滿分處理，否則「沒排盤」反而比「排了但缺時辰」還高。
  const completeness = input.completeness === null ? 0.4 : clamp01(input.completeness / 100);
  const coverage = input.enabledCount > 0 ? clamp01(input.chartedCount / input.enabledCount) : 0;

  const score =
    WEIGHTS.agreement * agreement.value +
    WEIGHTS.confidence * confidence +
    WEIGHTS.completeness * completeness +
    WEIGHTS.coverage * coverage;

  const value = RESONANCE_MIN + Math.round((RESONANCE_MAX - RESONANCE_MIN) * clamp01(score));

  const noteParts = [
    agreement.note,
    `判讀確信度平均 ${Math.round(confidence * 100)} 分`,
    input.completeness === null
      ? "本次未取得系統排盤"
      : `排盤資料完整度 ${Math.round(completeness * 100)} 分`,
    `啟用 ${input.enabledCount} 術，其中 ${input.chartedCount} 術由系統排盤`
  ];

  return {
    value,
    basis: {
      agreement: agreement.value,
      confidence,
      completeness,
      coverage,
      note: noteParts.join("；")
    }
  };
}
