// 9:16 分享圖卡（SPEC 4.4）：問題＋順轉結論＋共鳴度＋品牌
// 隱藏 360x640 節點 → html2canvas scale 3 → 1080x1920 PNG。
// 相容紅線：不用 conic-gradient / backdrop-filter / 外域圖片（html2canvas 不支援或髒 canvas）。
// 下載順序：Web Share（iOS/Android 系統分享面板）→ a.download → 長按圖片儲存提示。

import { useEffect, useRef, useState } from "react";
import type { CouncilStructured } from "@/lib/ai/council/structured";
import { ASPECT_CONFIG, ResonanceRing, resonanceLabel } from "./_aspects";

export function ShareCardButton({
  question,
  structured,
  dateLabel,
  fileBase
}: {
  question: string;
  structured: CouncilStructured;
  dateLabel: string;
  fileBase: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [failNote, setFailNote] = useState("");

  // 關閉預覽時釋放 blob URL
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  async function generateCard() {
    if (!cardRef.current || busy) return;
    setBusy(true);
    setFailNote("");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        backgroundColor: "#04120d",
        logging: false
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("no blob");
      setPreview({ url: URL.createObjectURL(blob), blob });
    } catch {
      setFailNote("圖卡產生失敗，請改用「下載 PDF」保存報告。");
    } finally {
      setBusy(false);
    }
  }

  async function shareOrDownload() {
    if (!preview) return;
    const fileName = `${fileBase}_順轉圖卡.png`;
    const file = new File([preview.blob], fileName, { type: "image/png" });
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "風羿・四象順轉導航" });
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return; // 使用者取消分享，不強制下載
      }
    }
    const a = document.createElement("a");
    a.href = preview.url;
    a.download = fileName;
    a.click();
  }

  const shownSteps = structured.steps.slice(0, 3);

  return (
    <>
      <button className="btn gold" onClick={generateCard} disabled={busy}>
        {busy ? "圖卡產生中…" : "📤 儲存順轉圖卡"}
      </button>
      {failNote && <span style={{ color: "#f87171", fontSize: 13, alignSelf: "center" }}>{failNote}</span>}

      {/* 隱藏的 9:16 圖卡本體（不可 display:none，html2canvas 需要 layout） */}
      <div className="xf-card-stage" aria-hidden>
        <div ref={cardRef} className="xf-card">
          <div className="xf-card-brand">
            <span className="xf-card-logo">巽風</span>
            <span className="xf-card-brand-sub">巽風堪輿研究中心</span>
          </div>
          <div className="xf-card-title">風羿・四象順轉導航</div>
          {question && <div className="xf-card-question">「{truncate(question, 40)}」</div>}
          <div className="xf-card-ring">
            <ResonanceRing value={structured.resonance} size={140} stroke={11} color="#d2a954" />
            <div className="xf-card-ring-label">{resonanceLabel(structured.aspects.length)}</div>
          </div>
          <div className="xf-card-headline">{truncate(structured.headline, 60)}</div>
          <div className="xf-card-aspects">
            {structured.aspects.map((a) => (
              <div key={a.key} className="xf-card-aspect">
                <span className="xf-card-aspect-dot" style={{ background: ASPECT_CONFIG[a.key].color }} />
                <span className="xf-card-aspect-name">{ASPECT_CONFIG[a.key].name}</span>
                <span className="xf-card-aspect-pct">{a.confidence}%</span>
              </div>
            ))}
          </div>
          {shownSteps.length > 0 && (
            <ol className="xf-card-steps">
              {shownSteps.map((s, i) => (
                <li key={i}>{truncate(s, 24)}</li>
              ))}
            </ol>
          )}
          <div className="xf-card-foot">
            <span>{dateLabel}</span>
            <span>www.xunfeng.tw</span>
          </div>
        </div>
      </div>

      {preview && (
        <div className="xf-card-modal" role="dialog" aria-label="順轉圖卡預覽">
          <div className="xf-card-modal-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt="順轉圖卡" />
            <p className="xf-card-modal-hint">手機若無法直接儲存，可長按圖片存到相簿。</p>
            <div className="xf-card-modal-actions">
              <button className="btn primary" onClick={shareOrDownload}>分享／下載</button>
              <button className="btn" onClick={() => setPreview(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function truncate(text: string, max: number) {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
