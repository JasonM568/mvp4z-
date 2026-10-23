// 面相報告的前後一致性檢查
//
// 模型寫完的報告常有互相矛盾的地方（2026-08-17 的實例）：
// - 開頭說「未辨識到斑、痣、疤、痕」，下文卻逐項列出斑和痣
// - 「最需要注意」寫「整體均衡、無明顯不對稱」，其他段落卻提到眉毛不對稱
// - 說某部位「無法完全評估」，可判斷程度卻標「高」
//
// 這裡只做確定性的修正，不重新呼叫模型（報告已扣點、模型已呼叫，重跑是淨損失）：
// 以規則層算出的事實（特徵清單、宮位狀態）為準，改掉與事實衝突的敘述，並把修了什麼記下來。

import type { FaceReport } from "@/lib/face-analysis/report-schema";

export type ConsistencyFix = Readonly<{ rule: string; detail: string }>;

const CANNOT_ASSESS_PARTIAL = /無法完全(?:評估|判讀|判斷)|不能完全(?:評估|判讀|判斷)|難以完全(?:評估|判讀)/;
const CANNOT_ASSESS = /(?:主部位|部位|照片).{0,6}(?:無法|不可|不能)(?:評估|判讀|判斷)|不可判讀|照片不足以判讀|無法判讀/;
const SAYS_NONE_DETECTED = /未辨識到|沒有辨識到|未發現|沒有發現/;
const SAYS_ALL_BALANCED = /整體均衡|無明顯不對稱|沒有明顯不對稱|未見明顯不對稱|左右對稱均衡/;
const SAYS_ASYMMETRIC = /不對稱|一高一低|高低不一|左右不一/;

const NO_FEATURES_SUMMARY = "本次未辨識到可信度足夠的斑、痣、疤或痕";

const TYPE_LABEL = { spot: "斑", mole: "痣", scar: "疤", mark: "痕" } as const;

function splitSentences(text: string): string[] {
  return text.match(/[^。！？!?；;\n]+[。！？!?；;]?\n?|\n/g) ?? [text];
}

export function enforceReportConsistency(report: FaceReport): { report: FaceReport; fixes: ConsistencyFix[] } {
  const fixes: ConsistencyFix[] = [];
  let next: FaceReport = report;

  // 1. 無法評估卻標高可判斷程度：可判斷程度不得高於文字自己承認的限制。
  const lifeAreas = Object.fromEntries(
    Object.entries(report.lifeAreas).map(([area, reading]) => {
      const text = `${reading.conclusion}${reading.visibleBasis}${reading.watchout}`;
      let confidence = reading.confidence;
      if (confidence === "high" && CANNOT_ASSESS.test(text)) confidence = "low";
      else if (confidence === "high" && CANNOT_ASSESS_PARTIAL.test(text)) confidence = "medium";
      if (confidence !== reading.confidence) {
        fixes.push({ rule: "confidence-vs-limitation", detail: `${area}：文字說明有部位無法評估，可判斷程度由 ${reading.confidence} 降為 ${confidence}` });
        return [area, { ...reading, confidence }];
      }
      return [area, reading];
    })
  ) as FaceReport["lifeAreas"];
  next = { ...next, lifeAreas };

  // 2. 斑痣疤痕摘要必須與逐項清單一致。
  const features = next.surfaceAnalysis.detectedFeatures;
  const summary = next.surfaceAnalysis.summary;
  if (features.length > 0 && SAYS_NONE_DETECTED.test(summary)) {
    const counts = (Object.keys(TYPE_LABEL) as Array<keyof typeof TYPE_LABEL>)
      .map((type) => [TYPE_LABEL[type], features.filter((f) => f.type === type).length] as const)
      .filter(([, n]) => n > 0)
      .map(([label, n]) => `${label} ${n} 處`)
      .join("、");
    next = { ...next, surfaceAnalysis: { ...next.surfaceAnalysis, summary: `本次辨識到 ${counts}，逐項整理如下。` } };
    fixes.push({ rule: "surface-summary-vs-list", detail: `摘要說未辨識到，但清單有 ${features.length} 筆；摘要改為依清單重寫` });
  } else if (features.length === 0 && !SAYS_NONE_DETECTED.test(summary)) {
    next = { ...next, surfaceAnalysis: { ...next.surfaceAnalysis, summary: `${NO_FEATURES_SUMMARY}。` } };
    fixes.push({ rule: "surface-summary-vs-list", detail: "清單為空，但摘要沒有說明未辨識到；摘要改為標準說法" });
  }

  // 3. 「整體均衡、無明顯不對稱」與其他段落衝突時，剔除那句。
  const anyNotBalanced = next.palaces.some((palace) => palace.status !== "balanced");
  const mentionsAsymmetry = SAYS_ASYMMETRIC.test(
    JSON.stringify([next.palaces, next.lifeAreas, next.photoFingerprint, next.priorityAdvice])
  );
  if (anyNotBalanced || mentionsAsymmetry) {
    const scrub = (text: string) =>
      splitSentences(text)
        .filter((sentence) => !SAYS_ALL_BALANCED.test(sentence))
        .join("")
        .trim();
    const trend = scrub(next.currentTrend);
    const highlights = next.coreHighlights.map(scrub);
    const changed = trend !== next.currentTrend || highlights.some((h, i) => h !== next.coreHighlights[i]);
    if (changed) {
      next = {
        ...next,
        // 剔除後整段空掉時保留一句不下結論的說明，避免必填欄位變空字串。
        currentTrend: trend || "本次照片各宮位的可判讀程度與左右差異不一，請以下方十二宮與五大面向的逐項說明為準。",
        coreHighlights: highlights.map((h, i) => h || next.coreHighlights[i]) as FaceReport["coreHighlights"]
      };
      fixes.push({ rule: "balanced-vs-asymmetric", detail: "其他段落有不對稱或宮位非 balanced，已剔除「整體均衡」類敘述" });
    }
  }

  return { report: next, fixes };
}
