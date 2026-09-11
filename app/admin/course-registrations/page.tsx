"use client";

// 後台｜課程報名名單
//
// 為什麼要有這一頁：2026-09-11 查證時發現 5 筆報名全部沒有完成付款，
// 而後台沒有任何一頁看得到「有誰報名過」——報名資料只寄生在訂單管理底下，
// 因為沒付款成功，在列表上一律顯示「已取消／失敗」，看起來就像沒人報名。
//
// 所以這一頁的主體是「人」不是「訂單」：**不以付款狀態過濾任何一筆**。
// 填完表沒付款的那些，才是最該打電話的名單。

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "../_shell";
import {
  CONTACT_STATUSES,
  CONTACT_STATUS_HINTS,
  CONTACT_STATUS_LABELS,
  type ContactStatus
} from "@/lib/courses/registration-followup";

type Registration = {
  id: string;
  status: string;
  registration_type: string;
  amount: number;
  name: string;
  gender: string | null;
  phone: string;
  line_id: string | null;
  email: string;
  learning_background: string | null;
  interests: string[] | null;
  motivation: string | null;
  note: string | null;
  paid_at: string | null;
  created_at: string;
  contact_status: ContactStatus | null;
  contact_note: string | null;
  contacted_at: string | null;
  course_products: { code: string; title: string; subtitle: string | null; course_date: string | null; location: string | null } | null;
  orders: { order_no: string; status: string; amount: number; paid_at: string | null } | null;
};

type Summary = {
  total: number;
  paid: number;
  pendingContact: number;
  byContact: Record<string, number>;
};

const FILTERS = [
  { key: "all", label: "全部" },
  ...CONTACT_STATUSES.map((key) => ({ key, label: CONTACT_STATUS_LABELS[key] }))
];

export default function CourseRegistrationsPage() {
  const [rows, setRows] = useState<Registration[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === "all" ? "" : `?contact_status=${filter}`;
      const response = await adminFetch(`/api/admin/course-registrations${q}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "無法載入報名名單");
      setRows(data.registrations || []);
      setSummary(data.summary || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法載入報名名單");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  async function patch(id: string, body: Record<string, unknown>, successText: string) {
    setBusyId(id);
    setMessage("");
    try {
      const response = await adminFetch(`/api/admin/course-registrations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "更新失敗");
      setMessage(successText);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新失敗");
    } finally {
      setBusyId(null);
    }
  }

  /**
   * 熱門名單：填完整份表單（留了 LINE 或寫了報名動機）卻沒完成付款，且還沒被聯繫過。
   * 這是招生上投報率最高的一群——他們已經表達了意願，只是卡在付款那一步。
   */
  const hotLeads = useMemo(
    () =>
      rows.filter(
        (r) =>
          !isPaid(r) &&
          (r.contact_status || "new") === "new" &&
          Boolean(r.motivation?.trim() || r.line_id?.trim())
      ),
    [rows]
  );

  return (
    <>
      <h1>課程報名名單</h1>
      <p className="lead">
        會員或訪客從 <code>/courses</code> 招生頁送出報名表後會進入這裡。
        <strong>不論有沒有完成付款都會列出</strong>——填完表沒付款的人才是最需要聯繫的。
      </p>

      {summary && (
        <div className="kpi-grid" style={{ marginBottom: 18 }}>
          <div className="kpi-card">
            <div className="admin-eyebrow">報名總數</div>
            <div className="value" style={{ fontSize: 24 }}>{summary.total}</div>
          </div>
          <div className="kpi-card">
            <div className="admin-eyebrow">已完成付款</div>
            <div className="value" style={{ fontSize: 24 }}>{summary.paid}</div>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              以訂單實際入帳時間為準
            </p>
          </div>
          <div className="kpi-card">
            <div className="admin-eyebrow">待聯繫</div>
            <div className="value" style={{ fontSize: 24, color: summary.pendingContact ? "#e6a95c" : undefined }}>
              {summary.pendingContact}
            </div>
          </div>
          <div className="kpi-card">
            <div className="admin-eyebrow">高意願未成交</div>
            <div className="value" style={{ fontSize: 24, color: hotLeads.length ? "#ff8d7a" : undefined }}>
              {hotLeads.length}
            </div>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              填了動機或留了 LINE，但沒付款、也還沒被聯繫
            </p>
          </div>
        </div>
      )}

      {hotLeads.length > 0 && (
        <div className="admin-inline-message" style={{ marginBottom: 18, whiteSpace: "pre-wrap" }}>
          <strong>建議優先聯繫：</strong>
          {hotLeads.map((r) => `${r.name}（${formatDate(r.created_at)}）`).join("、")}
          。這些人已經完整填完報名表，只差付款沒完成。
        </div>
      )}

      <div className="admin-filter">
        {FILTERS.map((f) => {
          const count =
            f.key === "all" ? summary?.total ?? 0 : summary?.byContact?.[f.key] ?? 0;
          return (
            <button key={f.key} className={filter === f.key ? "active" : ""} onClick={() => setFilter(f.key)}>
              {f.label}（{count}）
            </button>
          );
        })}
      </div>

      {message && <p className="admin-inline-message">{message}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>報名時間</th>
              <th>報名者</th>
              <th>聯絡方式</th>
              <th>梯次</th>
              <th>付款</th>
              <th>跟進</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="admin-empty">讀取中⋯</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="admin-empty">沒有符合條件的報名</td></tr>
            )}
            {!loading && rows.map((r) => {
              const contact = (r.contact_status || "new") as ContactStatus;
              const paid = isPaid(r);
              const open = expanded === r.id;
              return (
                <tr key={r.id}>
                  <td>{formatDate(r.created_at)}</td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{r.name}</div>
                    <div className="muted">
                      {r.registration_type === "returning" ? "舊生" : "新生"}
                      {r.gender ? `・${r.gender}` : ""}
                    </div>
                  </td>
                  <td>
                    <div>{r.phone}</div>
                    <div className="muted">{r.email}</div>
                    {r.line_id && <div className="muted">LINE：{r.line_id}</div>}
                  </td>
                  <td>
                    <div>{r.course_products?.title || "—"}</div>
                    {r.course_products?.course_date && (
                      <div className="muted">{r.course_products.course_date}</div>
                    )}
                  </td>
                  <td>
                    <span className={`admin-pill ${paid ? "paid" : orderPillClass(r)}`}>
                      {paid ? "已付款" : paymentLabel(r)}
                    </span>
                    <div className="muted" style={{ marginTop: 4 }}>
                      NT$ {r.amount.toLocaleString()}
                    </div>
                  </td>
                  <td>
                    <select
                      value={contact}
                      disabled={busyId === r.id}
                      onChange={(event) =>
                        void patch(
                          r.id,
                          { contact_status: event.target.value },
                          `已將「${r.name}」改為${CONTACT_STATUS_LABELS[event.target.value as ContactStatus]}`
                        )
                      }
                      title={CONTACT_STATUS_HINTS[contact]}
                    >
                      {CONTACT_STATUSES.map((s) => (
                        <option key={s} value={s}>{CONTACT_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    {r.contacted_at && (
                      <div className="muted" style={{ marginTop: 4 }}>{formatDate(r.contacted_at)}</div>
                    )}
                  </td>
                  <td>
                    <button
                      className="admin-action-btn ghost"
                      onClick={() => {
                        setExpanded(open ? null : r.id);
                        if (!open) setNoteDraft((d) => ({ ...d, [r.id]: r.contact_note || "" }));
                      }}
                    >
                      {open ? "收合" : "詳細／備註"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 詳細內容放表格下方而不是塞進欄位：報名動機常常是整段文字，
          擠進表格會把整列撐開，其他列跟著難讀。 */}
      {expanded && (() => {
        const r = rows.find((x) => x.id === expanded);
        if (!r) return null;
        return (
          <div className="admin-card" style={{ marginTop: 18 }}>
            <div className="admin-section-title" style={{ marginTop: 0 }}>
              {r.name}　<span className="muted">{formatDate(r.created_at)} 報名</span>
            </div>

            <dl className="admin-reg-fields">
              <Field label="訂單編號" value={r.orders?.order_no} />
              <Field label="報名身分" value={r.registration_type === "returning" ? "舊生" : "新生"} />
              <Field label="學習背景" value={r.learning_background} />
              <Field label="有興趣的主題" value={r.interests?.length ? r.interests.join("、") : null} />
              <Field label="報名動機" value={r.motivation} />
              <Field label="其他備註" value={r.note} />
            </dl>

            <label style={{ display: "block", marginBottom: 8 }}>
              <span className="admin-eyebrow">聯繫紀錄（只有後台看得到）</span>
              <textarea
                rows={4}
                maxLength={2000}
                style={{ width: "100%", marginTop: 6 }}
                value={noteDraft[r.id] ?? ""}
                onChange={(event) => setNoteDraft((d) => ({ ...d, [r.id]: event.target.value }))}
                placeholder="例如：9/11 電話聯繫，對方表示要改下一期，已加 LINE 追蹤。"
              />
            </label>
            <button
              className="admin-action-btn"
              disabled={busyId === r.id}
              onClick={() => void patch(r.id, { contact_note: noteDraft[r.id] ?? "" }, "聯繫紀錄已儲存")}
            >
              {busyId === r.id ? "儲存中⋯" : "儲存聯繫紀錄"}
            </button>
          </div>
        );
      })()}
    </>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd style={{ whiteSpace: "pre-wrap" }}>{value?.trim() || <span className="muted">未填</span>}</dd>
    </div>
  );
}

/** 付款與否一律以訂單實際入帳為準。報名的 status 要靠 webhook 回寫，慢一步或漏寫都可能。 */
function isPaid(r: Registration) {
  return Boolean(r.paid_at || r.orders?.paid_at);
}

function paymentLabel(r: Registration) {
  const status = r.orders?.status;
  if (status === "cancelled") return "未付款（逾期取消）";
  if (status === "failed") return "付款失敗";
  if (status === "pending") return "等待付款";
  if (status === "refunded" || status === "partially_refunded") return "已退款";
  return "未付款";
}

function orderPillClass(r: Registration) {
  const status = r.orders?.status;
  return status === "failed" ? "failed" : status === "pending" ? "pending" : "cancelled";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", { hour12: false });
}
