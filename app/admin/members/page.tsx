"use client";

import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../_shell";

type Member = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  role: string;
  plan: string;
  status: string;
  credits_remaining: number;
  expires_at: string | null;
  created_at: string;
};

const STATUS_FILTERS = [
  { key: "all", label: "全部" },
  { key: "active", label: "啟用中" },
  { key: "pending", label: "未啟用" },
  { key: "expired", label: "已到期" },
  { key: "admin", label: "管理員" }
];

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [creditTarget, setCreditTarget] = useState<Member | null>(null);
  const [creditAmount, setCreditAmount] = useState(10);
  const [creditPlan, setCreditPlan] = useState("pro");
  const [creditDays, setCreditDays] = useState(30);
  const [creditNote, setCreditNote] = useState("");
  const [creditMessage, setCreditMessage] = useState("");
  const [creditSaving, setCreditSaving] = useState(false);
  const [codeForm, setCodeForm] = useState({ plan: "basic", days: 30, credits: 60, note: "" });
  const [codeMessage, setCodeMessage] = useState("");
  const [codeSaving, setCodeSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    const res = await adminFetch("/api/admin/members");
    const data = await res.json();
    setMembers(data?.members || []);
    setLoading(false);
  };

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    return {
      all: members.length,
      active: members.filter((m) => m.status === "active").length,
      pending: members.filter((m) => m.status === "pending").length,
      expired: members.filter((m) => m.status === "expired").length,
      admin: members.filter((m) => m.role === "admin").length
    };
  }, [members]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (filter === "admin" && m.role !== "admin") return false;
      if (filter !== "all" && filter !== "admin" && m.status !== filter) return false;
      if (!q) return true;
      return [m.name, m.email, m.phone, m.plan, m.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [members, filter, query]);

  async function createCode() {
    setCodeSaving(true);
    setCodeMessage("");
    try {
      const res = await adminFetch("/api/admin/create-code", {
        method: "POST",
        body: JSON.stringify(codeForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "產生失敗");
      setCodeMessage(`啟用碼：${data.code}`);
    } catch (e) {
      setCodeMessage(e instanceof Error ? e.message : "產生失敗");
    } finally {
      setCodeSaving(false);
    }
  }

  async function adjustCredits() {
    if (!creditTarget) return;
    setCreditSaving(true);
    setCreditMessage("");
    try {
      const res = await adminFetch("/api/admin/credits", {
        method: "POST",
        body: JSON.stringify({
          user_id: creditTarget.id,
          amount: creditAmount,
          plan: creditPlan,
          days: creditDays,
          note: creditNote
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "調整失敗");
      setCreditMessage(`${creditTarget.email} 目前剩餘 ${data.credits_remaining} 點`);
      setCreditTarget(null);
      setCreditAmount(10);
      setCreditPlan("pro");
      setCreditDays(30);
      setCreditNote("");
      await reload();
    } catch (e) {
      setCreditMessage(e instanceof Error ? e.message : "調整失敗");
    } finally {
      setCreditSaving(false);
    }
  }

  return (
    <>
      <h1>會員管理</h1>
      <p className="lead">查看會員狀態、產生啟用碼，並對有效會員權益補點或扣點。</p>

      <div className="kpi-grid">
        <Kpi label="會員總數" value={String(counts.all)} />
        <Kpi label="啟用中" value={String(counts.active)} />
        <Kpi label="未啟用" value={String(counts.pending)} />
        <Kpi label="管理員" value={String(counts.admin)} />
      </div>

      <section className="kpi-card" style={{ marginBottom: 18, padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 14px" }}>產生會員啟用碼</h2>
        <div className="admin-form-grid">
          <label>
            方案
            <select value={codeForm.plan} onChange={(e) => setCodeForm({ ...codeForm, plan: e.target.value })}>
              <option value="basic">basic 基礎會員</option>
              <option value="pro">pro 進階會員</option>
              <option value="vip">vip 顧問會員</option>
            </select>
          </label>
          <label>
            有效天數
            <input type="number" value={codeForm.days} onChange={(e) => setCodeForm({ ...codeForm, days: Number(e.target.value || 30) })} />
          </label>
          <label>
            點數
            <input type="number" value={codeForm.credits} onChange={(e) => setCodeForm({ ...codeForm, credits: Number(e.target.value || 0) })} />
          </label>
          <label>
            備註
            <input value={codeForm.note} onChange={(e) => setCodeForm({ ...codeForm, note: e.target.value })} placeholder="例如：現金收款、客服補發" />
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <button className="admin-action-btn" type="button" onClick={createCode} disabled={codeSaving}>
            {codeSaving ? "產生中⋯" : "產生啟用碼"}
          </button>
          {codeMessage && <div className="admin-inline-message">{codeMessage}</div>}
        </div>
      </section>

      <div className="admin-filter" style={{ alignItems: "center" }}>
        {STATUS_FILTERS.map((s) => (
          <button key={s.key} className={filter === s.key ? "active" : ""} onClick={() => setFilter(s.key)}>
            {s.label}（{counts[s.key as keyof typeof counts] || 0}）
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋姓名、Email、電話、方案"
          style={{ minWidth: 240, marginLeft: "auto" }}
        />
      </div>

      {creditMessage && <div className="admin-inline-message" style={{ marginBottom: 12 }}>{creditMessage}</div>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>會員</th>
              <th>電話</th>
              <th>角色</th>
              <th>方案 / 狀態</th>
              <th>點數</th>
              <th>到期</th>
              <th>建立時間</th>
              <th>動作</th>
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
                <td colSpan={8} className="admin-empty">沒有符合條件的會員</td>
              </tr>
            )}
            {!loading && filtered.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.name && <div>{m.name}</div>}
                  <div className="muted">{m.email}</div>
                </td>
                <td>{m.phone || "—"}</td>
                <td><span className={`admin-pill ${m.role === "admin" ? "confirmed" : "pending"}`}>{m.role}</span></td>
                <td>
                  <div>{m.plan}</div>
                  <span className={`admin-pill ${m.status}`}>{statusLabel(m.status)}</span>
                </td>
                <td style={{ fontWeight: 800 }}>{m.credits_remaining.toLocaleString()}</td>
                <td>{m.expires_at ? new Date(m.expires_at).toLocaleString("zh-TW") : "—"}</td>
                <td>{new Date(m.created_at).toLocaleString("zh-TW")}</td>
                <td>
                  <button className="admin-action-btn small" type="button" onClick={() => setCreditTarget(m)}>
                    {m.status === "active" ? "調整點數" : "開通/補點"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creditTarget && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal">
            <h2>調整點數</h2>
            <p className="muted" style={{ marginTop: 0 }}>{creditTarget.name || creditTarget.email} ｜ 目前 {creditTarget.credits_remaining} 點</p>
            <label>
              調整數量（正數補點，負數扣點）
              <input type="number" value={creditAmount} onChange={(e) => setCreditAmount(Number(e.target.value || 0))} />
            </label>
            {creditTarget.status !== "active" && (
              <>
                <div className="admin-inline-message" style={{ color: "var(--muted)" }}>
                  此帳號目前沒有有效會員權益。補點時會先建立一筆會員權益；若要扣點，必須先有有效權益。
                </div>
                <label>
                  建立權益方案
                  <select value={creditPlan} onChange={(e) => setCreditPlan(e.target.value)}>
                    <option value="basic">basic 基礎會員</option>
                    <option value="pro">pro 進階會員</option>
                    <option value="vip">vip 顧問會員</option>
                  </select>
                </label>
                <label>
                  有效天數
                  <input type="number" value={creditDays} onChange={(e) => setCreditDays(Number(e.target.value || 30))} />
                </label>
              </>
            )}
            <label>
              備註
              <input value={creditNote} onChange={(e) => setCreditNote(e.target.value)} placeholder="調整原因" />
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="admin-action-btn ghost" type="button" onClick={() => setCreditTarget(null)} disabled={creditSaving}>取消</button>
              <button className="admin-action-btn" type="button" onClick={adjustCredits} disabled={creditSaving || creditAmount === 0}>
                {creditSaving ? "儲存中⋯" : "儲存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <article className="kpi-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </article>
  );
}

function statusLabel(value: string) {
  return ({
    active: "啟用中",
    pending: "未啟用",
    expired: "已到期",
    cancelled: "已取消"
  } as Record<string, string>)[value] || value;
}
