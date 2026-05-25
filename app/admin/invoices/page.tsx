"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "../_shell";

type Invoice = {
  id: string;
  order_id: string;
  user_id: string;
  provider: string;
  invoice_number: string | null;
  random_code: string | null;
  invoice_date: string | null;
  buyer_type: "personal" | "company";
  buyer_name: string;
  buyer_id: string | null;
  buyer_email: string | null;
  total_amount: number;
  status: "pending" | "issued" | "failed" | "voided";
  error_code: string | null;
  error_msg: string | null;
  retry_count: number;
  last_attempted_at: string | null;
  voided_at: string | null;
  created_at: string;
  orders?: { order_no?: string | null; status?: string | null } | null;
  profiles?: { name?: string | null; email?: string | null } | null;
};

type IssuableOrder = {
  id: string;
  order_no: string;
  amount: number;
  status: string;
  invoice_request: Record<string, unknown> | null;
  legacy_no_invoice: boolean;
  profiles?: { name?: string | null; email?: string | null } | null;
};

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "issued", label: "已開立" },
  { key: "failed", label: "失敗" },
  { key: "pending", label: "處理中" },
  { key: "voided", label: "已作廢" }
];

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pendingOrders, setPendingOrders] = useState<IssuableOrder[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [issuingOrderId, setIssuingOrderId] = useState<string | null>(null);
  const [issueMessage, setIssueMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [invRes, orderRes] = await Promise.all([
      adminFetch("/api/admin/invoices").then((r) => r.json()),
      adminFetch("/api/admin/orders").then((r) => r.json())
    ]);
    const inv: Invoice[] = invRes?.invoices || [];
    setInvoices(inv);

    // 把 paid 且還沒有 active invoice、也非 legacy 的訂單列為「可補開」
    const issuedOrderIds = new Set(
      inv.filter((i) => i.status === "issued" || i.status === "pending").map((i) => i.order_id)
    );
    const candidates = (orderRes?.orders || [])
      .filter((o: IssuableOrder) => o.status === "paid" && !issuedOrderIds.has(o.id) && !o.legacy_no_invoice);
    setPendingOrders(candidates);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(
    () => (filter === "all" ? invoices : invoices.filter((i) => i.status === filter)),
    [invoices, filter]
  );

  const counts = useMemo(() => {
    const acc: Record<string, number> = { all: invoices.length };
    invoices.forEach((i) => (acc[i.status] = (acc[i.status] || 0) + 1));
    return acc;
  }, [invoices]);

  async function issueFor(order: IssuableOrder) {
    const buyer = order.invoice_request as Record<string, unknown> | null;
    if (!buyer || !buyer.buyer_type || !buyer.buyer_name) {
      setIssueMessage(`訂單 ${order.order_no} 沒有買受人資訊，請先用 SQL / 補開 API 帶 buyer payload`);
      return;
    }
    if (!confirm(`對訂單 ${order.order_no} (NT$ ${order.amount}) 開立發票？`)) return;

    setIssuingOrderId(order.id);
    setIssueMessage(null);
    try {
      const res = await adminFetch(`/api/admin/invoices/${order.id}/issue`, { method: "POST", body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setIssueMessage(
        data?.invoice?.status === "issued"
          ? `✅ 已開立發票 ${data.invoice.invoice_number}`
          : `⚠️ 開票失敗：${data?.invoice?.error_msg || "未知錯誤"}`
      );
      await reload();
    } catch (e) {
      setIssueMessage(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIssuingOrderId(null);
    }
  }

  return (
    <>
      <h1>發票管理</h1>
      <p className="lead">
        綠界電子發票（B2C）。目前自動開票尚未啟動，請對 paid 訂單手動開立。
      </p>

      {issueMessage && (
        <div
          style={{
            margin: "12px 0",
            padding: "10px 14px",
            background: "rgba(111,240,180,0.08)",
            border: "1px solid rgba(111,240,180,0.4)",
            borderRadius: 6,
            color: "var(--text)"
          }}
        >
          {issueMessage}
        </div>
      )}

      {pendingOrders.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 18 }}>待補開（{pendingOrders.length}）</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>訂單編號</th>
                  <th>會員</th>
                  <th>金額</th>
                  <th>買受人資訊</th>
                  <th>動作</th>
                </tr>
              </thead>
              <tbody>
                {pendingOrders.map((o) => {
                  const buyer = o.invoice_request as Record<string, unknown> | null;
                  return (
                    <tr key={o.id}>
                      <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{o.order_no}</td>
                      <td>
                        {o.profiles?.name && <div>{o.profiles.name}</div>}
                        {o.profiles?.email && <div className="muted">{o.profiles.email}</div>}
                      </td>
                      <td style={{ fontWeight: 700 }}>NT$ {o.amount.toLocaleString()}</td>
                      <td className="muted">
                        {buyer?.buyer_name ? `${buyer.buyer_type} / ${buyer.buyer_name}` : "（無 invoice_request）"}
                      </td>
                      <td>
                        <button
                          className="admin-btn"
                          onClick={() => issueFor(o)}
                          disabled={issuingOrderId === o.id || !buyer?.buyer_name}
                        >
                          {issuingOrderId === o.id ? "開立中⋯" : "開立發票"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>發票清單</h2>
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
                <th>發票號碼</th>
                <th>訂單編號</th>
                <th>會員 / 買受人</th>
                <th>金額</th>
                <th>狀態</th>
                <th>開立時間</th>
                <th>建立時間</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="admin-empty">讀取中⋯</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="admin-empty">沒有符合條件的發票</td>
                </tr>
              )}
              {!loading && filtered.map((i) => (
                <tr key={i.id}>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                    {i.invoice_number || "—"}
                    {i.random_code && <div className="muted">隨機碼 {i.random_code}</div>}
                  </td>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{i.orders?.order_no || i.order_id.slice(0, 8)}</td>
                  <td>
                    {i.profiles?.name && <div>{i.profiles.name}</div>}
                    {i.profiles?.email && <div className="muted">{i.profiles.email}</div>}
                    <div className="muted">買：{i.buyer_name}{i.buyer_id ? ` (${i.buyer_id})` : ""}</div>
                  </td>
                  <td style={{ fontWeight: 700 }}>NT$ {i.total_amount.toLocaleString()}</td>
                  <td>
                    <span className={`admin-pill ${i.status}`}>{statusLabel(i.status)}</span>
                    {i.status === "failed" && i.error_msg && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                        {i.error_code} {i.error_msg}
                      </div>
                    )}
                  </td>
                  <td>{i.invoice_date ? new Date(i.invoice_date).toLocaleString("zh-TW") : "—"}</td>
                  <td>{new Date(i.created_at).toLocaleString("zh-TW")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function statusLabel(s: string) {
  return ({
    pending: "處理中",
    issued: "已開立",
    failed: "失敗",
    voided: "已作廢"
  } as Record<string, string>)[s] || s;
}
