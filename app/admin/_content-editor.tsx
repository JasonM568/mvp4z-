"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "./_shell";

export type FieldKind = "text" | "textarea" | "image" | "video";

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

export type MediaKind = "image" | "video";

const MEDIA_ACCEPT: Record<MediaKind, string> = {
  image: "image/jpeg,image/png,image/webp,image/gif",
  video: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
};

const MEDIA_LIMIT: Record<MediaKind, { bytes: number; label: string }> = {
  image: { bytes: 10 * 1024 * 1024, label: "10MB" },
  video: { bytes: 200 * 1024 * 1024, label: "200MB" }
};

/** 副檔名推 MIME：部分瀏覽器（尤其 Windows 的 .mov）會給空的 file.type。 */
function guessMimeType(file: File, kind: MediaKind) {
  if (file.type) return file.type.toLowerCase();
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = kind === "video"
    ? { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime" }
    : { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
  return map[ext] || "";
}

/**
 * 上傳流程：先向後台 API 換 signed upload URL，再由瀏覽器直接 PUT 到 Supabase Storage。
 * 不把檔案送進 Vercel function，避免 4.5MB request body 上限；影片與大海報都靠這條路。
 */
export async function uploadMedia(
  file: File,
  folder: string,
  kind: MediaKind,
  onProgress?: (percent: number) => void
): Promise<string> {
  const limit = MEDIA_LIMIT[kind];
  if (!file.size) throw new Error("檔案不可為空");
  if (file.size > limit.bytes) throw new Error(`${kind === "video" ? "單支影片" : "單張圖片"}不可超過 ${limit.label}`);
  const mimeType = guessMimeType(file, kind);

  const signResponse = await adminFetch("/api/admin/site-content/media/sign", {
    method: "POST",
    body: JSON.stringify({ kind, folder, mime_type: mimeType, size_bytes: file.size, filename: file.name })
  });
  const signed = await signResponse.json().catch(() => ({}));
  if (!signResponse.ok) throw new Error(signed.error || "無法建立上傳網址");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", String(signed.upload_url));
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");
    if (signed.apikey) xhr.setRequestHeader("apikey", String(signed.apikey));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new Error("上傳中斷，請確認網路後重試"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `上傳失敗（${xhr.status}）`;
      try {
        const parsed = JSON.parse(xhr.responseText || "{}");
        if (parsed.message || parsed.error) message = String(parsed.message || parsed.error);
      } catch {
        /* 非 JSON 回應就用預設訊息 */
      }
      if (/exceeded the maximum allowed size|payload too large/i.test(message)) {
        message = `檔案超過 Storage 上限（${limit.label}），請壓縮後再上傳`;
      } else if (/mime type .* is not supported/i.test(message)) {
        message = "Storage 尚未允許這種檔案格式，請先套用 20260904120000_site_media_video migration";
      }
      reject(new Error(message));
    };
    xhr.send(file);
  });

  return String(signed.url);
}

export function MediaField({
  value,
  folder,
  kind = "image",
  placeholder,
  onChange,
  onError
}: {
  value: string;
  folder: string;
  kind?: MediaKind;
  placeholder?: string;
  onChange: (value: string) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const isVideo = kind === "video";

  async function upload(file: File) {
    setUploading(true);
    setProgress(0);
    try {
      const url = await uploadMedia(file, folder, kind, setProgress);
      onChange(url);
      onError(`${isVideo ? "影片" : "圖片"}已上傳，記得按下方的儲存才會生效。`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "上傳失敗");
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const preview = mediaSrc(value);
  const looksLikeFile = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(preview) || /supabase\.co\/storage/i.test(preview);

  return (
    <>
      <input value={value} placeholder={placeholder || (isVideo ? "影片網址（mp4 / YouTube），或按右邊上傳" : "圖片網址，或按右邊上傳")}
        onChange={(event) => onChange(event.target.value)} />
      <div className="admin-btn-row">
        <button className="admin-action-btn ghost small" type="button" disabled={uploading}
          onClick={() => inputRef.current?.click()}>
          {uploading ? `上傳中 ${progress}%` : isVideo ? "上傳影片" : "上傳圖片"}
        </button>
        {value && <button className="admin-action-btn ghost small" type="button" disabled={uploading} onClick={() => onChange("")}>清除</button>}
      </div>
      {uploading && (
        <div className="admin-upload-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={MEDIA_ACCEPT[kind]}
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {value && !isVideo && <img className="admin-thumb large" src={preview} alt="" />}
      {value && isVideo && looksLikeFile && (
        <video className="admin-thumb large" src={preview} controls preload="metadata" />
      )}
      {value && isVideo && !looksLikeFile && <small>外部影片連結（YouTube / Vimeo）會在前台以嵌入播放器顯示。</small>}
    </>
  );
}

/** 舊名稱保留給案例／服務／課程列表編輯器。 */
export function ImageField(props: {
  value: string;
  folder: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onError: (message: string) => void;
}) {
  return <MediaField {...props} kind="image" />;
}
