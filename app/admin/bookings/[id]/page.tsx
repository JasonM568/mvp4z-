"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../_shell";

type Booking = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  service: string | null;
  location: string | null;
  size: string | null;
  budget: string | null;
  urgency: string | null;
  schedule: string | null;
  message: string | null;
  source: string | null;
  status: string;
  admin_note: string | null;
  assigned_to: string | null;
  follow_up_at: string | null;
  created_at: string;
  updated_at: string;
};

const STATUSES = [
  { key: "pending", label: "待處理" },
  { key: "contacted", label: "已聯絡" },
  { key: "confirmed", label: "已確認" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" },
  { key: "spam", label: "垃圾" }
];

export default function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    adminFetch(`/api/admin/bookings/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) setError(d.error);
        else {
          setBooking(d?.booking);
          setNote(d?.booking?.admin_note || "");
        }
      })
      .catch((e) => setError(e?.message || "讀取失敗"));
  }, [id]);

  async function patch(update: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const res = await adminFetch(`/api/admin/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(update)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "儲存失敗");
      // refetch full record
      const r2 = await adminFetch(`/api/admin/bookings/${id}`);
      const d2 = await r2.json();
      setBooking(d2?.booking);
    } catch (e: any) {
      setError(e?.message || "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  if (error && !booking) {
    return (
      <>
        <Link href="/admin/bookings" style={{ color: "var(--green)" }}>← 返回列表</Link>
        <h1 style={{ marginTop: 14 }}>讀取失敗</h1>
        <p style={{ color: "#ffb7b7" }}>{error}</p>
      </>
    );
  }

  if (!booking) {
    return <div style={{ color: "var(--muted)" }}>讀取中⋯</div>;
  }

  return (
    <>
      <Link href="/admin/bookings" style={{ color: "var(--green)", fontWeight: 700 }}>← 返回列表</Link>
      <h1 style={{ marginTop: 14 }}>{booking.name}</h1>
      <p className="lead">
        {new Date(booking.created_at).toLocaleString("zh-TW")} 送出
        <span className={`admin-pill ${booking.status}`}>{statusLabel(booking.status)}</span>
      </p>

      {error && <div style={{ padding: 12, background: "rgba(255,143,143,0.1)", border: "1px solid rgba(255,143,143,0.3)", color: "#ffb7b7", borderRadius: 12, marginBottom: 12 }}>{error}</div>}

      <div className="admin-detail">
        <div>
          <article className="kpi-card" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 16, margin: "0 0 14px" }}>客戶資料</h2>
            <div className="field-grid">
              <Field label="姓名 / 單位" value={booking.name} />
              <Field label="Email" value={booking.email} />
              <Field label="手機 / LINE" value={booking.phone} />
              <Field label="服務類型" value={booking.service} />
              <Field label="地點 / 區域" value={booking.location} />
              <Field label="坪數 / 規模" value={booking.size} />
              <Field label="預算" value={booking.budget} />
              <Field label="急迫性" value={booking.urgency} />
              <Field label="希望時間" value={booking.schedule} />
              <Field label="來源" value={booking.source} />
            </div>
            {booking.message && (
              <div style={{ marginTop: 14 }}>
                <div className="label" style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>需求說明</div>
                <pre style={{ whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.3)", padding: 14, borderRadius: 12, margin: 0, color: "var(--text)", fontFamily: "inherit", fontSize: 14, lineHeight: 1.8 }}>{booking.message}</pre>
              </div>
            )}
          </article>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <article className="kpi-card" style={{ padding: 18 }}>
            <h3 style={{ fontSize: 14, margin: "0 0 10px" }}>狀態</h3>
            <div style={{ display: "grid", gap: 6 }}>
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => patch({ status: s.key })}
                  disabled={saving || booking.status === s.key}
                  className="btn"
                  style={{
                    width: "100%",
                    background: booking.status === s.key ? "rgba(111,240,180,0.18)" : "rgba(255,255,255,0.04)",
                    border: booking.status === s.key ? "1px solid rgba(111,240,180,0.4)" : "1px solid rgba(255,255,255,0.08)",
                    color: booking.status === s.key ? "var(--green)" : "var(--text)",
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontWeight: 700,
                    fontSize: 13,
                    minHeight: 0
                  }}
                >
                  {s.label}{booking.status === s.key ? " ✓" : ""}
                </button>
              ))}
            </div>
          </article>

          <article className="kpi-card" style={{ padding: 18 }}>
            <h3 style={{ fontSize: 14, margin: "0 0 10px" }}>內部備註</h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="記錄聯絡狀況、後續安排..."
              style={{
                width: "100%",
                minHeight: 110,
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "var(--text)",
                padding: 12,
                borderRadius: 10,
                fontFamily: "inherit",
                fontSize: 13,
                lineHeight: 1.6,
                resize: "vertical"
              }}
            />
            <button
              onClick={() => patch({ admin_note: note })}
              disabled={saving || note === (booking.admin_note || "")}
              className="btn primary"
              style={{ width: "100%", marginTop: 10, minHeight: 0, padding: "10px 14px", fontSize: 13 }}
            >
              {saving ? "儲存中⋯" : "儲存備註"}
            </button>
          </article>
        </aside>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="value">{value || "—"}</div>
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
    spam: "垃圾"
  } as Record<string, string>)[s] || s;
}
