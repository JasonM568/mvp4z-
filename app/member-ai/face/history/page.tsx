"use client";

import "./history.css";
import { useCallback, useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";

type FaceRun = {
  id: string;
  mode: "self" | "other";
  status: string;
  report_text: string | null;
  report_structured: { summary?: string } | null;
  credits_charged: number;
  image_deleted_at: string | null;
  completed_at: string | null;
  created_at: string;
};

const TOKEN_KEY = "xunfeng_member_token";

export default function FaceHistoryPage() {
  const [runs, setRuns] = useState<FaceRun[]>([]);
  const [selected, setSelected] = useState<FaceRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const token = () => window.localStorage.getItem(TOKEN_KEY) || "";

  const loadRuns = useCallback(async () => {
    const bearer = token();
    if (!bearer) {
      window.location.href = "/login?next=/member-ai/face/history";
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/face-analysis/runs?limit=20", {
        headers: { Authorization: `Bearer ${bearer}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "無法載入歷史報告");
      setRuns(Array.isArray(data.items) ? data.items : Array.isArray(data.runs) ? data.runs : []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "無法載入歷史報告");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRuns(); }, [loadRuns]);

  async function showDetails(id: string) {
    setBusyId(id);
    setNotice("");
    try {
      const response = await fetch(`/api/face-analysis/runs/${id}`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "無法載入報告");
      setSelected(data.run);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "無法載入報告");
    } finally {
      setBusyId(null);
    }
  }

  async function removeImage(run: FaceRun) {
    if (!window.confirm("確定立即刪除這份記錄的原始照片？報告會保留。")) return;
    await performDelete(`/api/face-analysis/runs/${run.id}/image`, run.id, "原始照片已刪除。");
  }

  async function removeRun(run: FaceRun) {
    if (!window.confirm("確定刪除這份報告？照片、觀察結果與報告內容將無法復原。")) return;
    await performDelete(`/api/face-analysis/runs/${run.id}`, run.id, "報告與敏感資料已刪除。");
    setSelected((value) => value?.id === run.id ? null : value);
  }

  async function performDelete(url: string, id: string, success: string) {
    setBusyId(id);
    setNotice("");
    try {
      const response = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "刪除失敗");
      setNotice(success);
      await loadRuns();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "刪除失敗");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="face-history-page">
        <header className="face-history-head">
          <div><span>巽風易學 AI</span><h1>面相報告紀錄</h1><p>這裡只顯示報告資料，不會以人臉縮圖作為歷史封面。</p></div>
          <a href="/member-ai/face">新增面相分析</a>
        </header>
        {notice && <p className="face-history-notice" role="status">{notice}</p>}
        {loading ? <p className="face-history-empty">載入中…</p> : runs.length === 0 ? (
          <section className="face-history-empty"><h2>還沒有面相報告</h2><p>完成第一份分析後，報告會出現在這裡。</p></section>
        ) : (
          <div className="face-history-layout">
            <section className="face-history-list" aria-label="面相報告列表">
              {runs.map((run) => <article key={run.id}>
                <div className="face-history-meta"><span>{run.mode === "self" ? "自我分析" : "他人分析"}</span><time>{formatDate(run.completed_at || run.created_at)}</time></div>
                <h2>{statusLabel(run.status)}</h2>
                <p>{summary(run)}</p>
                <dl><div><dt>扣點</dt><dd>{run.credits_charged}</dd></div><div><dt>原始照片</dt><dd>{run.image_deleted_at ? "已刪除" : "將自動刪除"}</dd></div></dl>
                <div className="face-history-actions">
                  <button onClick={() => showDetails(run.id)} disabled={busyId === run.id}>查看報告</button>
                  {!run.image_deleted_at && <button onClick={() => removeImage(run)} disabled={busyId === run.id}>只刪照片</button>}
                  <button className="danger" onClick={() => removeRun(run)} disabled={busyId === run.id}>刪除報告</button>
                </div>
              </article>)}
            </section>
            <aside className="face-history-detail" aria-live="polite">
              {selected ? <><button className="face-history-close" onClick={() => setSelected(null)} aria-label="關閉報告">×</button><span>民俗文化觀察報告</span><h2>{formatDate(selected.completed_at || selected.created_at)}</h2><pre>{selected.report_text || "此筆記錄沒有可顯示的報告內容。"}</pre></> : <div className="face-history-placeholder">選擇一份記錄查看完整報告</div>}
            </aside>
          </div>
        )}
      </main>
    </>
  );
}

function summary(run: FaceRun) {
  return run.report_structured?.summary || run.report_text?.slice(0, 90) || (run.status === "failed" ? "本次分析未完成。" : "報告已刪除或尚未產生。");
}
function formatDate(value: string) { return new Date(value).toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" }); }
function statusLabel(status: string) { return ({ completed: "分析完成", failed: "分析未完成", deleted: "內容已刪除" } as Record<string, string>)[status] || "處理中"; }
