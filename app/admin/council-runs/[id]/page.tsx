"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminFetch } from "../../_shell";

type CouncilRun = {
  id: string;
  user_id: string;
  request: unknown;
  first_round: unknown;
  debate_round: unknown;
  final_label: string | null;
  final_text: string | null;
  final_ok: boolean;
  fallback_used: boolean;
  total_tokens_in: number;
  total_tokens_out: number;
  credits_charged: number;
  free_quota_used: boolean;
  generated_at: string | null;
  created_at: string;
  profiles?: { email?: string; name?: string } | null;
};

export default function CouncilRunDetail({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [run, setRun] = useState<CouncilRun | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    adminFetch(`/api/admin/council-runs?id=${id}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok || data?.error) {
          setError(data?.error || "讀取失敗");
          return;
        }
        setRun(data?.run || null);
      })
      .catch((e) => setError(e?.message || "讀取失敗"));
  }, [id]);

  async function deleteRun() {
    if (!id || !run) return;
    const ok = window.confirm("確定要刪除這一份易學決策報告？刪除後後台將不再顯示這份報告。");
    if (!ok) return;

    setDeleting(true);
    setError("");
    try {
      const res = await adminFetch(`/api/admin/council-runs?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "刪除失敗");
      router.replace("/admin/council-runs");
    } catch (e) {
      setError(e instanceof Error ? e.message : "刪除失敗");
      setDeleting(false);
    }
  }

  if (error && !run) {
    return (
      <>
        <Link href="/admin/council-runs" style={{ color: "var(--green)", fontWeight: 700 }}>← 返回列表</Link>
        <h1 style={{ marginTop: 14 }}>讀取失敗</h1>
        <p style={{ color: "#ffb7b7" }}>{error}</p>
      </>
    );
  }

  if (!run) {
    return <div style={{ color: "var(--muted)" }}>讀取中⋯</div>;
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Link href="/admin/council-runs" style={{ color: "var(--green)", fontWeight: 700 }}>← 返回列表</Link>
        <button
          className="admin-danger-btn"
          type="button"
          onClick={deleteRun}
          disabled={deleting}
        >
          {deleting ? "刪除中⋯" : "刪除這份報告"}
        </button>
      </div>

      <h1 style={{ marginTop: 14 }}>巽風易學決策報告詳情</h1>
      <p className="lead">
        {new Date(run.created_at).toLocaleString("zh-TW")} ｜ {run.profiles?.email || run.user_id}
      </p>

      {error && (
        <div style={{ padding: 12, background: "rgba(255,143,143,0.1)", border: "1px solid rgba(255,143,143,0.3)", color: "#ffb7b7", borderRadius: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="kpi-grid">
        <Kpi label="狀態" value={run.fallback_used ? "兜底交付稿" : run.final_ok ? "正常交付" : "未通過"} />
        <Kpi label="扣點" value={`${run.credits_charged} 點`} />
        <Kpi label="VIP 免費" value={run.free_quota_used ? "是" : "否"} />
        <Kpi label="Tokens in/out" value={`${run.total_tokens_in.toLocaleString()} / ${run.total_tokens_out.toLocaleString()}`} />
      </div>

      <Section title="一、正式報告">
        <pre style={pre}>{run.final_text || "（無內容）"}</pre>
      </Section>

      <Section title="二、問事資料">
        <pre style={pre}>{JSON.stringify(run.request, null, 2)}</pre>
      </Section>

      <Section title="三、第一輪原始（3 個分身）">
        <pre style={pre}>{JSON.stringify(run.first_round, null, 2)}</pre>
      </Section>

      {run.debate_round && (
        <Section title="四、第二輪攻防（3 個分身）">
          <pre style={pre}>{JSON.stringify(run.debate_round, null, 2)}</pre>
        </Section>
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <article className="kpi-card">
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: 20 }}>{value}</div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="kpi-card" style={{ marginTop: 16, padding: 22 }}>
      <h2 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 12px" }}>{title}</h2>
      {children}
    </section>
  );
}

const pre: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: 16,
  color: "var(--text)",
  fontSize: 13,
  lineHeight: 1.7,
  fontFamily: "ui-monospace, monospace",
  margin: 0,
  maxHeight: 620,
  overflow: "auto"
};
