"use client";

import { FormEvent, useEffect, useState } from "react";
import { adminFetch } from "../_shell";

type Approval = {
  organization_label: string;
  project_label: string;
  retention_mode: string;
  approved_at: string;
  status: "active" | "revoked";
  verified_at: string;
};

export default function FaceProviderApprovalPage() {
  const [approval, setApproval] = useState<Approval | null>(null);
  const [form, setForm] = useState({ organizationLabel: "", projectLabel: "", approvedAt: "", attested: false, note: "" });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await adminFetch("/api/admin/face-provider-approval");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "讀取失敗");
    setApproval(body.approval || null);
  }

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.attested) return setMessage("請先完成 OpenAI 官方後台檢查並勾選聲明");
    setSaving(true); setMessage("");
    try {
      const response = await adminFetch("/api/admin/face-provider-approval", { method: "POST", body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "儲存失敗");
      setMessage("已記錄具名認證。這不會自動開啟正式面相功能，仍需工程驗收與功能旗標。");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "儲存失敗"); }
    finally { setSaving(false); }
  }

  async function revoke() {
    if (!window.confirm("撤銷後，所有新的照片 Quality／Vision 呼叫都會 fail-closed。確定撤銷？")) return;
    const response = await adminFetch("/api/admin/face-provider-approval", { method: "DELETE" });
    const body = await response.json();
    setMessage(response.ok ? "認證已撤銷，照片 provider 已關閉。" : body.error || "撤銷失敗");
    if (response.ok) await load();
  }

  return <>
    <h1>OpenAI 照片資料保留認證</h1>
    <p className="lead">由提供 API Key 的老師登入 OpenAI 官方後台確認。巽風不會要求或保存 OpenAI 密碼、API Key、OTP。</p>

    <div className="kpi-card" style={{ marginBottom: 18, borderColor: approval?.status === "active" ? "#69d69d" : "#ffd166" }}>
      <div className="label">目前狀態</div>
      <div className="value" style={{ fontSize: 20 }}>{approval?.status === "active" ? "已完成具名 ZDR 認證" : "尚未認證／已撤銷"}</div>
      {approval && <div className="hint">{approval.organization_label}／{approval.project_label}，核准日 {approval.approved_at}</div>}
    </div>

    <div className="admin-detail" style={{ marginBottom: 18 }}>
      <h2>老師操作步驟</h2>
      <ol style={{ lineHeight: 1.9 }}>
        <li>按下方按鈕，前往 OpenAI 官方 Data controls。</li>
        <li>使用提供這把 API Key 的 OpenAI 帳號登入。</li>
        <li>確認正確的 Organization 與 Project 顯示 <strong>Zero Data Retention</strong>，不是 None 或只有 Modified Abuse Monitoring。</li>
        <li>回到本頁填入畫面上的組織／Project 名稱、核准日期並勾選聲明。</li>
      </ol>
      <a className="admin-action-btn" href="https://platform.openai.com/settings/organization/data-controls" target="_blank" rel="noreferrer">開啟 OpenAI 官方 Data controls</a>
      <p className="muted" style={{ marginTop: 12 }}>官方仍可能對影像執行安全掃描；本認證是具名人工確認，不是假裝由 API 自動驗證。</p>
    </div>

    <form className="admin-form-grid" onSubmit={submit}>
      <label>Organization 名稱<input required maxLength={160} value={form.organizationLabel} onChange={(e) => setForm({ ...form, organizationLabel: e.target.value })} /></label>
      <label>Project 名稱<input required maxLength={160} value={form.projectLabel} onChange={(e) => setForm({ ...form, projectLabel: e.target.value })} /></label>
      <label>OpenAI 核准日期<input required type="date" value={form.approvedAt} onChange={(e) => setForm({ ...form, approvedAt: e.target.value })} /></label>
      <label style={{ gridColumn: "1 / -1" }}>備註（不可貼 API Key、密碼或 token）<textarea maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
      <label style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <input type="checkbox" checked={form.attested} onChange={(e) => setForm({ ...form, attested: e.target.checked })} style={{ width: 18, marginTop: 4 }} />
        我已用 API Key 所屬帳號確認：上述 Project 已由 OpenAI 核准並啟用 Zero Data Retention，且資料正確。
      </label>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="admin-action-btn" disabled={saving || !form.attested}>{saving ? "儲存中…" : "完成具名認證"}</button>
        {approval?.status === "active" && <button className="admin-action-btn ghost" type="button" onClick={revoke}>撤銷認證</button>}
      </div>
    </form>
    {message && <div className="admin-inline-message" style={{ marginTop: 16 }}>{message}</div>}
  </>;
}
