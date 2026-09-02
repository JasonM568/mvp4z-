"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../_shell";

type Stats = {
  signups: number;
  orders_total: number;
  orders_paid: number;
  revenue_paid: number;
  commission_paid: number;
  last_order_at: string | null;
};

type Partner = {
  id: string;
  code: string;
  name: string;
  contact: string;
  commission_rate: number;
  note: string;
  is_active: boolean;
  created_at: string;
  stats?: Stats;
};

type PartnerOrder = {
  id: string;
  order_no: string;
  order_type: string | null;
  display_name: string;
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  commission: number;
  profiles?: { name: string | null; email: string | null; phone: string | null } | null;
};

const SITE_ORIGIN = "https://www.xunfeng.tw";

export default function ReferralsPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<{ partner: Partner; stats: Stats; orders: PartnerOrder[] } | null>(null);
  const [form, setForm] = useState({ code: "", name: "", contact: "", commission_rate: "0.2", note: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminFetch("/api/admin/referrals");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "讀取失敗");
      setPartners(data.partners || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "讀取失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createPartner() {
    setBusy(true);
    setNotice("");
    try {
      const response = await adminFetch("/api/admin/referrals", {
        method: "POST",
        body: JSON.stringify({ ...form, commission_rate: Number(form.commission_rate) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "建立失敗");
      setForm({ code: "", name: "", contact: "", commission_rate: "0.2", note: "" });
      setNotice(`已建立推廣夥伴 ${data.partner.name}，專屬連結已可使用。`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "建立失敗");
    } finally {
      setBusy(false);
    }
  }

  async function patchPartner(id: string, patch: Record<string, unknown>, message: string) {
    setBusy(true);
    setNotice("");
    try {
      const response = await adminFetch("/api/admin/referrals", {
        method: "PATCH",
        body: JSON.stringify({ id, ...patch })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "更新失敗");
      setNotice(message);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  }

  async function openOrders(partner: Partner) {
    setBusy(true);
    setNotice("");
    try {
      const response = await adminFetch(`/api/admin/referrals?partner=${partner.id}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "讀取訂單失敗");
      setSelected({ partner: data.partner, stats: data.stats, orders: data.orders || [] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "讀取訂單失敗");
    } finally {
      setBusy(false);
    }
  }

  function copyLink(code: string) {
    const link = `${SITE_ORIGIN}/?ref=${code}`;
    navigator.clipboard?.writeText(link).then(
      () => setNotice(`已複製專屬連結：${link}`),
      () => setNotice(`請手動複製：${link}`)
    );
  }

  return (
    <>
      <h1>業務推廣與分潤</h1>
      <p className="lead">
        每位業務有一組專屬代碼。對外連結加上 <code>?ref=代碼</code>（例如 <code>{SITE_ORIGIN}/?ref=ALEX</code>），
        訪客從該連結進站後 90 天內成立的訂單都會自動歸戶，成交後即可在這裡看到訂單明細與應付分潤。
      </p>

      {notice && <p className="admin-inline-message" role="status">{notice}</p>}

      <section className="admin-card">
        <h2>新增推廣夥伴</h2>
        <div className="admin-form-grid">
          <label>推廣代碼<input value={form.code} placeholder="ALEX" onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
          <label>業務姓名<input value={form.name} placeholder="王小明" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>聯絡方式<input value={form.contact} placeholder="0912-345-678 / LINE ID" onChange={(e) => setForm({ ...form, contact: e.target.value })} /></label>
          <label>分潤比例<input value={form.commission_rate} placeholder="0.2" onChange={(e) => setForm({ ...form, commission_rate: e.target.value })} /><small>0.2 = 20%</small></label>
          <label className="admin-form-wide">備註<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        </div>
        <button className="admin-action-btn" disabled={busy || !form.code || !form.name} onClick={createPartner}>建立並產生專屬連結</button>
      </section>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>業務 / 代碼</th>
              <th>專屬連結</th>
              <th>分潤</th>
              <th>帶進註冊</th>
              <th>訂單</th>
              <th>成交金額</th>
              <th>應付分潤</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="admin-empty">讀取中⋯</td></tr>}
            {!loading && partners.length === 0 && (
              <tr><td colSpan={9} className="admin-empty">還沒有推廣夥伴，先在上方建立一位。</td></tr>
            )}
            {!loading && partners.map((partner) => (
              <tr key={partner.id}>
                <td>
                  <strong>{partner.name}</strong>
                  <div className="muted">{partner.code}</div>
                  {partner.contact && <div className="muted">{partner.contact}</div>}
                </td>
                <td>
                  <code>{`/?ref=${partner.code}`}</code>
                  <div><button className="admin-action-btn ghost small" onClick={() => copyLink(partner.code)}>複製完整連結</button></div>
                </td>
                <td>{formatRate(partner.commission_rate)}</td>
                <td>{partner.stats?.signups ?? 0}</td>
                <td>
                  {partner.stats?.orders_paid ?? 0} 筆成交
                  <div className="muted">共 {partner.stats?.orders_total ?? 0} 筆</div>
                </td>
                <td>NT${(partner.stats?.revenue_paid ?? 0).toLocaleString("zh-TW")}</td>
                <td>NT${(partner.stats?.commission_paid ?? 0).toLocaleString("zh-TW")}</td>
                <td><span className={`admin-pill ${partner.is_active ? "confirmed" : "cancelled"}`}>{partner.is_active ? "啟用中" : "已停用"}</span></td>
                <td>
                  <button className="admin-action-btn ghost small" disabled={busy} onClick={() => openOrders(partner)}>訂單明細</button>
                  <button
                    className="admin-action-btn ghost small"
                    disabled={busy}
                    onClick={() => patchPartner(partner.id, { is_active: !partner.is_active }, partner.is_active ? "已停用，新的點擊不再歸戶。" : "已重新啟用。")}
                  >
                    {partner.is_active ? "停用" : "啟用"}
                  </button>
                  <button
                    className="admin-action-btn ghost small"
                    disabled={busy}
                    onClick={() => {
                      const next = window.prompt(`調整 ${partner.name} 的分潤比例（0.2 = 20%）`, String(partner.commission_rate));
                      if (next === null) return;
                      void patchPartner(partner.id, { commission_rate: Number(next) }, "分潤比例已更新（只影響之後成立的訂單）。");
                    }}
                  >
                    改分潤
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <section className="admin-card">
          <h2>{selected.partner.name}（{selected.partner.code}）的訂單明細</h2>
          <p className="lead">
            成交 {selected.stats.orders_paid} 筆 ／ 成交金額 NT${selected.stats.revenue_paid.toLocaleString("zh-TW")} ／
            應付分潤 NT${selected.stats.commission_paid.toLocaleString("zh-TW")}
            <button className="admin-action-btn ghost small" onClick={() => setSelected(null)}>關閉</button>
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>成立時間</th><th>訂單編號</th><th>品項</th><th>會員</th>
                  <th>金額</th><th>狀態</th><th>付款時間</th><th>分潤</th>
                </tr>
              </thead>
              <tbody>
                {selected.orders.length === 0 && (
                  <tr><td colSpan={8} className="admin-empty">這位夥伴的連結還沒有帶進任何訂單。</td></tr>
                )}
                {selected.orders.map((order) => (
                  <tr key={order.id}>
                    <td>{new Date(order.created_at).toLocaleString("zh-TW")}</td>
                    <td><code>{order.order_no}</code></td>
                    <td>{order.display_name}</td>
                    <td>
                      {order.profiles?.name || "—"}
                      {order.profiles?.email && <div className="muted">{order.profiles.email}</div>}
                    </td>
                    <td>NT${Number(order.amount).toLocaleString("zh-TW")}</td>
                    <td><span className={`admin-pill ${order.status}`}>{orderStatusLabel(order.status)}</span></td>
                    <td>{order.paid_at ? new Date(order.paid_at).toLocaleString("zh-TW") : "—"}</td>
                    <td>{order.status === "paid" ? `NT$${order.commission.toLocaleString("zh-TW")}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function formatRate(rate: number) {
  return `${(Number(rate || 0) * 100).toFixed(Number(rate || 0) * 100 % 1 === 0 ? 0 : 2)}%`;
}

function orderStatusLabel(status: string) {
  return ({ paid: "已付款", pending: "待付款", failed: "付款失敗", cancelled: "已取消" } as Record<string, string>)[status] || status;
}
