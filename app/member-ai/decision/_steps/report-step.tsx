// 階段四：報告呈現頁（Report）— 四象儀表板＋順轉結論＋完整顧問書
// structured=null（兜底稿／LLM 未輸出合法 JSON）是一等公民路徑：
// 隱藏儀表板與圖卡、白紙全文直接展開。個別欄位缺（timing/signal）→ 該元素不渲染。
// 列印 PDF 走 .council-print 副本（掛在 page.tsx），這裡全部在 .council-screen 內、列印時自動隱藏。

import type { CouncilStructured } from "@/lib/ai/council/structured";
import { ASPECT_CONFIG, ResonanceRing, resonanceLabel, SIGNAL_COLORS } from "../_aspects";
import { ReportDocument, ReportToc, type ReportMeta } from "../_report-document";
import { ShareCardButton } from "../_share-card";

const DECISION_COLORS: Record<string, string> = {
  可進: "#4ade80",
  可試行: "#6ff0b4",
  暫緩: "#facc15",
  不建議: "#f87171",
  補資料後再判: "#9ca3af"
};

export function ReportStep({
  question,
  structured,
  report,
  reportMeta,
  notice,
  fileBase,
  onRetry,
  onCopy,
  onDownloadMd,
  onDownloadJson,
  onDownloadPdf
}: {
  question: string;
  structured: CouncilStructured | null;
  report: string;
  reportMeta: ReportMeta | null;
  notice: string;
  fileBase: string;
  onRetry: () => void;
  onCopy: () => void;
  onDownloadMd: () => void;
  onDownloadJson: () => void;
  onDownloadPdf: () => void;
}) {
  return (
    <section className="section" style={{ paddingTop: 26 }}>
      <div className="wrap xf-report-wrap">
        <div className="xf-step-hint">步驟 3/3：四象合參</div>

        <header className="xf-report-head">
          {question && <p className="xf-report-question">你問的是：「{question}」</p>}
          <h1 className="xf-report-title">《巽風四象天機書》</h1>
          {reportMeta?.date && <p className="xf-report-date">{reportMeta.date} 生成</p>}
          {notice && <div className="status ok" style={{ marginTop: 10 }}>{notice}</div>}
        </header>

        {structured ? (
          <>
            <article className="panel xf-resonance">
              <ResonanceRing value={structured.resonance} />
              <div className="xf-resonance-text">
                <div className="xf-resonance-label">{resonanceLabel(structured.aspects.length)}</div>
                <p>四套古法交叉驗算的結論一致程度。共鳴度越高，代表不同術數指向同一個方向。</p>
              </div>
            </article>

            <div className="xf-aspect-grid">
              {structured.aspects.map((a) => {
                const cfg = ASPECT_CONFIG[a.key];
                return (
                  <article key={a.key} className="panel xf-aspect-card" style={{ borderTopColor: cfg.color }}>
                    <div className="xf-aspect-head">
                      <span className="xf-aspect-name" style={{ color: cfg.color }}>{cfg.name}</span>
                      <span className="xf-aspect-sub">{cfg.sub}</span>
                      {a.signal && (
                        <span
                          className="xf-aspect-signal"
                          style={{ background: SIGNAL_COLORS[a.signal] }}
                          title={a.signal === "green" ? "吉" : a.signal === "yellow" ? "中平" : "凶"}
                        />
                      )}
                    </div>
                    <p className="xf-aspect-summary">{a.summary}</p>
                    <div className="xf-aspect-conf">
                      <div className="xf-aspect-conf-bar">
                        <div style={{ width: `${a.confidence}%`, background: cfg.color }} />
                      </div>
                      <span>信心 {a.confidence}%</span>
                    </div>
                    {a.timing && <div className="xf-aspect-timing">⏳ {a.timing}</div>}
                  </article>
                );
              })}
            </div>

            <article className="panel xf-conclusion">
              <h2>🧭 你的順轉方向</h2>
              {structured.decision && (
                <span
                  className="xf-decision-badge"
                  style={{ borderColor: DECISION_COLORS[structured.decision], color: DECISION_COLORS[structured.decision] }}
                >
                  {structured.decision}
                </span>
              )}
              <p className="xf-conclusion-headline">{structured.headline}</p>
              {structured.steps.length > 0 && (
                <>
                  <div className="xf-field-label" style={{ marginTop: 14 }}>現在做這幾件事</div>
                  <ol className="xf-conclusion-steps">
                    {structured.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </>
              )}
            </article>
          </>
        ) : (
          <article className="panel" style={{ borderColor: "rgba(210,169,84,.4)" }}>
            <h2 style={{ marginTop: 0 }}>本次採完整文字判讀</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>
              本次校核以完整顧問書形式交付，未產出四象儀表板摘要。完整判讀內容請見下方報告全文。
            </p>
          </article>
        )}

        <div className="xf-report-actions">
          <button className="btn gold" onClick={onDownloadPdf} disabled={!report}>下載天機書 PDF</button>
          <a className="btn primary" href="/member">儲存於我的巽風</a>
          <a className="btn" href="/booking">預約老師覆核</a>
          <button className="btn" onClick={onRetry}>再問一件事</button>
        </div>

        <details className="xf-download-more">
          <summary>分享與更多下載</summary>
          <div>
            {structured && (
              <ShareCardButton
                question={question}
                structured={structured}
                dateLabel={reportMeta?.date || ""}
                fileBase={fileBase}
              />
            )}
            <button className="btn" onClick={onDownloadMd}>下載 Markdown</button>
            <button className="btn" onClick={onDownloadJson}>下載 JSON</button>
            <button className="btn" onClick={onCopy}>複製文字</button>
          </div>
        </details>

        {structured ? (
          <details className="xf-report-collapse">
            <summary>展開完整顧問書全文（十段式專業報告）</summary>
            <div style={{ marginTop: 14 }}>
              <ReportToc text={report} idPrefix="screen-report" />
              <ReportDocument text={report} meta={reportMeta ?? undefined} idPrefix="screen-report" />
              <a className="xf-back-to-top" href="#top">回到頁面頂端 ↑</a>
            </div>
          </details>
        ) : (
          <div style={{ marginTop: 8 }}>
            <ReportToc text={report} idPrefix="screen-report" />
            <ReportDocument text={report} meta={reportMeta ?? undefined} idPrefix="screen-report" />
            <a className="xf-back-to-top" href="#top">回到頁面頂端 ↑</a>
          </div>
        )}
      </div>
    </section>
  );
}
