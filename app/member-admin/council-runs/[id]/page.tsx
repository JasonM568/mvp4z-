"use client";

import { useEffect, useState } from "react";

export default function CouncilRunDetail({ params }: { params: Promise<{ id: string }> }) {
  const [adminKey, setAdminKey] = useState("");
  const [run, setRun] = useState<any>(null);
  const [error, setError] = useState("");
  const [id, setId] = useState("");

  useEffect(() => {
    params.then((p) => setId(p.id));
    const saved = window.sessionStorage.getItem("xunfeng_admin_key") || "";
    setAdminKey(saved);
  }, [params]);

  useEffect(() => {
    if (!id || !adminKey) return;
    fetch(`/api/admin/council-runs?id=${id}`, { headers: { "X-Admin-Key": adminKey } })
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) setError(d.error);
        else setRun(d?.run);
      })
      .catch((e) => setError(e?.message || "讀取失敗"));
  }, [id, adminKey]);

  if (!adminKey) {
    return (
      <main style={page}>
        <div style={card}>
          <h1>需要 Admin Key</h1>
          <p>請先回 <a href="/member-admin/council-runs">列表頁</a> 輸入 Admin Key。</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={page}>
        <div style={card}>
          <h1>讀取失敗</h1>
          <p style={{ color: "#991b1b" }}>{error}</p>
        </div>
      </main>
    );
  }

  if (!run) {
    return (
      <main style={page}>
        <div style={card}>讀取中…</div>
      </main>
    );
  }

  return (
    <main style={page}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <a href="/member-admin/council-runs" style={{ display: "inline-block", marginBottom: 12, color: "#10203A", fontWeight: 700 }}>
          ← 返回列表
        </a>

        <div style={card}>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>巽風易學決策報告詳情</h1>
          <div style={{ color: "#64748b", marginTop: 4, fontSize: 13 }}>
            {new Date(run.created_at).toLocaleString("zh-TW")} ｜ {run.profiles?.email || run.user_id}
          </div>

          <div style={metaRow}>
            <Meta label="狀態" value={run.fallback_used ? "兜底交付稿" : run.final_ok ? "正常交付" : "未通過"} />
            <Meta label="扣點" value={`${run.credits_charged} 點`} />
            <Meta label="VIP 免費" value={run.free_quota_used ? "是" : "否"} />
            <Meta label="Tokens in/out" value={`${run.total_tokens_in.toLocaleString()} / ${run.total_tokens_out.toLocaleString()}`} />
          </div>
        </div>

        <Section title="一、正式報告">
          <pre style={pre}>{run.final_text}</pre>
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
      </div>
    </main>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#10203A" }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={card}>
      <h2 style={{ fontSize: 16, fontWeight: 900, margin: 0, marginBottom: 12 }}>{title}</h2>
      {children}
    </div>
  );
}

const page: React.CSSProperties = { minHeight: "100vh", padding: "32px 24px", background: "#f7f9fc", fontFamily: "system-ui, -apple-system, sans-serif" };
const card: React.CSSProperties = { background: "white", padding: 24, borderRadius: 16, border: "1px solid #e2e8f0", marginBottom: 16 };
const metaRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginTop: 16 };
const pre: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 16,
  fontSize: 13,
  lineHeight: 1.7,
  fontFamily: "ui-monospace, monospace",
  margin: 0,
  maxHeight: 600,
  overflow: "auto"
};
