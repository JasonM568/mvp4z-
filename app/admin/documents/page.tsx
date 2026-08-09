"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { adminFetch } from "../_shell";

type DocumentRow = {
  id: string;
  title: string;
  category: "principle" | "case" | "teaching" | "reference";
  term: "bazi" | "qimen" | "liuyao" | "meihua" | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  char_count: number;
  include_in_prompt: boolean;
  created_at: string;
  updated_at: string;
};

const CATEGORY_LABELS = {
  principle: "判讀原則",
  case: "案例",
  teaching: "教學講義",
  reference: "參考資料"
};
const TERM_LABELS = { bazi: "八字", qimen: "奇門", liuyao: "六爻", meihua: "梅花" };

export default function AdminDocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [budget, setBudget] = useState(6000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("reference");
  const [term, setTerm] = useState("");

  const includedChars = useMemo(
    () => documents.reduce((sum, document) => sum + (document.include_in_prompt ? document.char_count : 0), 0),
    [documents]
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await adminFetch("/api/admin/documents");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "讀取文件失敗");
      setDocuments(body.documents || []);
      setBudget(body.char_budget || 6000);
      if (body.setup_required) setError(body.setup_required);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "讀取文件失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return setError("請先選擇 .txt 或 .md 檔案");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("title", title || file.name.replace(/\.[^.]+$/, ""));
      form.set("category", category);
      form.set("term", term);
      const response = await adminFetch("/api/admin/documents", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "上傳失敗");
      setFile(null);
      setTitle("");
      setMessage(`已上傳「${body.document.title}」，預設尚未納入報告。`);
      const input = document.getElementById("document-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上傳失敗");
    } finally {
      setSaving(false);
    }
  }

  async function update(id: string, patch: Partial<Pick<DocumentRow, "title" | "category" | "term" | "include_in_prompt">>) {
    setError("");
    setMessage("");
    const response = await adminFetch(`/api/admin/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    const body = await response.json();
    if (!response.ok) return setError(body.error || "更新失敗");
    setDocuments((current) => current.map((document) => (document.id === id ? { ...document, ...body.document } : document)));
    setMessage("文件設定已更新，報告端最多 60 秒後全面生效。");
  }

  async function remove(document: DocumentRow) {
    if (!window.confirm(`確定刪除「${document.title}」？檔案與文字內容都會移除。`)) return;
    setError("");
    const response = await adminFetch(`/api/admin/documents/${document.id}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) return setError(body.error || "刪除失敗");
    setDocuments((current) => current.filter((item) => item.id !== document.id));
    setMessage(`已刪除「${document.title}」。`);
  }

  function rename(document: DocumentRow) {
    const nextTitle = window.prompt("文件標題", document.title)?.trim();
    if (!nextTitle || nextTitle === document.title) return;
    void update(document.id, { title: nextTitle });
  }

  const percentage = Math.min(100, Math.round((includedChars / budget) * 100));
  return (
    <>
      <h1>老師文件</h1>
      <p className="lead">上傳純文字教材，勾選後會作為易學報告的補充判讀依據。目前接受 UTF-8／Big5 的 .txt、.md，單檔上限 2MB。</p>

      <section className="kpi-card" style={{ margin: "18px 0", maxWidth: 760 }}>
        <div className="label">目前納入 Prompt 的字數</div>
        <div className="value" style={{ fontSize: 24 }}>{includedChars.toLocaleString()} / {budget.toLocaleString()} 字</div>
        <div style={{ height: 8, background: "rgba(255,255,255,.1)", borderRadius: 20, overflow: "hidden", marginTop: 10 }}>
          <div style={{ width: `${percentage}%`, height: "100%", background: includedChars > budget * 0.85 ? "#e6a95c" : "var(--green)" }} />
        </div>
        <p className="muted">這段內容每份報告會送入多次模型呼叫，因此後端固定限制在 {budget.toLocaleString()} 字內。</p>
      </section>

      <form onSubmit={upload} style={{ display: "grid", gap: 12, maxWidth: 760, margin: "20px 0 28px" }}>
        <h2 style={{ margin: 0 }}>上傳文件</h2>
        <input id="document-file" type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => { const selected = event.target.files?.[0] || null; setFile(selected); if (selected && !title) setTitle(selected.name.replace(/\.[^.]+$/, "")); }} />
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="文件標題" maxLength={160} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={term} onChange={(event) => setTerm(event.target.value)}>
            <option value="">不限術別</option>
            {Object.entries(TERM_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button className="admin-action-btn" type="submit" disabled={saving}>{saving ? "上傳中…" : "上傳文件"}</button>
        </div>
      </form>

      {message && <p style={{ color: "var(--green)" }}>{message}</p>}
      {error && <p style={{ color: "#ffb7b7" }}>{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>納入</th><th>文件</th><th>分類</th><th>術別</th><th>字數／大小</th><th>上傳時間</th><th>操作</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="admin-empty">讀取中…</td></tr>}
            {!loading && !documents.length && <tr><td colSpan={7} className="admin-empty">尚未上傳文件</td></tr>}
            {documents.map((document) => (
              <tr key={document.id}>
                <td><input type="checkbox" checked={document.include_in_prompt} onChange={(event) => void update(document.id, { include_in_prompt: event.target.checked })} aria-label={`納入 ${document.title}`} /></td>
                <td><strong>{document.title}</strong><div className="muted">{document.original_name}</div></td>
                <td><select value={document.category} onChange={(event) => void update(document.id, { category: event.target.value as DocumentRow["category"] })}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                <td><select value={document.term || ""} onChange={(event) => void update(document.id, { term: (event.target.value || null) as DocumentRow["term"] })}><option value="">不限</option>{Object.entries(TERM_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                <td>{document.char_count.toLocaleString()} 字<div className="muted">{formatBytes(document.size_bytes)}</div></td>
                <td>{new Date(document.created_at).toLocaleString("zh-TW")}</td>
                <td><button className="admin-action-btn ghost" type="button" onClick={() => rename(document)}>改名</button> <button className="admin-action-btn ghost" type="button" onClick={() => void remove(document)}>刪除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function formatBytes(bytes: number) {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
}
