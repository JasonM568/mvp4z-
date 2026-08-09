"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminFetch } from "../../_shell";

type Run = {
  id: string;
  user_id: string;
  mode: string;
  subject_age: number | null;
  status: string;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  quality_result: unknown;
  vision_result: unknown;
  report_structured: unknown;
  report_text: string | null;
  model_trace: unknown;
  credits_charged: number;
  error_code: string | null;
  image_expires_at: string;
  image_deleted_at: string | null;
  completed_at: string | null;
  created_at: string;
  profiles?: { email?: string; name?: string } | null;
};

type Event = { id: string; event_type: string; metadata: unknown; created_at: string };

export default function FaceAnalysisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);

  useEffect(() => {
    params.then(async ({ id }) => {
      try {
        const response = await adminFetch(`/api/admin/face-analysis/${id}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "讀取失敗");
        setRun(body.run || null);
        setEvents(body.events || []);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "讀取失敗");
      }
    });
  }, [params]);

  if (error) return <><Link href="/admin/face-analysis" style={{ color: "var(--green)" }}>← 返回列表</Link><p style={{ color: "#ffb7b7" }}>{error}</p></>;
  if (!run) return <div style={{ color: "var(--muted)" }}>讀取中⋯</div>;

  async function previewImage() {
    if (!run || !window.confirm("確定因營運查核需要查看原始照片？本次操作會留下稽核紀錄，連結 5 分鐘後失效。")) return;
    setPreviewBusy(true);
    try {
      const response = await adminFetch(`/api/admin/face-analysis/${run.id}/preview`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "無法建立預覽");
      setPreviewUrl(body.url || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法建立預覽");
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <>
      <Link href="/admin/face-analysis" style={{ color: "var(--green)", fontWeight: 700 }}>← 返回列表</Link>
      <h1 style={{ marginTop: 14 }}>面相分析詳情</h1>
      <p className="lead">{new Date(run.created_at).toLocaleString("zh-TW")} ｜ {run.profiles?.email || run.user_id}</p>
      <p className="lead">本頁不取得照片路徑，也不會自動建立圖片預覽。</p>

      <div className="kpi-grid">
        <Kpi label="狀態" value={run.status} />
        <Kpi label="模式" value={run.mode === "self" ? "本人" : "他人"} />
        <Kpi label="扣點" value={`${run.credits_charged} 點`} />
        <Kpi label="照片狀態" value={run.image_deleted_at ? "已刪除" : "待清理"} />
      </div>

      {!run.image_deleted_at && Date.parse(run.image_expires_at) > Date.now() && (
        <Section title="原始照片（明確操作＋稽核）">
          <button onClick={previewImage} disabled={previewBusy}>
            {previewBusy ? "建立短效預覽中…" : "建立 5 分鐘短效預覽"}
          </button>
          {previewUrl && <img src={previewUrl} alt="管理員明確要求的面相原始照片短效預覽" style={{ display: "block", maxWidth: 520, width: "100%", marginTop: 16, borderRadius: 12 }} />}
        </Section>
      )}

      <Section title="執行資訊"><pre style={pre}>{JSON.stringify({ age: run.subject_age, mime_type: run.mime_type, file_size: run.file_size, dimensions: run.width && run.height ? `${run.width}×${run.height}` : null, error_code: run.error_code, image_expires_at: run.image_expires_at, completed_at: run.completed_at }, null, 2)}</pre></Section>
      <Section title="品質結果"><pre style={pre}>{JSON.stringify(run.quality_result, null, 2)}</pre></Section>
      <Section title="Vision 受限觀察"><pre style={pre}>{JSON.stringify(run.vision_result, null, 2)}</pre></Section>
      <Section title="規則與結構化報告"><pre style={pre}>{JSON.stringify(run.report_structured, null, 2)}</pre></Section>
      <Section title="正式報告"><pre style={pre}>{run.report_text || "（無內容）"}</pre></Section>
      <Section title="Model trace"><pre style={pre}>{JSON.stringify(run.model_trace, null, 2)}</pre></Section>
      <Section title="Audit events"><pre style={pre}>{JSON.stringify(events, null, 2)}</pre></Section>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <article className="kpi-card"><div className="label">{label}</div><div className="value" style={{ fontSize: 20 }}>{value}</div></article>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="kpi-card" style={{ marginTop: 16, padding: 22 }}><h2 style={{ fontSize: 16, margin: "0 0 12px" }}>{title}</h2>{children}</section>;
}

const pre: React.CSSProperties = { whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "rgba(0,0,0,.3)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 16, color: "var(--text)", fontSize: 13, lineHeight: 1.7, fontFamily: "ui-monospace, monospace", margin: 0, maxHeight: 620, overflow: "auto" };
