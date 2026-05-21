"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../_shell";

type Booking = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  service: string | null;
  location: string | null;
  urgency: string | null;
  status: string;
  admin_note: string | null;
  follow_up_at: string | null;
  created_at: string;
};

const STATUS_FILTER = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待處理" },
  { key: "contacted", label: "已聯絡" },
  { key: "confirmed", label: "已確認" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" },
  { key: "spam", label: "垃圾" }
];

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = filter === "all" ? "" : `?status=${filter}`;
    adminFetch(`/api/admin/bookings${q}`)
      .then((r) => r.json())
      .then((d) => {
        setBookings(d?.bookings || []);
        setSummary(d?.summary || {});
      })
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <>
      <h1>預約名單 / 申請預約</h1>
      <p className="lead">客戶從首頁「預約表單」送出後會自動進入這裡。可改狀態、加備註、指派處理人。</p>

      <div className="admin-filter">
        {STATUS_FILTER.map((s) => {
          const count = s.key === "all" ? Object.values(summary).reduce((a, b) => a + b, 0) : summary[s.key] || 0;
          return (
            <button key={s.key} className={filter === s.key ? "active" : ""} onClick={() => setFilter(s.key)}>
              {s.label}（{count}）
            </button>
          );
        })}
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>時間</th>
              <th>姓名</th>
              <th>聯絡</th>
              <th>服務 / 地點</th>
              <th>急迫性</th>
              <th>狀態</th>
              <th>備註</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="admin-empty">讀取中⋯</td>
              </tr>
            )}
            {!loading && bookings.length === 0 && (
              <tr>
                <td colSpan={7} className="admin-empty">沒有符合條件的預約</td>
              </tr>
            )}
            {!loading && bookings.map((b) => (
              <tr key={b.id}>
                <td>{new Date(b.created_at).toLocaleString("zh-TW")}</td>
                <td>
                  <Link href={`/admin/bookings/${b.id}`} style={{ color: "var(--green)", fontWeight: 700 }}>{b.name}</Link>
                </td>
                <td>
                  {b.email && <div>{b.email}</div>}
                  {b.phone && <div className="muted">{b.phone}</div>}
                </td>
                <td>
                  {b.service || "—"}
                  {b.location && <div className="muted">{b.location}</div>}
                </td>
                <td>{b.urgency || "—"}</td>
                <td>
                  <span className={`admin-pill ${b.status}`}>{statusLabel(b.status)}</span>
                </td>
                <td style={{ maxWidth: 280, whiteSpace: "pre-wrap" }}>{b.admin_note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function statusLabel(s: string) {
  return ({
    pending: "待處理",
    contacted: "已聯絡",
    confirmed: "已確認",
    completed: "已完成",
    cancelled: "已取消",
    spam: "垃圾"
  } as Record<string, string>)[s] || s;
}
