"use client";

import { FormEvent, useEffect, useState } from "react";
import { adminFetch } from "../_shell";

type Approval = {
  organization_label: string;
  project_label: string;
  approved_at: string;
  status: "active" | "revoked";
};

export default function GeminiProviderApprovalPage() {
  const [approval, setApproval] = useState<Approval | null>(null);
  const [form, setForm] = useState({ projectLabel: "", regionLabel: "", approvedAt: "", attested: false, note: "" });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await adminFetch("/api/admin/gemini-provider-approval");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "讀取失敗");
    setApproval(body.approval || null);
  }

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.attested) return setMessage("請先完成 Google Cloud／Vertex AI 檢查並勾選聲明");
    setSaving(true); setMessage("");
    try {
      const response = await adminFetch("/api/admin/gemini-provider-approval", { method: "POST", body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "儲存失敗");
      setMessage("已記錄具名認證。工程端仍會先完成合成照片驗收，才會切換會員照片流量。");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "儲存失敗"); }
    finally { setSaving(false); }
  }

  async function revoke() {
    if (!window.confirm("撤銷後，Gemini 照片品質與 Vision 呼叫會立即 fail-closed。確定撤銷？")) return;
    const response = await adminFetch("/api/admin/gemini-provider-approval", { method: "DELETE" });
    const body = await response.json();
    setMessage(response.ok ? "Gemini 認證已撤銷。" : body.error || "撤銷失敗");
    if (response.ok) await load();
  }

  return <>
    <h1>Gemini／Vertex AI 照片隱私認證</h1>
    <p className="lead">由提供 Google API 專案的老師具名確認。巽風不會要求或保存 Google 密碼、API Key、OTP。</p>

    <div className="kpi-card" style={{ marginBottom: 18, borderColor: approval?.status === "active" ? "#69d69d" : "#ffd166" }}>
      <div className="label">目前狀態</div>
      <div className="value" style={{ fontSize: 20 }}>{approval?.status === "active" ? "已完成具名隱私認證" : "尚未認證／已撤銷"}</div>
      {approval && <div className="hint">Project：{approval.organization_label}／Region：{approval.project_label}，確認日 {approval.approved_at}</div>}
    </div>

    <div className="admin-detail" style={{ marginBottom: 18 }}>
      <h2>老師操作步驟</h2>
      <ol style={{ lineHeight: 1.9 }}>
        <li>登入提供這把 Gemini API Key 的 Google Cloud 帳號，確認正確 Project。</li>
        <li>確認 Project 已開啟計費並使用 Vertex AI；不要以免費層處理會員照片。</li>
        <li>依 Google 官方文件確認資料不供模型訓練，並完成 Zero Data Retention 要求；確認沒有啟用會保存 prompt／response 的快取或記錄功能。</li>
        <li>記下 Project ID、Vertex Region 與確認日期，回到本頁具名聲明。</li>
      </ol>
      <a className="admin-action-btn" href="https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention" target="_blank" rel="noreferrer">開啟 Google 官方 ZDR 文件</a>
      <p className="muted" style={{ marginTop: 12 }}>本頁不會驗證或顯示 API Key；認證前，正式會員照片不會傳送給 Gemini。</p>
    </div>

    <form className="admin-form-grid" onSubmit={submit}>
      <label>Google Cloud Project ID<input required maxLength={160} value={form.projectLabel} onChange={(e) => setForm({ ...form, projectLabel: e.target.value })} /></label>
      <label>Vertex AI Region<input required maxLength={160} placeholder="例如 asia-east1" value={form.regionLabel} onChange={(e) => setForm({ ...form, regionLabel: e.target.value })} /></label>
      <label>隱私設定確認日期<input required type="date" value={form.approvedAt} onChange={(e) => setForm({ ...form, approvedAt: e.target.value })} /></label>
      <label style={{ gridColumn: "1 / -1" }}>備註（不可貼 API Key、密碼或 token）<textarea maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
      <label style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <input type="checkbox" checked={form.attested} onChange={(e) => setForm({ ...form, attested: e.target.checked })} style={{ width: 18, marginTop: 4 }} />
        我已使用 API Key 所屬 Google Cloud 帳號確認：上述 Project／Region 使用付費 Vertex AI，符合照片零資料保留要求，且未啟用會保存照片內容的快取或記錄功能。
      </label>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="admin-action-btn" disabled={saving || !form.attested}>{saving ? "儲存中…" : "完成具名認證"}</button>
        {approval?.status === "active" && <button className="admin-action-btn ghost" type="button" onClick={revoke}>撤銷認證</button>}
      </div>
    </form>
    {message && <div className="admin-inline-message" style={{ marginTop: 16 }}>{message}</div>}
  </>;
}
