"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../_shell";

type OrderDetail = {
  id: string;
  order_no: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  provider_trade_no: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string | null;
  invoice_request: Record<string, unknown> | null;
  legacy_no_invoice: boolean;
  profiles?: { id?: string; name?: string | null; email?: string | null; phone?: string | null; role?: string | null; created_at?: string | null } | null;
  plans?: { id?: string; code?: string | null; name?: string | null; price?: number; currency?: string | null; credits?: number; duration_days?: number } | null;
  payments?: Array<{ id: string; provider: string; provider_trade_no: string | null; merchant_trade_no: string; amount: number; status: string; check_mac_valid: boolean; received_at: string; created_at: string }>;
  member_entitlements?: Array<{ id: string; status: string; credits_remaining: number; starts_at: string; expires_at: string; created_at: string; plans?: { code?: string; name?: string } | null }>;
  invoices?: Array<{ id: string; provider: string; invoice_number: string | null; random_code: string | null; invoice_date: string | null; buyer_type: string; buyer_name: string; buyer_id: string | null; buyer_email: string | null; carrier_type: string; carrier_num: string | null; donation_code: string | null; total_amount: number; status: string; error_code: string | null; error_msg: string | null; retry_count: number; last_attempted_at: string | null; voided_at: string | null; created_at: string }>;
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    adminFetch(`/api/admin/orders?id=${id}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok || data?.error) {
          setError(data?.error || "讀取失敗");
          return;
        }
        setOrder(data?.order || null);
      })
      .catch((e) => setError(e?.message || "讀取失敗"));
  }, [id]);

  if (error && !order) {
    return (
      <>
        <Link href="/admin/orders" style={{ color: "var(--green)", fontWeight: 700 }}>← 返回列表</Link>
        <h1 style={{ marginTop: 14 }}>讀取失敗</h1>
        <p style={{ color: "#ffb7b7" }}>{error}</p>
      </>
    );
  }

  if (!order) return <div style={{ color: "var(--muted)" }}>讀取中⋯</div>;

  const profile = normalizeOne(order.profiles);
  const plan = normalizeOne(order.plans);

  return (
    <>
      <Link href="/admin/orders" style={{ color: "var(--green)", fontWeight: 700 }}>← 返回列表</Link>
      <h1 style={{ marginTop: 14 }}>訂單詳情</h1>
      <p className="lead">
        <span style={{ fontFamily: "ui-monospace, monospace" }}>{order.order_no}</span>
        {" ｜ "}
        <span className={`admin-pill ${order.status}`}>{statusLabel(order.status)}</span>
      </p>

      <div className="kpi-grid">
        <Kpi label="金額" value={`${order.currency} ${Number(order.amount).toLocaleString()}`} />
        <Kpi label="付款狀態" value={statusLabel(order.status)} />
        <Kpi label="付款時間" value={formatDate(order.paid_at)} />
        <Kpi label="建立時間" value={formatDate(order.created_at)} />
      </div>

      <div className="admin-detail">
        <Section title="訂購會員">
          <Field label="姓名" value={profile?.name || "—"} />
          <Field label="Email" value={profile?.email || "—"} />
          <Field label="電話" value={profile?.phone || "—"} />
          <Field label="角色" value={profile?.role || "—"} />
          <Field label="會員 ID" value={profile?.id || order.id} mono />
        </Section>

        <Section title="訂購方案">
          <Field label="方案名稱" value={plan?.name || "—"} />
          <Field label="方案代碼" value={plan?.code || "—"} />
          <Field label="方案價格" value={typeof plan?.price === "number" ? `${plan.currency || "TWD"} ${plan.price.toLocaleString()}` : "—"} />
          <Field label="點數" value={typeof plan?.credits === "number" ? `${plan.credits} 點` : "—"} />
          <Field label="有效天數" value={typeof plan?.duration_days === "number" ? `${plan.duration_days} 天` : "—"} />
        </Section>
      </div>

      <Section title="付款資訊">
        <Field label="金流 provider" value={order.provider} />
        <Field label="綠界交易編號" value={order.provider_trade_no || "—"} mono />
        {(order.payments || []).length === 0 ? (
          <p className="muted">尚無 payment callback 紀錄。</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>MerchantTradeNo</th>
                  <th>TradeNo</th>
                  <th>金額</th>
                  <th>狀態</th>
                  <th>CheckMac</th>
                  <th>收到時間</th>
                </tr>
              </thead>
              <tbody>
                {(order.payments || []).map((p) => (
                  <tr key={p.id}>
                    <td style={mono}>{p.merchant_trade_no}</td>
                    <td style={mono}>{p.provider_trade_no || "—"}</td>
                    <td>NT$ {p.amount.toLocaleString()}</td>
                    <td>{p.status}</td>
                    <td>{p.check_mac_valid ? "有效" : "無效"}</td>
                    <td>{formatDate(p.received_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="會員權益">
        {(order.member_entitlements || []).length === 0 ? (
          <p className="muted">此訂單尚未產生會員權益。</p>
        ) : (
          (order.member_entitlements || []).map((e) => (
            <div key={e.id} className="field-grid" style={{ marginBottom: 12 }}>
              <Field label="狀態" value={e.status} />
              <Field label="剩餘點數" value={`${e.credits_remaining} 點`} />
              <Field label="開始" value={formatDate(e.starts_at)} />
              <Field label="到期" value={formatDate(e.expires_at)} />
            </div>
          ))
        )}
      </Section>

      <Section title="發票 / 買受人資訊">
        <Field label="歷史不開票" value={order.legacy_no_invoice ? "是" : "否"} />
        <Field label="訂單發票要求" value={order.invoice_request ? JSON.stringify(order.invoice_request, null, 2) : "—"} pre />
        {(order.invoices || []).length === 0 ? (
          <p className="muted">尚無發票紀錄。</p>
        ) : (
          (order.invoices || []).map((i) => (
            <div key={i.id} className="field-grid" style={{ marginBottom: 12 }}>
              <Field label="發票號碼" value={i.invoice_number || "—"} mono />
              <Field label="狀態" value={i.status} />
              <Field label="買受人" value={`${i.buyer_name}${i.buyer_id ? ` / ${i.buyer_id}` : ""}`} />
              <Field label="Email" value={i.buyer_email || "—"} />
              <Field label="金額" value={`NT$ ${i.total_amount.toLocaleString()}`} />
              <Field label="開立時間" value={formatDate(i.invoice_date)} />
              {i.error_msg && <Field label="錯誤" value={`${i.error_code || ""} ${i.error_msg}`} />}
            </div>
          ))
        )}
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="kpi-card" style={{ marginTop: 18, padding: 22 }}>
      <h2 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 14px" }}>{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <article className="kpi-card">
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: 20 }}>{value}</div>
    </article>
  );
}

function Field({ label, value, mono: isMono, pre }: { label: string; value: string; mono?: boolean; pre?: boolean }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      {pre ? (
        <pre style={{ ...preStyle, fontFamily: isMono ? "ui-monospace, monospace" : "ui-monospace, monospace" }}>{value}</pre>
      ) : (
        <div style={{ color: "var(--text)", fontWeight: 700, wordBreak: "break-word", fontFamily: isMono ? "ui-monospace, monospace" : "inherit" }}>{value}</div>
      )}
    </div>
  );
}

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-TW") : "—";
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

const mono: React.CSSProperties = { fontFamily: "ui-monospace, monospace", fontSize: 12 };
const preStyle: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: 12,
  color: "var(--text)",
  fontSize: 12,
  lineHeight: 1.6,
  margin: 0
};
