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

type AuditChainRow = {
  id: string;
  featureLabel: string;
  observed: string;
  confidence: number;
  teaching: string;
  source: string;
  palaces: string[];
  themes: string[];
  citedInReport: boolean;
  citedBy: string[];
};

type Audit = {
  available: boolean;
  reason?: string;
  matchedCount: number;
  citedCount: number;
  chain: AuditChainRow[];
  unknownCitations: string[];
  skippedFeatures: Array<{ featureLabel: string; reason: string }>;
  flowYear: unknown;
  surfaceImpacts: unknown;
};

export default function FaceAnalysisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [audit, setAudit] = useState<Audit | null>(null);
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
        setAudit(body.audit || null);
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

      {audit && <TeachingAudit audit={audit} />}

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

function TeachingAudit({ audit }: { audit: Audit }) {
  if (!audit.available) {
    return <Section title="教材依據稽核鏈"><p style={{ color: "var(--muted)", margin: 0, lineHeight: 1.8 }}>{audit.reason}</p></Section>;
  }
  const uncited = audit.matchedCount - audit.citedCount;
  return (
    <Section title="教材依據稽核鏈">
      <p style={{ color: "var(--muted)", margin: "0 0 14px", lineHeight: 1.8 }}>
        每一列都是一條可核的鏈路：Vision 對這張照片的觀測值 → 命中的形態條件 → 沈師教材條文與頁碼 → 報告是否引用。
        規則層為查表比對，執行期不會產生表外的教材說法。
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <Tag tone="neutral">命中教材條文 {audit.matchedCount} 條</Tag>
        <Tag tone="good">報告引用 {audit.citedCount} 條</Tag>
        {uncited > 0 && <Tag tone="warn">命中未引用 {uncited} 條</Tag>}
        <Tag tone={audit.unknownCitations.length > 0 ? "bad" : "good"}>
          {audit.unknownCitations.length > 0 ? `假引用 ${audit.unknownCitations.length} 筆` : "無假引用"}
        </Tag>
      </div>

      {audit.unknownCitations.length > 0 && (
        <p style={{ padding: 12, borderRadius: 10, background: "rgba(164,70,50,.18)", color: "#efc0ae", lineHeight: 1.7 }}>
          模型填了規則層沒命中的條文 id：{audit.unknownCitations.join("、")}。
          這些已在產出時自動剔除，但代表該份報告的教材引用不乾淨，內容需人工複核。
        </p>
      )}

      {audit.chain.length === 0 ? (
        <p style={{ color: "var(--muted)", margin: 0 }}>本次照片沒有命中任何教材條文（部位多半不可判讀，或形態不符合任何條件）。</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {audit.chain.map((row) => (
            <article key={row.id} style={{ padding: 16, borderRadius: 12, border: "1px solid rgba(255,255,255,.09)", background: "rgba(0,0,0,.22)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <strong style={{ color: "var(--green)", fontSize: 15 }}>{row.featureLabel}</strong>
                <code style={{ fontSize: 12, color: "var(--muted)" }}>{row.id}</code>
                {row.citedInReport
                  ? <Tag tone="good">報告已引用（{row.citedBy.join("、")}）</Tag>
                  : <Tag tone="warn">命中但報告未引用</Tag>}
              </div>
              <Row label="① Vision 觀測">{row.observed}（信心度 {row.confidence.toFixed(2)}）</Row>
              <Row label="② 教材條文">{row.teaching}</Row>
              <Row label="③ 出處">{row.source}</Row>
              <Row label="④ 對應宮位">{row.palaces.join("、")}｜主題：{row.themes.join("、")}</Row>
            </article>
          ))}
        </div>
      )}

      {audit.skippedFeatures.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", color: "var(--green)", fontWeight: 700 }}>
            未參與判讀的部位（{audit.skippedFeatures.length}）
          </summary>
          <ul style={{ margin: "10px 0 0", paddingLeft: 20, color: "var(--muted)", lineHeight: 1.8 }}>
            {audit.skippedFeatures.map((item) => <li key={item.featureLabel}>{item.featureLabel}：{item.reason}</li>)}
          </ul>
        </details>
      )}

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", color: "var(--green)", fontWeight: 700 }}>流年與斑痣的教材原文（老師版）</summary>
        <pre style={{ ...pre, marginTop: 10 }}>{JSON.stringify({ flowYear: audit.flowYear, surfaceImpacts: audit.surfaceImpacts }, null, 2)}</pre>
      </details>
    </Section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0,1fr)", gap: 10, padding: "5px 0" }}>
      <span style={{ color: "var(--muted)", fontSize: 13 }}>{label}</span>
      <span style={{ color: "var(--text)", fontSize: 14, lineHeight: 1.75 }}>{children}</span>
    </div>
  );
}

function Tag({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: React.ReactNode }) {
  const colors = {
    good: { color: "#cce3b8", background: "rgba(104,145,76,.22)" },
    warn: { color: "#f0dcae", background: "rgba(213,173,96,.2)" },
    bad: { color: "#efc0ae", background: "rgba(164,70,50,.26)" },
    neutral: { color: "var(--muted)", background: "rgba(255,255,255,.07)" }
  }[tone];
  return <span style={{ ...colors, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}>{children}</span>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <article className="kpi-card"><div className="label">{label}</div><div className="value" style={{ fontSize: 20 }}>{value}</div></article>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="kpi-card" style={{ marginTop: 16, padding: 22 }}><h2 style={{ fontSize: 16, margin: "0 0 12px" }}>{title}</h2>{children}</section>;
}

const pre: React.CSSProperties = { whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "rgba(0,0,0,.3)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 16, color: "var(--text)", fontSize: 13, lineHeight: 1.7, fontFamily: "ui-monospace, monospace", margin: 0, maxHeight: 620, overflow: "auto" };
