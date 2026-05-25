"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../_shell";

type Run = {
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

export default function CouncilRunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/api/admin/council-runs?limit=100")
      .then((r) => r.json())
      .then((d) => setRuns(d?.runs || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <h1>易學決策紀錄</h1>
      <p className="lead">每份報告的 7 次 LLM 校核結果、token 用量、扣點明細。</p>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>時間</th>
              <th>會員</th>
              <th>狀態</th>
              <th>扣點</th>
              <th>Tokens (in/out)</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="admin-empty">讀取中⋯</td>
              </tr>
            )}
            {!loading && runs.length === 0 && (
              <tr>
                <td colSpan={6} className="admin-empty">尚無紀錄</td>
              </tr>
            )}
            {!loading && runs.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString("zh-TW")}</td>
                <td>
                  {r.profiles?.name && <div>{r.profiles.name}</div>}
                  {r.profiles?.email && <div className="muted">{r.profiles.email}</div>}
                  {!r.profiles && <div className="muted">{r.user_id.slice(0, 8)}…</div>}
                </td>
                <td>
                  {r.fallback_used ? (
                    <span className="admin-pill cancelled">兜底</span>
                  ) : r.final_ok ? (
                    <span className="admin-pill confirmed">正常</span>
                  ) : (
                    <span className="admin-pill spam">未交付</span>
                  )}
                  {r.free_quota_used && <span className="admin-pill contacted" style={{ marginLeft: 4 }}>VIP 免費</span>}
                </td>
                <td>{r.credits_charged} 點</td>
                <td>{r.total_tokens_in.toLocaleString()} / {r.total_tokens_out.toLocaleString()}</td>
                <td>
                  <Link href={`/admin/council-runs/${r.id}`} style={{ color: "var(--green)", fontWeight: 700 }}>詳情</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
