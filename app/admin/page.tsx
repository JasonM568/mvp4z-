"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "./_shell";

type Booking = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  service: string | null;
  status: string;
  created_at: string;
};

type Order = {
  id: string;
  order_no: string;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  profiles?: { email?: string; name?: string } | null;
  plans?: { code?: string; name?: string } | null;
};

type CouncilRun = {
  id: string;
  created_at: string;
  credits_charged: number;
  fallback_used: boolean;
};

export default function AdminDashboard() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [councils, setCouncils] = useState<CouncilRun[]>([]);
  const [bookingSummary, setBookingSummary] = useState<Record<string, number>>({});
  const [faceRuns, setFaceRuns] = useState<{ id: string; status: string; created_at: string }[]>([]);
  const [providerReady, setProviderReady] = useState(false);
  const [knowledgePending, setKnowledgePending] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminFetch("/api/admin/bookings?limit=200").then((r) => r.json()),
      adminFetch("/api/admin/orders").then((r) => r.json()),
      adminFetch("/api/admin/council-runs?limit=200").then((r) => r.json()),
      adminFetch("/api/admin/face-analysis?limit=30").then((r) => r.json()),
      adminFetch("/api/admin/gemini-provider-approval").then((r) => r.json()),
      Promise.all([
        adminFetch("/api/admin/face-knowledge?status=draft").then((r) => r.json()),
        adminFetch("/api/admin/face-knowledge?status=teacher_review").then((r) => r.json())
      ])
    ])
      .then(([b, o, c, f, p, knowledge]) => {
        setBookings(b?.bookings || []);
        setBookingSummary(b?.summary || {});
        setOrders(o?.orders || []);
        setCouncils(c?.runs || []);
        setFaceRuns(f?.runs || []);
        setProviderReady(p?.approval?.status === "active");
        setKnowledgePending(
          knowledge.reduce((sum, result) => sum + (Array.isArray(result?.items) ? result.items.length : 0), 0)
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const pendingBookings = bookingSummary["pending"] || 0;
  const bookingsThisMonth = bookings.filter((b) => b.created_at >= monthStart).length;
  const ordersThisMonth = orders.filter((o) => o.created_at >= monthStart && o.status === "paid").length;
  const councilThisMonth = councils.filter((c) => c.created_at >= monthStart).length;
  const faceThisMonth = faceRuns.filter((run) => run.created_at >= monthStart).length;
  const failedFaces = faceRuns.filter((run) => run.status === "failed").length;

  const recentBookings = bookings.slice(0, 10);

  if (loading) {
    return <div style={{ color: "var(--muted)" }}>讀取中⋯</div>;
  }

  return (
    <>
      <h1>總覽</h1>
      <p className="lead">本月關鍵指標與最新預約名單。資料即時讀取 Supabase。</p>

      <div className="kpi-grid">
        <Kpi label="待處理預約" value={pendingBookings} hint="status = pending" />
        <Kpi label="本月新增預約" value={bookingsThisMonth} hint="所有狀態" />
        <Kpi label="本月已付訂單" value={ordersThisMonth} hint="status = paid" />
        <Kpi label="本月天機書" value={councilThisMonth} hint="四象問天機" />
        <Kpi label="本月面相任務" value={faceThisMonth} hint={failedFaces ? failedFaces + " 筆需注意" : "運作正常"} />
      </div>

      <div className="admin-section-title"><span>今日待辦</span><span>先處理影響會員使用的項目</span></div>
      <div className="admin-todo-grid">
        <Link className={providerReady ? "done" : "alert"} href="/admin/gemini-provider">
          <strong>照片層 Gemini 認證</strong><span>{providerReady ? "Gemini 影像觀察認證有效；報告層使用 DeepSeek" : "尚未完成，Gemini 會員照片流量維持關閉"}</span>
        </Link>
        <Link className={failedFaces ? "alert" : "done"} href="/admin/face-analysis">
          <strong>面相任務</strong><span>{failedFaces ? failedFaces + " 筆失敗待檢查" : "最近沒有失敗任務"}</span>
        </Link>
        <Link className={pendingBookings ? "alert" : "done"} href="/admin/bookings">
          <strong>預約名單</strong><span>{pendingBookings ? pendingBookings + " 筆待處理" : "目前沒有待處理預約"}</span>
        </Link>
        <Link className={knowledgePending ? "alert" : "done"} href="/admin/face-knowledge">
          <strong>面相知識庫</strong><span>{knowledgePending ? `${knowledgePending} 筆文獻草稿待老師確認` : "目前沒有待確認草稿"}</span>
        </Link>
      </div>

      <div className="admin-section-title">
        <span>最新 10 筆預約名單</span>
        <Link href="/admin/bookings">查看全部 →</Link>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>時間</th>
              <th>姓名</th>
              <th>聯絡</th>
              <th>服務</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {recentBookings.length === 0 && (
              <tr>
                <td colSpan={5} className="admin-empty">尚無預約紀錄</td>
              </tr>
            )}
            {recentBookings.map((b) => (
              <tr key={b.id}>
                <td>{new Date(b.created_at).toLocaleString("zh-TW")}</td>
                <td>
                  <Link href={`/admin/bookings/${b.id}`}>{b.name}</Link>
                </td>
                <td>
                  {b.email && <div>{b.email}</div>}
                  {b.phone && <div className="muted">{b.phone}</div>}
                </td>
                <td>{b.service || "—"}</td>
                <td>
                  <span className={`admin-pill ${b.status}`}>{statusLabel(b.status)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="kpi-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function statusLabel(s: string) {
  return ({
    pending: "待處理",
    contacted: "已聯絡",
    confirmed: "已確認",
    completed: "已完成",
    cancelled: "已取消",
    spam: "垃圾",
    paid: "已付款",
    failed: "失敗",
    refunded: "已退款"
  } as Record<string, string>)[s] || s;
}
