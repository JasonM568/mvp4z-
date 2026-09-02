"use client";

// 面相報告的顯示層。當次分析（/member-ai/face）與事後重看（/member-ai/face/reports/[id]）
// 共用這一份，確保會員回頭下載的 PDF 與當次看到的內容完全一致。

export type StructuredReport = {
  summary?: string;
  currentTrend?: string;
  photoFingerprint?: Array<{ observation?: string; partName?: string; palaces?: string[]; flowYearNote?: string; teaching?: string; interpretation?: string }>;
  coreHighlights?: string[];
  priorityAdvice?: Array<{ problem?: string; reason?: string; advice?: string }>;
  lifeAreas?: Record<string, { conclusion?: string; alignment?: "high" | "medium" | "low" | "insufficient"; visibleBasis?: string; teacherInterpretation?: string; watchout?: string; action?: string; confidence?: "high" | "medium" | "low"; sources?: string[] }>;
  surfaceAnalysis?: { detectedFeatures?: Array<{ type?: "spot" | "mole" | "scar" | "mark"; location?: string; observation?: string; palaces?: string[]; themes?: Array<"六親" | "財運" | "健康">; traditionalReference?: string; flowYearNote?: string; confidence?: "high" | "medium" | "low" }>; complexionObservation?: string; filterWarning?: string | null; summary?: string };
  flowYear?: {
    age?: number;
    positions?: Array<{ method?: "seventy_five_regions" | "nine_value"; position?: string; observation?: string }>;
    crossCheck?: string;
    gates?: string[];
    focus?: string;
    reflection?: string;
  } | null;
  collaborationFramework?: { verdict?: "recommended" | "conditional" | "not_recommended"; verdictReason?: string; suitableRole?: string; suitability?: string; interactionStyle?: string; riskSignals?: string[]; questionsToVerify?: string[]; boundaries?: string } | null;
  palaces?: Array<{ name?: string; evidence?: string; interpretation?: string; advice?: string }>;
};

export function ReportHighlights({ report }: { report: StructuredReport; mode?: "self" | "other" }) {
  const order = ["relationship", "career", "health", "finance", "family"];
  const focus = order.map((key) => [key, report.lifeAreas?.[key]] as const).filter((item): item is [string, NonNullable<typeof item[1]>] => Boolean(item[1]));
  const labels: Record<string, string> = { relationship: "感情", career: "事業", health: "健康", finance: "財運", family: "家庭" };
  return <section className="face-report-summary" aria-label="報告重點">
    <div className="face-report-summary-head"><span>先看這裡</span><h2>本次報告重點</h2></div>
    {report.summary && <article className="face-key-conclusion"><strong>一句話總結</strong><p>{report.summary}</p></article>}
    {report.currentTrend && <article className="face-key-conclusion"><strong>目前最需要注意</strong><p>{report.currentTrend}</p></article>}
    {report.photoFingerprint?.length ? <article className="face-fingerprint-card">
      <h3>這張照片實際辨識到的特徵</h3>
      <p>以下是本次報告使用的照片證據，不是固定範本。每一項都標出對應的部位、宮位與流年歲數。</p>
      <div className="face-fingerprint-list">
        {report.photoFingerprint.map((item, index) => <section key={`${item.observation}-${index}`}>
          <h4>{item.observation}</h4>
          <div className="face-fingerprint-meta">
            {item.partName && <span><b>對應部位</b>{item.partName}</span>}
            {item.palaces?.length ? <span><b>對應宮位</b>{item.palaces.join("、")}</span> : null}
            {item.flowYearNote && <span><b>流年對照</b>{item.flowYearNote}</span>}
          </div>
          {item.interpretation && <p className="face-fingerprint-reading">{item.interpretation}</p>}
          {item.teaching && <details><summary>老師怎麼看這個部位</summary><p>{item.teaching}</p></details>}
        </section>)}
      </div>
    </article> : null}
    {report.flowYear && <article className="face-flowyear-card">
      <h3>本年流年{report.flowYear.age ? `（${report.flowYear.age} 歲）` : ""}</h3>
      {report.flowYear.gates?.length ? <ul className="face-flowyear-gates">{report.flowYear.gates.map((item, index) => <li key={`gate-${index}`}>{item}</li>)}</ul> : null}
      {report.flowYear.positions?.length ? <div className="face-flowyear-grid">{report.flowYear.positions.map((item, index) => <div key={`${item.position}-${index}`}><strong>{flowYearMethodLabel(item.method)}</strong><b>{item.position}</b><p>{item.observation}</p></div>)}</div> : null}
      {report.flowYear.crossCheck && <p><b>併看法：</b>{report.flowYear.crossCheck}</p>}
      {report.flowYear.focus && <p className="face-flowyear-focus"><b>本年該核對的事：</b>{report.flowYear.focus}</p>}
      {report.flowYear.reflection && <small>{report.flowYear.reflection}</small>}
    </article>}
    {report.surfaceAnalysis && <article className="face-surface-card"><h3>斑、痣、疤、痕與氣色</h3><p>{report.surfaceAnalysis.summary}</p>{report.surfaceAnalysis.detectedFeatures?.length ? <ul>{report.surfaceAnalysis.detectedFeatures.map((item, index) => <li key={`${item.location}-${index}`}><strong>{surfaceTypeLabel(item.type)}｜{item.location}</strong>{item.palaces?.length ? <span className="face-surface-palaces">對應宮位：{item.palaces.join("、")}</span> : null}{item.themes?.length ? <span className="face-surface-themes">{item.themes.map((theme) => <em key={theme}>{theme}</em>)}</span> : null}<span>{item.observation}</span><span className="face-surface-reference">{item.traditionalReference}</span>{item.flowYearNote && <span className="face-surface-flowyear">流年對照：{item.flowYearNote}</span>}<small>{confidenceLabel(item.confidence)}</small></li>)}</ul> : <p className="face-none-detected">本次未辨識到可信度足夠的斑、痣、疤或痕。</p>}<p><b>照片氣色：</b>{report.surfaceAnalysis.complexionObservation}</p>{report.surfaceAnalysis.filterWarning && <p className="face-filter-result">照片限制：{report.surfaceAnalysis.filterWarning}</p>}</article>}
    {focus.length > 0 && <div className="face-focus-grid">{focus.map(([key, value]) => <article key={key}><strong>{labels[key] || key}</strong><span className={`face-confidence ${value.confidence || "low"}`}>{confidenceLabel(value.confidence)}</span><div className={`face-alignment ${value.alignment || "insufficient"}`}>老師建議符合度：{alignmentLabel(value.alignment)}</div><h3>{value.conclusion}</h3><p><b>部位依據：</b>{value.visibleBasis}</p><p><b>老師綜合判讀：</b>{value.teacherInterpretation}</p><p><b>需留意：</b>{value.watchout}</p><p><b>具體建議：</b>{value.action}</p></article>)}</div>}
    {report.collaborationFramework && <div className="face-collaboration-card"><h3>合作對象綜合評估</h3><div className={`face-verdict ${report.collaborationFramework.verdict || "conditional"}`}>{verdictLabel(report.collaborationFramework.verdict)}</div><article><strong>為什麼</strong><p>{report.collaborationFramework.verdictReason}</p></article><article><strong>建議承擔角色</strong><p>{report.collaborationFramework.suitableRole}</p></article><article><strong>合作條件</strong><p>{report.collaborationFramework.suitability}</p></article><article><strong>建議相處模式</strong><p>{report.collaborationFramework.interactionStyle}</p></article>{report.collaborationFramework.riskSignals?.length && <article><strong>需留意的合作訊號</strong><ul>{report.collaborationFramework.riskSignals.map((item) => <li key={item}>{item}</li>)}</ul></article>}{report.collaborationFramework.questionsToVerify?.length && <article><strong>合作前先問</strong><ul>{report.collaborationFramework.questionsToVerify.map((item) => <li key={item}>{item}</li>)}</ul></article>}</div>}
  </section>;
}

function confidenceLabel(confidence?: "high" | "medium" | "low") {
  return confidence === "high" ? "可判斷程度：高" : confidence === "medium" ? "可判斷程度：中" : "可判斷程度：低";
}

function alignmentLabel(alignment?: "high" | "medium" | "low" | "insufficient") {
  return alignment === "high" ? "高" : alignment === "medium" ? "中" : alignment === "low" ? "低" : "資料不足";
}

function verdictLabel(verdict?: "recommended" | "conditional" | "not_recommended") {
  return verdict === "recommended" ? "建議合作" : verdict === "not_recommended" ? "暫不建議合作" : "有條件合作";
}

function flowYearMethodLabel(method?: "seventy_five_regions" | "nine_value") {
  return method === "nine_value" ? "九值流年法" : "七十五部位流年法";
}

function surfaceTypeLabel(type?: "spot" | "mole" | "scar" | "mark") {
  return type === "spot" ? "斑" : type === "mole" ? "痣" : type === "scar" ? "疤" : "痕";
}
