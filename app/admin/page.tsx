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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminFetch("/api/admin/bookings?limit=200").then((r) => r.json()),
      adminFetch("/api/admin/orders").then((r) => r.json()),
      adminFetch("/api/admin/council-runs?limit=200").then((r) => r.json())
    ])
      .then(([b, o, c]) => {
        setBookings(b?.bookings || []);
        setBookingSummary(b?.summary || {});
        setOrders(o?.orders || []);
        setCouncils(c?.runs || []);
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
        <Kpi label="本月易學報告" value={councilThisMonth} hint="council_runs" />
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
