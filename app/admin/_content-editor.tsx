"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "./_shell";

export type FieldKind = "text" | "textarea" | "image";

export type FieldSpec = {
  key: string;
  label: string;
  kind?: FieldKind;
  placeholder?: string;
  hint?: string;
  wide?: boolean;
};

export type ContentItem = Record<string, unknown> & {
  id: string;
  title: string;
  is_published: boolean;
  sort_order: number;
};

type Props = {
  type: "services" | "cases" | "courses";
  heading: string;
  intro: string;
  fields: FieldSpec[];
  /** 表格上要另外顯示的欄位（title 與狀態一定會顯示）。 */
  columns: { key: string; label: string }[];
  uploadFolder?: string;
};

/** 相對路徑（既有的 assets/...）在後台預覽時補上開頭斜線；上傳後的絕對網址原樣使用。 */
export function mediaSrc(value: string) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("/")) return url;
  return `/${url}`;
}

export function ContentListEditor({ type, heading, intro, fields, columns, uploadFolder }: Props) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [setupHint, setSetupHint] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminFetch(`/api/admin/site-content?type=${type}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "讀取失敗");
      setItems(data.items || []);
      setSetupHint(data.setup_required || "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "讀取失敗");
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => { void load(); }, [load]);

  function startCreate() {
    setEditing("new");
    setForm(Object.fromEntries(fields.map((field) => [field.key, ""])));
    setNotice("");
  }

  function startEdit(item: ContentItem) {
    setEditing(item.id);
    setForm(Object.fromEntries(fields.map((field) => [field.key, String(item[field.key] ?? "")])));
    setNotice("");
  }

  async function save() {
    setBusy(true);
    setNotice("");
    try {
      const creating = editing === "new";
      const response = await adminFetch("/api/admin/site-content", {
        method: creating ? "POST" : "PATCH",
        body: JSON.stringify(creating ? { type, ...form } : { type, id: editing, ...form })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "儲存失敗");
      setEditing(null);
      setNotice(creating ? "已建立，預設為「未上架」，確認內容後再按上架。" : "已更新，前台最多 30 秒內生效。");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>, message: string) {
    setBusy(true);
    setNotice("");
    try {
      const response = await adminFetch("/api/admin/site-content", {
        method: "PATCH",
        body: JSON.stringify({ type, id, ...body })
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

  async function remove(item: ContentItem) {
    if (!window.confirm(`確定要刪除「${item.title}」？刪除後無法復原。`)) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await adminFetch(`/api/admin/site-content?type=${type}&id=${item.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "刪除失敗");
      setNotice(`已刪除「${item.title}」。`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "刪除失敗");
    } finally {
      setBusy(false);
    }
  }

  const publishedCount = items.filter((item) => item.is_published).length;

  return (
    <section className="admin-card">
      <div className="admin-section-title">
        <h2>{heading}</h2>
        <button className="admin-action-btn" disabled={busy} onClick={startCreate}>新增一筆</button>
      </div>
      <p className="lead">{intro}</p>
      <p className="lead">目前 {items.length} 筆，其中 {publishedCount} 筆已上架顯示於前台。</p>

      {setupHint && <p className="admin-inline-message" role="status">⚠️ {setupHint}</p>}
      {notice && <p className="admin-inline-message" role="status">{notice}</p>}

      {editing && (
        <div className="admin-card admin-content-form">
          <h3>{editing === "new" ? "新增項目" : "編輯項目"}</h3>
          <div className="admin-form-grid">
            {fields.map((field) => (
              <label key={field.key} className={field.wide || field.kind !== "text" ? "admin-form-wide" : ""}>
                {field.label}
                {field.kind === "textarea" ? (
                  <textarea
                    rows={4}
                    value={form[field.key] || ""}
                    placeholder={field.placeholder}
                    onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                  />
                ) : field.kind === "image" ? (
                  <ImageField
                    value={form[field.key] || ""}
                    folder={uploadFolder || type}
                    placeholder={field.placeholder}
                    onChange={(value) => setForm({ ...form, [field.key]: value })}
                    onError={setNotice}
                  />
                ) : (
                  <input
                    value={form[field.key] || ""}
                    placeholder={field.placeholder}
                    onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                  />
                )}
                {field.hint && <small>{field.hint}</small>}
              </label>
            ))}
          </div>
          <div className="admin-btn-row">
            <button className="admin-action-btn" disabled={busy || !String(form.title || "").trim()} onClick={save}>
              {editing === "new" ? "建立" : "儲存變更"}
            </button>
            <button className="admin-action-btn ghost" disabled={busy} onClick={() => setEditing(null)}>取消</button>
          </div>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>排序</th>
              <th>標題</th>
              {columns.map((column) => <th key={column.key}>{column.label}</th>)}
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={columns.length + 4} className="admin-empty">讀取中⋯</td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan={columns.length + 4} className="admin-empty">還沒有任何項目，按右上角「新增一筆」建立。</td></tr>
            )}
            {!loading && items.map((item, index) => (
              <tr key={item.id}>
                <td>
                  <button className="admin-action-btn ghost small" disabled={busy || index === 0}
                    onClick={() => patch(item.id, { move: "up" }, "已上移。")}>↑</button>
                  <button className="admin-action-btn ghost small" disabled={busy || index === items.length - 1}
                    onClick={() => patch(item.id, { move: "down" }, "已下移。")}>↓</button>
                </td>
                <td>
                  <strong>{item.title}</strong>
                  {typeof item.image === "string" && item.image && (
                    <div><img className="admin-thumb" src={mediaSrc(item.image)} alt="" /></div>
                  )}
                </td>
                {columns.map((column) => (
                  <td key={column.key} className="muted">{String(item[column.key] ?? "") || "—"}</td>
                ))}
                <td>
                  <span className={`admin-pill ${item.is_published ? "confirmed" : "pending"}`}>
                    {item.is_published ? "已上架" : "未上架"}
                  </span>
                </td>
                <td>
                  <button className="admin-action-btn ghost small" disabled={busy} onClick={() => startEdit(item)}>編輯</button>
                  <button
                    className="admin-action-btn ghost small"
                    disabled={busy}
                    onClick={() => patch(
                      item.id,
                      { is_published: !item.is_published },
                      item.is_published ? "已下架，前台不再顯示。" : "已上架，前台最多 30 秒內出現。"
                    )}
                  >
                    {item.is_published ? "下架" : "上架"}
                  </button>
                  <button className="admin-action-btn ghost small" disabled={busy} onClick={() => remove(item)}>刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ImageField({
  value,
  folder,
  placeholder,
  onChange,
  onError
}: {
  value: string;
  folder: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", folder);
      const response = await adminFetch("/api/admin/site-content/media", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "上傳失敗");
      onChange(data.url);
      onError("圖片已上傳，記得按下方的儲存才會生效。");
    } catch (error) {
      onError(error instanceof Error ? error.message : "上傳失敗");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input value={value} placeholder={placeholder || "圖片網址，或按右邊上傳"} onChange={(event) => onChange(event.target.value)} />
      <div className="admin-btn-row">
        <button className="admin-action-btn ghost small" type="button" disabled={uploading}
          onClick={() => inputRef.current?.click()}>
          {uploading ? "上傳中⋯" : "上傳圖片"}
        </button>
        {value && <button className="admin-action-btn ghost small" type="button" onClick={() => onChange("")}>清除</button>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {value && <img className="admin-thumb large" src={mediaSrc(value)} alt="" />}
    </>
  );
}
