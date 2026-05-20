"use client";

import { useEffect, useState } from "react";

type RunListItem = {
  id: string;
  user_id: string;
  credits_charged: number;
  free_quota_used: boolean;
  fallback_used: boolean;
  final_ok: boolean;
  total_tokens_in: number;
  total_tokens_out: number;
  created_at: string;
  profiles?: { email?: string; name?: string } | null;
};

const ADMIN_KEY_STORAGE = "xunfeng_admin_key";

export default function CouncilRunsPage() {
  const [adminKey, setAdminKey] = useState("");
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = window.sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";
    if (saved) setAdminKey(saved);
  }, []);

  function persistKey(value: string) {
    setAdminKey(value);
    window.sessionStorage.setItem(ADMIN_KEY_STORAGE, value);
  }

  async function load() {
    if (!adminKey.trim()) {
      setError("請先輸入 Admin Key");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/council-runs?limit=50", {
        headers: { "X-Admin-Key": adminKey.trim() }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "讀取失敗");
        setRuns([]);
      } else {
        setRuns((data?.runs || []) as RunListItem[]);
      }
    } catch (e: any) {
      setError(e?.message || "讀取失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: "32px 24px", fontFamily: "system-ui, -apple-system, sans-serif", background: "#f7f9fc" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>巽風易學決策報告｜後台</h1>
        <p style={{ color: "#607089", marginBottom: 24 }}>近 50 份報告紀錄（含 fallback、token、扣點狀況）。</p>

        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => persistKey(e.target.value)}
            placeholder="Admin Key"
            style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "1px solid #d9e3f0", fontSize: 14 }}
          />
          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: "10px 24px",
              borderRadius: 12,
              background: "#10203A",
              color: "white",
              fontWeight: 900,
              border: "none",
              cursor: loading ? "wait" : "pointer"
            }}
          >
            {loading ? "讀取中…" : "讀取"}
          </button>
        </div>

        {error && (
          <div style={{ background: "#fff5f5", border: "1px solid #fca5a5", color: "#991b1b", padding: 12, borderRadius: 12, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ overflow: "auto", background: "white", borderRadius: 16, border: "1px solid #e2e8f0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                <th style={th}>時間</th>
                <th style={th}>會員</th>
                <th style={th}>狀態</th>
                <th style={th}>扣點</th>
                <th style={th}>Tokens (in/out)</th>
                <th style={th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
                    {adminKey ? "目前沒有紀錄。按上方「讀取」載入。" : "請先輸入 Admin Key。"}
                  </td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                  <td style={td}>{new Date(r.created_at).toLocaleString("zh-TW")}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{r.profiles?.name || "—"}</div>
                    <div style={{ color: "#64748b", fontSize: 12 }}>{r.profiles?.email || r.user_id.slice(0, 8)}</div>
                  </td>
                  <td style={td}>
                    {r.fallback_used ? (
                      <span style={badge("#fef3c7", "#92400e")}>兜底</span>
                    ) : r.final_ok ? (
                      <span style={badge("#dcfce7", "#166534")}>正常</span>
                    ) : (
                      <span style={badge("#fee2e2", "#991b1b")}>未交付</span>
                    )}
                    {r.free_quota_used && <span style={{ ...badge("#dbeafe", "#1e40af"), marginLeft: 4 }}>VIP 免費</span>}
                  </td>
                  <td style={td}>{r.credits_charged} 點</td>
                  <td style={td}>
                    {r.total_tokens_in.toLocaleString()} / {r.total_tokens_out.toLocaleString()}
                  </td>
                  <td style={td}>
                    <a
                      href={`/member-admin/council-runs/${r.id}`}
                      style={{ color: "#10203A", fontWeight: 700, textDecoration: "underline" }}
                    >
                      詳情
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

const th: React.CSSProperties = { padding: "12px 16px", fontWeight: 800, color: "#10203A", fontSize: 12, textTransform: "uppercase" };
const td: React.CSSProperties = { padding: "12px 16px", verticalAlign: "top" };
function badge(bg: string, fg: string): React.CSSProperties {
  return { display: "inline-block", padding: "2px 10px", borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 800 };
}
