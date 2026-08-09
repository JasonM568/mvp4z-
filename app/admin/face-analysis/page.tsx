"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { adminFetch } from "../_shell";

type Run = {
  id: string;
  user_id: string;
  mode: "self" | "other";
  status: string;
  credits_charged: number;
  error_code: string | null;
  image_deleted_at: string | null;
  created_at: string;
  profiles?: { email?: string; name?: string } | null;
};

type Metrics = {
  sample_size: number;
  quality_pass_rate: number | null;
  completion_rate: number | null;
  average_duration_ms: number | null;
  average_cost_estimate: number | null;
  credits_charged_total: number;
  top_errors: Array<{ code: string; count: number }>;
};

const initialMetrics: Metrics = {
  sample_size: 0,
  quality_pass_rate: null,
  completion_rate: null,
  average_duration_ms: null,
  average_cost_estimate: null,
  credits_charged_total: 0,
  top_errors: []
};

export default function FaceAnalysisAdminPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: "", error: "", model: "", from: "", to: "" });

  async function load(cursor?: string, append = false) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "30" });
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    if (cursor) params.set("cursor", cursor);
    try {
      const response = await adminFetch(`/api/admin/face-analysis?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "讀取失敗");
      setRuns((current) => (append ? [...current, ...(body.runs || [])] : body.runs || []));
      setMetrics(body.metrics || initialMetrics);
      setNextCursor(body.pagination?.next_cursor || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "讀取失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Initial load only; filters are submitted explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  return (
    <>
      <h1>面相分析營運</h1>
      <p className="lead">僅顯示分析狀態與營運資料；列表不讀取原圖、儲存路徑或大型分析 JSON。</p>

      <div className="kpi-grid">
        <Kpi label="統計樣本" value={`${metrics.sample_size} 筆`} />
        <Kpi label="品質通過率" value={percent(metrics.quality_pass_rate)} />
        <Kpi label="分析完成率" value={percent(metrics.completion_rate)} />
        <Kpi label="平均耗時" value={duration(metrics.average_duration_ms)} />
        <Kpi label="平均模型成本" value={metrics.average_cost_estimate == null ? "—" : `$${metrics.average_cost_estimate.toFixed(4)}`} />
        <Kpi label="扣點總額" value={`${metrics.credits_charged_total} 點`} />
      </div>

      <form className="admin-filter" onSubmit={submit} style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "18px 0" }}>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">全部狀態</option>
          {['created', 'uploaded', 'quality_rejected', 'analyzing', 'completed', 'failed', 'deleted'].map((status) => <option key={status}>{status}</option>)}
        </select>
        <input placeholder="錯誤代碼" value={filters.error} onChange={(e) => setFilters({ ...filters, error: e.target.value })} />
        <input placeholder="Model" value={filters.model} onChange={(e) => setFilters({ ...filters, model: e.target.value })} />
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} aria-label="開始日期" />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} aria-label="結束日期" />
        <button className="admin-action-btn" type="submit" disabled={loading}>套用篩選</button>
      </form>

      {metrics.top_errors.length > 0 && <p className="lead">主要錯誤：{metrics.top_errors.map((item) => `${item.code} (${item.count})`).join("、")}</p>}
      {error && <p style={{ color: "#ffb7b7" }}>{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>時間</th><th>會員</th><th>模式</th><th>狀態</th><th>照片</th><th>扣點</th><th>操作</th></tr></thead>
          <tbody>
            {loading && runs.length === 0 && <tr><td colSpan={7} className="admin-empty">讀取中⋯</td></tr>}
            {!loading && runs.length === 0 && <tr><td colSpan={7} className="admin-empty">尚無紀錄</td></tr>}
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{new Date(run.created_at).toLocaleString("zh-TW")}</td>
                <td>{run.profiles?.name || run.profiles?.email || `${run.user_id.slice(0, 8)}…`}</td>
                <td>{run.mode === "self" ? "本人" : "他人"}</td>
                <td><span className="admin-pill contacted">{run.status}</span>{run.error_code && <div className="muted">{run.error_code}</div>}</td>
                <td>{run.image_deleted_at ? "已刪除" : "待清理"}</td>
                <td>{run.credits_charged} 點</td>
                <td><Link href={`/admin/face-analysis/${run.id}`} style={{ color: "var(--green)", fontWeight: 700 }}>詳情</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextCursor && <button className="admin-action-btn ghost" style={{ marginTop: 16 }} disabled={loading} onClick={() => void load(nextCursor, true)}>{loading ? "讀取中⋯" : "載入更多"}</button>}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <article className="kpi-card"><div className="label">{label}</div><div className="value" style={{ fontSize: 20 }}>{value}</div></article>;
}

function percent(value: number | null) {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function duration(value: number | null) {
  return value == null ? "—" : `${(value / 1000).toFixed(1)} 秒`;
}
