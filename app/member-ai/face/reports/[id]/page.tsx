"use client";

import "../../face.css";
import "./report.css";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { ReportHighlights, type StructuredReport } from "../../_report-view";

type FaceRun = {
  id: string;
  mode: "self" | "other";
  status: string;
  report_text: string | null;
  report_structured: StructuredReport | null;
  credits_charged: number;
  image_deleted_at: string | null;
  completed_at: string | null;
  created_at: string;
};

const TOKEN_KEY = "xunfeng_member_token";

export default function FaceReportPage() {
  const params = useParams<{ id: string }>();
  const [run, setRun] = useState<FaceRun | null>(null);
  const [error, setError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY) || "";
    if (!token) {
      window.location.href = "/login?next=/member-ai/face/reports/" + params.id;
      return;
    }
    fetch("/api/face-analysis/runs/" + params.id, { headers: { Authorization: "Bearer " + token } })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "無法載入面相報告");
        setRun(data.run as FaceRun);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "無法載入面相報告"));
  }, [params.id]);

  /**
   * 下載 PDF。
   *
   * 2026-09-08 之前這裡是 window.print()，由會員自己在列印視窗選「另存 PDF」——
   * 手機（尤其 iOS Safari）不直覺，而且每個瀏覽器印出來的版面都不一樣，
   * 等於沒有一份固定的檔案可言。現在改由伺服器產一份真正的 PDF。
   *
   * 用 fetch 而不是直接 <a href>：下載需要 bearer token，帶不進 <a> 的 header。
   */
  async function downloadPdf() {
    if (!run) return;
    setPdfBusy(true);
    setPdfError("");
    try {
      const token = window.localStorage.getItem(TOKEN_KEY) || "";
      const response = await fetch(`/api/face-analysis/runs/${run.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "PDF 產生失敗，請稍後再試");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `巽風面相報告-${run.id.slice(0, 8)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // 立刻 revoke 在部分瀏覽器會讓下載中斷，延後釋放。
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (reason) {
      setPdfError(reason instanceof Error ? reason.message : "PDF 產生失敗，請稍後再試");
    } finally {
      setPdfBusy(false);
    }
  }

  function downloadText() {
    if (!run?.report_text) return;
    const blob = new Blob([run.report_text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildFileBase(run) + ".txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const report = run?.report_structured || null;
  const hasContent = Boolean(report || run?.report_text);

  return (
    <>
      <SiteHeader showMobileDock={false} />
      <main className="face-page face-report-page">
        <a className="face-report-back" href="/member-ai/face/history">← 回到面相報告紀錄</a>
        {error ? <p className="face-notice" role="status">{error}</p> : !run ? (
          <p className="face-notice" role="status">正在載入報告…</p>
        ) : (
          <div className="face-panel face-report">
            <header className="face-report-head">
              <div className="face-eyebrow">面相文化觀察報告</div>
              <h1>巽風面相報告</h1>
              <div className="face-report-head-meta">
                <span>{run.mode === "self" ? "自我分析" : "他人分析"}</span>
                <span>{formatDate(run.completed_at || run.created_at)}</span>
                <span>本次 {run.credits_charged} 點</span>
              </div>
            </header>

            {!hasContent ? (
              <p className="face-notice" role="status">
                {run.status === "deleted"
                  ? "這份報告的內容已由您本人刪除，無法復原。"
                  : run.status === "expired"
                    ? "這次分析未完成，沒有可顯示的報告內容。"
                    : "此筆記錄沒有可顯示的報告內容。"}
              </p>
            ) : report ? (
              <ReportHighlights report={report} mode={run.mode} />
            ) : (
              <article className="face-report-plain"><pre>{run.report_text}</pre></article>
            )}

            {hasContent && (
              <p className="face-fineprint">
                本報告為民俗文化與自我觀察參考，不作醫療、心理、法律或投資判斷。
              </p>
            )}

            {pdfError && <p className="face-report-error" role="alert">{pdfError}</p>}
            <div className="face-report-actions">
              {hasContent && (
                <button className="face-primary" onClick={() => void downloadPdf()} disabled={pdfBusy}>
                  {pdfBusy ? "PDF 產生中…" : "下載 PDF"}
                </button>
              )}
              {run.report_text && <button className="face-secondary" onClick={downloadText}>下載文字</button>}
              <a className="face-secondary" href="/member-ai/face/history">我的所有報告</a>
              <a className="face-secondary" href="/member-ai/face">新增面相分析</a>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function buildFileBase(run: FaceRun) {
  const at = new Date(run.completed_at || run.created_at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `巽風面相報告_${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}
