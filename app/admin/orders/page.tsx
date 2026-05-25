"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../_shell";

type Order = {
  id: string;
  order_no: string;
  order_type?: string;
  item_name?: string | null;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  provider_trade_no: string | null;
  paid_at: string | null;
  created_at: string;
  profiles?: { name?: string | null; email?: string | null; phone?: string | null } | null;
  plans?: { code?: string | null; name?: string | null } | null;
  course_products?: { code?: string | null; title?: string | null; subtitle?: string | null } | null;
  course_registrations?: Array<{ name?: string | null; phone?: string | null; email?: string | null; registration_type?: string | null }> | null;
};

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "paid", label: "已付款" },
  { key: "pending", label: "待付款" },
  { key: "failed", label: "失敗" },
  { key: "cancelled", label: "已取消" },
  { key: "refunded", label: "已退款" }
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/api/admin/orders")
      .then((r) => r.json())
      .then((d) => setOrders(d?.orders || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => (filter === "all" ? orders : orders.filter((o) => o.status === filter)), [orders, filter]);

  const counts = useMemo(() => {
    const acc: Record<string, number> = { all: orders.length };
    orders.forEach((o) => (acc[o.status] = (acc[o.status] || 0) + 1));
    return acc;
  }, [orders]);

  return (
    <>
      <h1>訂單管理</h1>
      <p className="lead">會員方案與課程報名訂單（綠界金流）。點訂單編號可查看會員、課程與付款細項。</p>

      <div className="admin-filter">
        {FILTERS.map((s) => (
          <button key={s.key} className={filter === s.key ? "active" : ""} onClick={() => setFilter(s.key)}>
            {s.label}（{counts[s.key] || 0}）
          </button>
        ))}
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>訂單編號</th>
              <th>類型</th>
              <th>會員</th>
              <th>項目</th>
              <th>金額</th>
              <th>狀態</th>
              <th>付款時間</th>
              <th>建立時間</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="admin-empty">讀取中⋯</td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="admin-empty">沒有符合條件的訂單</td>
              </tr>
            )}
            {!loading && filtered.map((o) => (
              <tr key={o.id}>
                <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                  <Link href={`/admin/orders/${o.id}`} style={{ color: "var(--green)", fontWeight: 800 }}>
                    {o.order_no}
                  </Link>
                </td>
                <td>{orderTypeLabel(o.order_type)}</td>
                <td>
                  <div>{courseRegistration(o)?.name || o.profiles?.name || "—"}</div>
                  {(courseRegistration(o)?.email || o.profiles?.email) && <div className="muted">{courseRegistration(o)?.email || o.profiles?.email}</div>}
                  {(courseRegistration(o)?.phone || o.profiles?.phone) && <div className="muted">{courseRegistration(o)?.phone || o.profiles?.phone}</div>}
                </td>
                <td>
                  {itemName(o)}
                  {itemSubline(o) && <div className="muted">{itemSubline(o)}</div>}
                </td>
                <td style={{ fontWeight: 700 }}>NT$ {o.amount.toLocaleString()}</td>
                <td>
                  <span className={`admin-pill ${o.status}`}>{statusLabel(o.status)}</span>
                </td>
                <td>{o.paid_at ? new Date(o.paid_at).toLocaleString("zh-TW") : "—"}</td>
                <td>{new Date(o.created_at).toLocaleString("zh-TW")}</td>
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
    paid: "已付款",
    pending: "待付款",
    failed: "失敗",
    cancelled: "已取消",
    refunded: "已退款"
  } as Record<string, string>)[s] || s;
}

function orderTypeLabel(type?: string) {
  return type === "course" ? "課程報名" : "會員方案";
}

function courseRegistration(order: Order) {
  return Array.isArray(order.course_registrations) ? order.course_registrations[0] : null;
}

function itemName(order: Order) {
  if (order.order_type === "course") {
    const course = order.course_products;
    return order.item_name || [course?.title, course?.subtitle].filter(Boolean).join(" ") || "課程報名";
  }
  return order.plans?.name || "—";
}

function itemSubline(order: Order) {
  if (order.order_type === "course") {
    const regType = courseRegistration(order)?.registration_type;
    return regType === "returning" ? "複訓學員" : regType === "new" ? "新生報名" : order.course_products?.code || "";
  }
  return order.plans?.code || "";
}
