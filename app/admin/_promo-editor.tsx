"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "./_shell";
import { ImageField } from "./_content-editor";

type PromoRow = Record<string, string | boolean | null>;

const TEXT_FIELDS: { key: string; label: string; kind?: "textarea" | "image"; hint?: string; placeholder?: string }[] = [
  { key: "label", label: "小標籤", placeholder: "NEW COURSE｜掌訣班招生" },
  { key: "title", label: "課程名稱", placeholder: "掌中訣" },
  { key: "title_suffix", label: "名稱後綴", placeholder: "開班授課" },
  { key: "headline", label: "主標題", placeholder: "別讓命運成為盲盒⋯" },
  { key: "subheadline", label: "副標題", placeholder: "解開命運密碼・掌握人生方向" },
  { key: "body", label: "課程內文", kind: "textarea", hint: "空一行分段，每段會變成前台的一個段落" },
  { key: "highlights", label: "課程亮點", kind: "textarea", hint: "一行一個亮點，前台會排成條列" },
  { key: "limited_text", label: "限額提醒", placeholder: "招生名額有限，立即卡位" },
  { key: "cta_text", label: "報名按鈕文字", placeholder: "立即報名" },
  { key: "register_url", label: "報名連結", placeholder: "#courseCheckout 或完整網址" },
  { key: "line_cta_text", label: "LINE 按鈕文字", placeholder: "LINE 詢問課程" },
  { key: "poster_main", label: "海報 1", kind: "image" },
  { key: "poster_second", label: "海報 2", kind: "image" },
  { key: "poster_third", label: "海報 3", kind: "image" },
  { key: "video_cover", label: "影片封面", kind: "image" },
  { key: "video_one", label: "宣傳影片 1 網址", placeholder: "mp4 檔網址" },
  { key: "video_one_title", label: "宣傳影片 1 標題" },
  { key: "video_two", label: "宣傳影片 2 網址", placeholder: "mp4 檔網址" },
  { key: "video_two_title", label: "宣傳影片 2 標題" }
];

export function CoursePromoEditor() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [setupHint, setSetupHint] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminFetch("/api/admin/site-content?type=promo");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "讀取失敗");
      setSetupHint(data.setup_required || "");
      const raw = (data.raw || {}) as PromoRow;
      setActive(Boolean(raw.active));
      const next: Record<string, string> = {};
      for (const field of TEXT_FIELDS) next[field.key] = String(raw[field.key] ?? "");
      next.publish_start = raw.publish_start ? String(raw.publish_start) : "";
      next.publish_end = raw.publish_end ? String(raw.publish_end) : "";
      setForm(next);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "讀取失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(nextActive = active) {
    setBusy(true);
    setNotice("");
    try {
      const response = await adminFetch("/api/admin/site-content", {
        method: "PATCH",
        body: JSON.stringify({ type: "promo", ...form, active: nextActive })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "儲存失敗");
      setActive(Boolean(data.raw?.active));
      setNotice(
        data.raw?.active
          ? "已儲存並上架，/courses 最上方會顯示這個課程（最多 30 秒生效）。"
          : "已儲存並下架，/courses 不再顯示主打課程推廣區。"
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section className="admin-card"><p className="lead">讀取中⋯</p></section>;

  return (
    <section className="admin-card">
      <div className="admin-section-title">
        <h2>主打課程推廣區</h2>
        <span className={`admin-pill ${active ? "confirmed" : "pending"}`}>{active ? "已上架" : "未上架"}</span>
      </div>
      <p className="lead">
        這是 <code>/courses</code> 最上方那張大卡（目前是「掌中訣」）。只會有一個主打課程；
        要換課程就直接改這裡的欄位，換完按「儲存並上架」。
      </p>

      {setupHint && <p className="admin-inline-message" role="status">⚠️ {setupHint}</p>}
      {notice && <p className="admin-inline-message" role="status">{notice}</p>}

      <div className="admin-form-grid">
        <label>
          上架起日（選填）
          <input type="date" value={form.publish_start || ""} onChange={(event) => setForm({ ...form, publish_start: event.target.value })} />
          <small>留空＝立即生效</small>
        </label>
        <label>
          下架迄日（選填）
          <input type="date" value={form.publish_end || ""} onChange={(event) => setForm({ ...form, publish_end: event.target.value })} />
          <small>留空＝不自動下架</small>
        </label>

        {TEXT_FIELDS.map((field) => (
          <label key={field.key} className={field.kind ? "admin-form-wide" : ""}>
            {field.label}
            {field.kind === "textarea" ? (
              <textarea
                rows={field.key === "body" ? 6 : 4}
                value={form[field.key] || ""}
                placeholder={field.placeholder}
                onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
              />
            ) : field.kind === "image" ? (
              <ImageField
                value={form[field.key] || ""}
                folder="course-promo"
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
        <button className="admin-action-btn" disabled={busy} onClick={() => save(true)}>儲存並上架</button>
        <button className="admin-action-btn ghost" disabled={busy} onClick={() => save(false)}>儲存並下架</button>
        <button className="admin-action-btn ghost" disabled={busy} onClick={() => void load()}>放棄變更、重新讀取</button>
      </div>
    </section>
  );
}
