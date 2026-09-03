"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "./_shell";
import { ImageField, mediaSrc } from "./_content-editor";

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

const GROUPS = [
  { title: "課程主訊息", step: "STEP 2", description: "設定訪客第一眼看到的課程名稱與招生訴求。", keys: ["label", "title", "title_suffix", "headline", "subheadline"] },
  { title: "課程內容與行動按鈕", step: "STEP 3", description: "說清楚課程價值，再引導訪客報名或透過 LINE 詢問。", keys: ["body", "highlights", "limited_text", "cta_text", "register_url", "line_cta_text"] },
  { title: "海報與影片", step: "STEP 4", description: "上傳課程視覺與宣傳影片；海報會在前台自動輪播。", keys: ["poster_main", "poster_second", "poster_third", "video_cover", "video_one", "video_one_title", "video_two", "video_two_title"] }
] as const;

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

  function renderField(key: string) {
    const field = TEXT_FIELDS.find((item) => item.key === key);
    if (!field) return null;
    return (
      <label key={field.key} className={field.kind ? "admin-form-wide" : ""}>
        {field.label}
        {field.kind === "textarea" ? (
          <textarea rows={field.key === "body" ? 6 : 4} value={form[field.key] || ""} placeholder={field.placeholder}
            onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} />
        ) : field.kind === "image" ? (
          <ImageField value={form[field.key] || ""} folder="course-promo"
            onChange={(value) => setForm({ ...form, [field.key]: value })} onError={setNotice} />
        ) : (
          <input value={form[field.key] || ""} placeholder={field.placeholder}
            onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} />
        )}
        {field.hint && <small>{field.hint}</small>}
      </label>
    );
  }

  return (
    <section className="admin-promo-editor">
      <div className="admin-promo-overview">
        <div>
          <div className="admin-eyebrow">COURSE CAMPAIGN</div>
          <h2>主打課程推廣</h2>
          <p>管理課程頁最上方的招生主視覺、文案、媒體與上架排程。</p>
        </div>
        <div className="admin-promo-status">
          <span className={`admin-pill ${active ? "confirmed" : "pending"}`}>{active ? "正在上架" : "目前下架"}</span>
          <strong>{form.title || "尚未填寫課程名稱"}</strong>
          <small>{form.publish_start || "立即"} 至 {form.publish_end || "無期限"}</small>
        </div>
      </div>

      {setupHint && <p className="admin-inline-message" role="status">⚠️ {setupHint}</p>}
      {notice && <p className="admin-inline-message" role="status">{notice}</p>}

      <div className="admin-promo-layout">
        <div className="admin-promo-fields">
          <section className="admin-promo-panel">
            <div className="admin-promo-panel-head"><span>STEP 1</span><div><h3>上架排程</h3><p>決定主打課程何時出現與自動下架。</p></div></div>
            <div className="admin-form-grid">
              <label>上架起日（選填）<input type="date" value={form.publish_start || ""} onChange={(event) => setForm({ ...form, publish_start: event.target.value })} /><small>留空＝立即生效</small></label>
              <label>下架迄日（選填）<input type="date" value={form.publish_end || ""} onChange={(event) => setForm({ ...form, publish_end: event.target.value })} /><small>留空＝不自動下架</small></label>
            </div>
          </section>
          {GROUPS.map((group) => (
            <section className="admin-promo-panel" key={group.title}>
              <div className="admin-promo-panel-head"><span>{group.step}</span><div><h3>{group.title}</h3><p>{group.description}</p></div></div>
              <div className="admin-form-grid">{group.keys.map(renderField)}</div>
            </section>
          ))}
        </div>
        <aside className="admin-promo-preview">
          <div className="admin-eyebrow">即時摘要</div>
          {form.poster_main ? <img src={mediaSrc(form.poster_main)} alt="課程海報預覽" /> : <div className="admin-promo-preview-empty">尚未設定主海報</div>}
          <span className="admin-promo-preview-label">{form.label || "COURSE"}</span>
          <h3>{form.title || "課程名稱"}<small>{form.title_suffix}</small></h3>
          <h4>{form.headline || "這裡會顯示主標題"}</h4>
          <p>{form.subheadline || "填寫副標題，讓訪客快速理解課程價值。"}</p>
          <button type="button" disabled>{form.cta_text || "立即報名"}</button>
          <small>這是內容摘要，實際前台排版仍以課程頁為準。</small>
        </aside>
      </div>

      <div className="admin-promo-actions">
        <div><strong>儲存後最多 30 秒生效</strong><small>可以先儲存並下架，確認完內容再公開。</small></div>
        <button className="admin-action-btn" disabled={busy} onClick={() => save(true)}>{busy ? "儲存中⋯" : "儲存並上架"}</button>
        <button className="admin-action-btn ghost" disabled={busy} onClick={() => save(false)}>儲存並下架</button>
        <button className="admin-action-btn ghost" disabled={busy} onClick={() => void load()}>放棄變更、重新讀取</button>
      </div>
    </section>
  );
}
