"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../_shell";

type OrderDetail = {
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
  updated_at: string | null;
  invoice_request: Record<string, unknown> | null;
  legacy_no_invoice: boolean;
  profiles?: { id?: string; name?: string | null; email?: string | null; phone?: string | null; role?: string | null; created_at?: string | null } | null;
  plans?: { id?: string; code?: string | null; name?: string | null; price?: number; currency?: string | null; credits?: number; duration_days?: number } | null;
  course_products?: { id?: string; code?: string | null; title?: string | null; subtitle?: string | null; course_date?: string | null; starts_at?: string | null; ends_at?: string | null; location?: string | null; price_new?: number; price_returning?: number; currency?: string | null } | null;
  course_registrations?: Array<{ id: string; status: string; registration_type: string; amount: number; currency: string; name: string; gender: string | null; phone: string; line_id: string | null; email: string; learning_background: string | null; interests: string[] | null; motivation: string | null; note: string | null; paid_at: string | null; created_at: string; course_products?: { code?: string; title?: string; subtitle?: string; course_date?: string; starts_at?: string; ends_at?: string; location?: string } | null }>;
  payments?: Array<{ id: string; provider: string; provider_trade_no: string | null; merchant_trade_no: string; amount: number; status: string; check_mac_valid: boolean; received_at: string; created_at: string }>;
  member_entitlements?: Array<{ id: string; status: string; credits_remaining: number; starts_at: string; expires_at: string; created_at: string; plans?: { code?: string; name?: string } | null }>;
  invoices?: Array<{ id: string; provider: string; invoice_number: string | null; random_code: string | null; invoice_date: string | null; buyer_type: string; buyer_name: string; buyer_id: string | null; buyer_email: string | null; carrier_type: string; carrier_num: string | null; donation_code: string | null; total_amount: number; status: string; error_code: string | null; error_msg: string | null; retry_count: number; last_attempted_at: string | null; voided_at: string | null; created_at: string }>;
};

type RefundPreview = {
  order_no: string;
  order_status: string;
  order_amount: number;
  already_refunded: number;
  refundable_amount: number;
  credits_granted: number;
  credits_available: number;
  active_expires_at: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
};

type RefundRecord = {
  id: string;
  kind: string;
  amount: number;
  credits_expected: number;
  credits_reclaimed: number;
  credits_shortfall: number;
  reason: string;
  provider_reference: string | null;
  admin_email: string;
  created_at: string;
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundNotice, setRefundNotice] = useState("");
  const [refundResultUncertain, setRefundResultUncertain] = useState(false);
  const [refundConflict, setRefundConflict] = useState(false);
  const [refundConflictVerified, setRefundConflictVerified] = useState(false);
  const [refundConflictReviewed, setRefundConflictReviewed] = useState(false);
  const [refundSyncPending, setRefundSyncPending] = useState(false);
  const [refundSyncBusy, setRefundSyncBusy] = useState(false);
  const [refundSyncError, setRefundSyncError] = useState("");
  const [refundStorageBlocked, setRefundStorageBlocked] = useState(false);
  const refundIdempotencyKey = useRef<string | null>(null);
  const [form, setForm] = useState({ amount: "", reason: "", reference: "", confirmed: false });

  const loadOrder = useCallback(async () => {
    if (!id) return false;
    try {
      const response = await adminFetch(`/api/admin/orders?id=${id}`);
      const { ok, data } = await response.json().then((data) => ({ ok: response.ok, data }));
      if (!ok || data?.error || !data?.order) {
        setError(data?.error || "讀取訂單失敗");
        return false;
      }
      setError("");
      setOrder(data.order);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "讀取訂單失敗");
      return false;
    }
  }, [id]);

  const loadRefund = useCallback(async () => {
    if (!id) return false;
    try {
      const response = await adminFetch(`/api/admin/orders/${id}/refund`);
      const { ok, data } = await response.json().then((data) => ({ ok: response.ok, data }));
      if (!ok || data?.error || !data?.preview) return false;
      setPreview(data.preview);
      setRefunds(Array.isArray(data?.refunds) ? data.refunds : []);
      return true;
    } catch {
      return false;
    }
  }, [id]);

  useEffect(() => { loadRefund(); }, [loadRefund]);

  useEffect(() => {
    if (!id) return;
    try {
      const saved = sessionStorage.getItem(`refund-retry:${id}`);
      if (!saved) return;
      const pending = JSON.parse(saved) as {
        idempotencyKey?: string;
        amount?: string;
        reason?: string;
        reference?: string;
        confirmed?: boolean;
        state?: "uncertain" | "conflict" | "committed-refresh";
      };
      if (!pending.idempotencyKey) {
        setRefundStorageBlocked(true);
        return;
      }
      refundIdempotencyKey.current = pending.idempotencyKey;
      setForm({
        amount: pending.amount || "",
        reason: pending.reason || "",
        reference: pending.reference || "",
        confirmed: pending.confirmed === true
      });
      setRefundConflict(pending.state === "conflict");
      setRefundResultUncertain(pending.state === "uncertain");
      setRefundSyncPending(pending.state === "committed-refresh");
      setRefundOpen(pending.state !== "committed-refresh");
    } catch {
      setRefundStorageBlocked(true);
    }
  }, [id]);

  function clearRefundRetry() {
    refundIdempotencyKey.current = null;
    try { sessionStorage.removeItem(`refund-retry:${id}`); } catch { /* storage is optional */ }
    setRefundConflict(false);
    setRefundConflictVerified(false);
    setRefundConflictReviewed(false);
    setRefundResultUncertain(false);
    setRefundSyncPending(false);
  }

  async function refreshRefundState() {
    setRefundSyncBusy(true);
    setRefundSyncError("");
    const [orderLoaded, refundLoaded] = await Promise.all([loadOrder(), loadRefund()]);
    setRefundSyncBusy(false);
    if (!orderLoaded || !refundLoaded) {
      setRefundSyncError("伺服器資料尚未成功刷新。為避免重複登錄，請稍後重試更新；目前退款請求仍保留。 ");
      return false;
    }
    setRefundConflictVerified(true);
    if (refundConflict) setRefundConflictReviewed(false);
    setRefundSyncPending(false);
    setRefundResultUncertain(false);
    return true;
  }

  function startNewRefundAfterReconcile() {
    if (!refundConflictVerified || !refundConflictReviewed || !preview) return;
    clearRefundRetry();
    setRefundNotice("已刷新伺服器退款紀錄；舊請求鍵已結束。新的登錄會使用新的識別碼。");
    setForm({ amount: String(preview.refundable_amount), reason: "", reference: "", confirmed: false });
    setRefundOpen(true);
  }

  async function submitRefund() {
    setRefundNotice("");
    const amount = Number(form.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setRefundNotice("退款金額必須是大於 0 的整數");
      return;
    }
    if (refundStorageBlocked) {
      setRefundNotice("無法讀取此分頁保存的退款請求狀態。請先重新載入並確認退款紀錄；目前不允許建立新識別碼。");
      return;
    }
    const idempotencyKey = refundIdempotencyKey.current || crypto.randomUUID();
    refundIdempotencyKey.current = idempotencyKey;
    try {
      sessionStorage.setItem(`refund-retry:${id}`, JSON.stringify({
        idempotencyKey,
        amount: form.amount,
        reason: form.reason,
        reference: form.reference,
        confirmed: form.confirmed,
        state: "uncertain"
      }));
    } catch {
      setRefundNotice("無法安全保存本次退款請求。請啟用此分頁的工作階段儲存空間後再試，避免重新整理後以新識別碼重複登錄。");
      return;
    }
    setRefundBusy(true);
    let receivedResponse = false;
    try {
      const response = await adminFetch(`/api/admin/orders/${id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          idempotency_key: idempotencyKey,
          reason: form.reason,
          provider_reference: form.reference,
          confirmed_in_ecpay: form.confirmed
        })
      });
      receivedResponse = true;
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        if (data?.code === "REFUND_IDEMPOTENCY_CONFLICT") {
          setRefundResultUncertain(false);
          setRefundConflict(true);
          setRefundConflictVerified(false);
          setRefundConflictReviewed(false);
          sessionStorage.setItem(`refund-retry:${id}`, JSON.stringify({
            idempotencyKey, amount: form.amount, reason: form.reason, reference: form.reference,
            confirmed: form.confirmed, state: "conflict"
          }));
          setRefundNotice("此識別碼已對應另一筆已記錄的退款內容。先更新訂單與退款清單；確認伺服器狀態後才能開始新的登錄。");
        } else if (response.status >= 500) {
          setRefundResultUncertain(true);
        } else {
          clearRefundRetry();
          setRefundResultUncertain(false);
        }
        throw new Error(data?.error || "退款登錄失敗");
      }
      setRefundNotice(
        `已登錄。應收回 ${data.credits_expected} 點，實際收回 ${data.credits_reclaimed} 點` +
        (data.credits_shortfall > 0 ? `，短少 ${data.credits_shortfall} 點（已被使用）` : "") +
        (data.idempotent_replay ? "（重送已沿用原退款紀錄）" : "") + "。"
      );
      setRefundSyncPending(true);
      setRefundResultUncertain(true);
      sessionStorage.setItem(`refund-retry:${id}`, JSON.stringify({
        idempotencyKey, amount: form.amount, reason: form.reason, reference: form.reference,
        confirmed: form.confirmed, state: "committed-refresh"
      }));
      const synced = await refreshRefundState();
      if (synced) {
        clearRefundRetry();
        setRefundOpen(false);
        setForm({ amount: "", reason: "", reference: "", confirmed: false });
      } else {
        setRefundNotice("退款已由伺服器接受，但畫面資料刷新失敗。請更新退款狀態；重新整理頁面後也會沿用同一識別碼，不會建立新操作。");
      }
    } catch (e) {
      if (!receivedResponse) setRefundResultUncertain(true);
      setRefundNotice(e instanceof Error ? e.message : "退款登錄失敗");
    } finally {
      setRefundBusy(false);
    }
  }

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => { loadOrder(); }, [loadOrder]);

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
  const course = normalizeOne(order.course_products);
  const registration = Array.isArray(order.course_registrations) ? order.course_registrations[0] : null;

  return (
    <>
      <Link href="/admin/orders" style={{ color: "var(--green)", fontWeight: 700 }}>← 返回列表</Link>
      <h1 style={{ marginTop: 14 }}>訂單詳情</h1>
      <p className="lead">
        <span style={{ fontFamily: "ui-monospace, monospace" }}>{order.order_no}</span>
        {" ｜ "}
        {order.order_type === "course" ? "課程報名" : "會員方案"}
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
          {order.order_type === "course" ? (
            <>
              <Field label="課程名稱" value={[course?.title, course?.subtitle].filter(Boolean).join(" ") || order.item_name || "—"} />
              <Field label="課程代碼" value={course?.code || "—"} />
              <Field label="課程時間" value={formatDate(course?.starts_at)} />
              <Field label="課程地點" value={course?.location || "—"} />
              <Field label="報名身份" value={registrationTypeLabel(registration?.registration_type)} />
            </>
          ) : (
            <>
              <Field label="方案名稱" value={plan?.name || "—"} />
              <Field label="方案代碼" value={plan?.code || "—"} />
              <Field label="方案價格" value={typeof plan?.price === "number" ? `${plan.currency || "TWD"} ${plan.price.toLocaleString()}` : "—"} />
              <Field label="點數" value={typeof plan?.credits === "number" ? `${plan.credits} 點` : "—"} />
              <Field label="有效天數" value={typeof plan?.duration_days === "number" ? `${plan.duration_days} 天` : "—"} />
            </>
          )}
        </Section>
      </div>

      {registration && (
        <Section title="課程報名資料">
          <div className="field-grid">
            <Field label="報名姓名" value={registration.name} />
            <Field label="性別" value={registration.gender || "—"} />
            <Field label="電話" value={registration.phone} />
            <Field label="LINE ID" value={registration.line_id || "—"} />
            <Field label="Email" value={registration.email} />
            <Field label="報名狀態" value={statusLabel(registration.status)} />
            <Field label="報名身份" value={registrationTypeLabel(registration.registration_type)} />
            <Field label="付款金額" value={`${registration.currency} ${registration.amount.toLocaleString()}`} />
          </div>
          <Field label="學習背景" value={registration.learning_background || "—"} />
          <Field label="想加強的內容" value={(registration.interests || []).join("、") || "—"} />
          <Field label="報名動機 / 學習期待" value={registration.motivation || "—"} pre />
          <Field label="備註" value={registration.note || "—"} pre />
        </Section>
      )}

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

      <Section title="退款">
        {!preview ? (
          <p style={{ color: "var(--muted)" }}>讀取退款資訊中⋯</p>
        ) : (
          <>
            <Field label="訂單金額" value={`${order.currency} ${preview.order_amount.toLocaleString()}`} />
            <Field label="已退金額" value={`${order.currency} ${preview.already_refunded.toLocaleString()}`} />
            <Field label="可退金額" value={`${order.currency} ${preview.refundable_amount.toLocaleString()}`} />
            <Field label="本訂單發出點數" value={`${preview.credits_granted} 點`} />
            <Field
              label="目前可收回點數"
              value={
                `${preview.credits_available} 點` +
                (preview.credits_available < preview.credits_granted
                  ? `（差額 ${preview.credits_granted - preview.credits_available} 點已被使用，收不回來）`
                  : "")
              }
            />
            <Field label="發票" value={preview.invoice_number ? `${preview.invoice_number}（${preview.invoice_status}）` : "無"} />

            {refundNotice && (
              <p style={{ gridColumn: "1 / -1", color: refundNotice.startsWith("已登錄") ? "var(--green)" : "#ffb7b7" }}>
                {refundNotice}
              </p>
            )}

            {refundSyncError && <p role="alert" style={{ gridColumn: "1 / -1", color: "#ffb7b7" }}>{refundSyncError}</p>}
            {refundStorageBlocked && <p role="alert" style={{ gridColumn: "1 / -1", color: "#ffb7b7" }}>無法讀取已保存的退款請求。為避免建立重複退款，請勿提交新操作，並先確認伺服器退款紀錄。</p>}

            {refundConflict ? (
              <div style={{ gridColumn: "1 / -1", marginTop: 10, display: "grid", gap: 10 }}>
                <p role="alert" style={{ color: "#e8cc83", lineHeight: 1.7 }}>
                  同一識別碼已存在不同內容的退款紀錄。請先刷新並核對下方退款清單；刷新失敗時不會解除保護。
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" className="btn" disabled={refundSyncBusy} onClick={refreshRefundState}>
                    {refundSyncBusy ? "更新中⋯" : "更新訂單與退款狀態"}
                  </button>
                  {refundConflictVerified && preview.refundable_amount > 0 && (order.status === "paid" || order.status === "partially_refunded") && (
                    <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <input type="checkbox" checked={refundConflictReviewed} onChange={(event) => setRefundConflictReviewed(event.target.checked)} />
                      <span>我已核對剛更新的訂單及退款清單，確認原登錄內容後再開始新的退款操作。</span>
                    </label>
                  )}
                  {refundConflictVerified && refundConflictReviewed && preview.refundable_amount > 0 && (order.status === "paid" || order.status === "partially_refunded") && (
                    <button type="button" className="btn primary" onClick={startNewRefundAfterReconcile}>
                      核對後開始新退款登錄
                    </button>
                  )}
                  {refundConflictVerified && (preview.refundable_amount <= 0 || (order.status !== "paid" && order.status !== "partially_refunded")) && (
                    <p style={{ color: "var(--muted)" }}>刷新後顯示此訂單已無可退金額或狀態不允許退款，不能開始新登錄。</p>
                  )}
                </div>
              </div>
            ) : refundSyncPending ? (
              <div style={{ gridColumn: "1 / -1", marginTop: 10, display: "grid", gap: 10 }}>
                <p role="alert" style={{ color: "#e8cc83", lineHeight: 1.7 }}>
                  退款已由伺服器接受，正在確認最新訂單與退款紀錄。同步完成前不會開放新的退款操作。
                </p>
                <button type="button" className="btn" disabled={refundSyncBusy} onClick={refreshRefundState}>
                  {refundSyncBusy ? "更新中⋯" : "更新訂單與退款狀態"}
                </button>
              </div>
            ) : refundResultUncertain || (preview.refundable_amount > 0 && (order.status === "paid" || order.status === "partially_refunded")) ? (
              !refundOpen ? (
                <div style={{ gridColumn: "1 / -1", marginTop: 10 }}>
                  <button type="button" className="btn" disabled={refundSyncPending || refundStorageBlocked} onClick={() => { clearRefundRetry(); setRefundResultUncertain(false); setRefundOpen(true); setForm((f) => ({ ...f, amount: String(preview.refundable_amount) })); }}>
                    登錄退款
                  </button>
                  <p style={{ color: "var(--muted)", marginTop: 8, lineHeight: 1.7 }}>
                    綠界的信用卡請退款 API 沒有測試環境，所以這一版不由系統代為呼叫。
                    請先到<strong>綠界廠商後台</strong>完成實際退款，再回來這裡登錄，
                    系統才會回收點數並更新訂單狀態。
                  </p>
                </div>
              ) : (
                <div style={{ gridColumn: "1 / -1", marginTop: 10, display: "grid", gap: 10 }}>
                  <label>
                    退款金額（上限 {preview.refundable_amount}）
                    <input
                      type="number" min={1} max={preview.refundable_amount} value={form.amount} disabled={refundResultUncertain}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                  </label>
                  <label>
                    退款原因（必填，會寫入退款紀錄與稽核 log）
                    <input
                      type="text" value={form.reason} placeholder="例如：客戶反映報告不符需求" disabled={refundResultUncertain}
                      onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    />
                  </label>
                  <label>
                    綠界後台交易編號 / 備註（選填，供日後對帳）
                    <input
                      type="text" value={form.reference} placeholder={order.provider_trade_no || ""} disabled={refundResultUncertain}
                      onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                    />
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <input
                      type="checkbox" checked={form.confirmed} disabled={refundResultUncertain}
                      onChange={(e) => setForm((f) => ({ ...f, confirmed: e.target.checked }))}
                    />
                    <span>我已經在綠界廠商後台完成這筆退款，現在只是把結果登錄進系統。</span>
                  </label>
                  {preview.invoice_number && preview.invoice_status === "issued" && (
                    <p style={{ color: "#e8cc83", lineHeight: 1.7 }}>
                      這張訂單已開立發票 {preview.invoice_number}。系統目前沒有作廢／折讓功能，
                      發票要另外到 EZPay 後台處理。
                    </p>
                  )}
                  {refundResultUncertain && (
                    <p role="alert" style={{ color: "#e8cc83", lineHeight: 1.7 }}>
                      尚未確認伺服器是否完成登錄。請用相同內容重試；系統會沿用同一請求識別碼，請勿另開一筆退款。
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" className="btn primary" disabled={refundBusy || !form.confirmed || refundSyncPending || refundStorageBlocked} onClick={submitRefund}>
                      {refundBusy ? "登錄中⋯" : "確認登錄退款"}
                    </button>
                    <button type="button" className="btn" disabled={refundBusy || refundResultUncertain} onClick={() => setRefundOpen(false)}>取消</button>
                  </div>
                </div>
              )
            ) : (
              <p style={{ gridColumn: "1 / -1", color: "var(--muted)" }}>
                {preview.refundable_amount <= 0 ? "這張訂單已全額退款。" : "此訂單狀態不可退款。"}
              </p>
            )}

            {refunds.length > 0 && (
              <div style={{ gridColumn: "1 / -1", marginTop: 14 }}>
                <table className="admin-table">
                  <thead>
                    <tr><th>時間</th><th>類型</th><th>金額</th><th>點數（應收/實收/短少）</th><th>原因</th><th>綠界備註</th><th>操作人</th></tr>
                  </thead>
                  <tbody>
                    {refunds.map((r) => (
                      <tr key={r.id}>
                        <td>{formatDate(r.created_at)}</td>
                        <td>{r.kind === "full" ? "全額" : "部分"}</td>
                        <td>{r.amount.toLocaleString()}</td>
                        <td>{r.credits_expected} / {r.credits_reclaimed} / {r.credits_shortfall}</td>
                        <td>{r.reason}</td>
                        <td style={{ fontFamily: "ui-monospace, monospace" }}>{r.provider_reference || "—"}</td>
                        <td>{r.admin_email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
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
      <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
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
    refunded: "已退款",
    partially_refunded: "部分退款"
  } as Record<string, string>)[s] || s;
}

function registrationTypeLabel(value?: string | null) {
  return value === "returning" ? "複訓學員" : value === "new" ? "新生報名" : "—";
}

const mono: React.CSSProperties = { fontFamily: "ui-monospace, monospace", fontSize: 14 };
const preStyle: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: 12,
  color: "var(--text)",
  fontSize: 14,
  lineHeight: 1.6,
  margin: 0
};
