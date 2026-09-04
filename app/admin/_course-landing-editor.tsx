"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "./_shell";
import { MediaField, mediaSrc } from "./_content-editor";
import { CourseProductEditor } from "./_course-product-editor";

/**
 * 課程上架：一門課的完整 Landing Page 編輯器。
 * 七個步驟對應前台區段；空白的區段前台整區隱藏，所以老師可以先填最少的內容就上架。
 */
type Row = Record<string, unknown>;
type ListRow = Record<string, string>;
type Step = "product" | "hero" | "content" | "instructor" | "faq" | "media" | "publish";

const STEPS: { key: Step; label: string; short: string; description: string }[] = [
  { key: "product", label: "報名商品", short: "STEP 1", description: "課程名稱、期別、日期時間、地點與費用。這些資料同時決定結帳金額。" },
  { key: "hero", label: "主視覺文案", short: "STEP 2", description: "訪客第一眼看到的標題、副標與三個重點標籤。" },
  { key: "content", label: "課程內容", short: "STEP 3", description: "痛點共鳴、學完你能、課程大綱。" },
  { key: "instructor", label: "講師與信任", short: "STEP 4", description: "講師簡介、經歷與學員見證。" },
  { key: "faq", label: "FAQ 與注意事項", short: "STEP 5", description: "常見問題、報名注意事項與課程補充。" },
  { key: "media", label: "海報與影片", short: "STEP 6", description: "海報輪播、宣傳影片與影片預覽圖。" },
  { key: "publish", label: "上架排程", short: "STEP 7", description: "決定何時公開、何時自動下架。" }
];

const TEXT_KEYS = [
  "label", "title", "title_suffix", "headline", "subheadline", "hero_stats", "cta_text", "sticky_cta_hint", "limited_text", "line_cta_text", "register_url",
  "pain_title", "pain_points", "body", "outcome_title", "outcomes", "curriculum_title",
  "instructor_name", "instructor_title", "instructor_image", "instructor_bio", "instructor_credentials",
  "info_note", "guarantee_text",
  "poster_main", "poster_second", "poster_third", "video_cover", "video_one", "video_one_title", "video_two", "video_two_title",
  "publish_start", "publish_end", "highlights", "notice", "seats_text"
] as const;
type TextKey = (typeof TEXT_KEYS)[number];

const LIST_SPECS = {
  curriculum: { label: "課程大綱", fields: [{ key: "title", label: "單元標題", placeholder: "干支解析基礎" }, { key: "duration", label: "時長／時段", placeholder: "2 小時 或 10:00–12:00" }, { key: "description", label: "一句說明", placeholder: "天干地支排列口訣與掌訣記憶法", wide: true }] },
  faqs: { label: "常見問題", fields: [{ key: "q", label: "問題", placeholder: "我完全沒有基礎，能聽得懂嗎？", wide: true }, { key: "a", label: "回答", placeholder: "課程專為零基礎設計⋯", wide: true, textarea: true }] },
  testimonials: { label: "學員見證", fields: [{ key: "name", label: "學員稱呼", placeholder: "王先生" }, { key: "role", label: "身份（選填）", placeholder: "餐飲業老闆" }, { key: "quote", label: "見證內容", placeholder: "只寫學員本人同意公開的內容", wide: true, textarea: true }] }
} as const;
type ListKey = keyof typeof LIST_SPECS;

const lineCount = (value: string) => String(value || "").split(/\r?\n/).filter((s) => s.trim()).length;

function ListEditor({ listKey, rows, onChange }: { listKey: ListKey; rows: ListRow[]; onChange: (rows: ListRow[]) => void }) {
  const spec = LIST_SPECS[listKey];
  const update = (index: number, key: string, value: string) => onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  const move = (index: number, delta: number) => {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const blank = () => Object.fromEntries(spec.fields.map((f) => [f.key, ""]));
  return (
    <div className="admin-list-editor">
      {rows.length === 0 && <p className="admin-list-empty">還沒有任何項目。留空的話前台不會顯示這一區。</p>}
      {rows.map((row, index) => (
        <div className="admin-list-row" key={index}>
          <div className="admin-list-row-head">
            <span>{index + 1}</span>
            <div className="admin-btn-row">
              <button type="button" className="admin-action-btn ghost small" disabled={index === 0} onClick={() => move(index, -1)}>上移</button>
              <button type="button" className="admin-action-btn ghost small" disabled={index === rows.length - 1} onClick={() => move(index, 1)}>下移</button>
              <button type="button" className="admin-action-btn ghost small danger" onClick={() => onChange(rows.filter((_, i) => i !== index))}>刪除</button>
            </div>
          </div>
          <div className="admin-form-grid">
            {spec.fields.map((f) => (
              <label key={f.key} className={"wide" in f && f.wide ? "admin-form-wide" : ""}>
                {f.label}
                {"textarea" in f && f.textarea ? (
                  <textarea rows={3} value={row[f.key] || ""} placeholder={f.placeholder} onChange={(e) => update(index, f.key, e.target.value)} />
                ) : (
                  <input value={row[f.key] || ""} placeholder={f.placeholder} onChange={(e) => update(index, f.key, e.target.value)} />
                )}
              </label>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="admin-action-btn ghost" disabled={rows.length >= 12} onClick={() => onChange([...rows, blank()])}>＋ 新增{spec.label}</button>
    </div>
  );
}

export function CourseLandingEditor() {
  const [step, setStep] = useState<Step>("product");
  const [form, setForm] = useState<Record<TextKey, string>>(() => Object.fromEntries(TEXT_KEYS.map((k) => [k, ""])) as Record<TextKey, string>);
  const [lists, setLists] = useState<Record<ListKey, ListRow[]>>({ curriculum: [], faqs: [], testimonials: [] });
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [setupHint, setSetupHint] = useState("");
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminFetch("/api/admin/site-content?type=promo");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "讀取失敗");
      setSetupHint(data.setup_required || "");
      const raw = (data.raw || {}) as Row;
      setActive(Boolean(raw.active));
      const next = {} as Record<TextKey, string>;
      for (const key of TEXT_KEYS) next[key] = raw[key] == null ? "" : String(raw[key]);
      setForm(next);
      setLists({
        curriculum: Array.isArray(raw.curriculum) ? (raw.curriculum as ListRow[]) : [],
        faqs: Array.isArray(raw.faqs) ? (raw.faqs as ListRow[]) : [],
        testimonials: Array.isArray(raw.testimonials) ? (raw.testimonials as ListRow[]) : []
      });
      setDirty(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "讀取失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const set = (key: TextKey, value: string) => { setForm((c) => ({ ...c, [key]: value })); setDirty(true); };
  const setList = (key: ListKey, rows: ListRow[]) => { setLists((c) => ({ ...c, [key]: rows })); setDirty(true); };

  async function save(nextActive = active) {
    setBusy(true);
    setNotice("");
    try {
      const response = await adminFetch("/api/admin/site-content", {
        method: "PATCH",
        body: JSON.stringify({ type: "promo", ...form, ...lists, active: nextActive })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "儲存失敗");
      setActive(Boolean(data.raw?.active));
      setDirty(false);
      setNotice(data.raw?.active ? "已儲存並上架，前台 /courses 最多 30 秒後更新。" : "已儲存並下架，/courses 不再顯示這門課的 Landing Page（報名表仍在）。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  // 右側「前台會顯示哪些區段」檢查表：讓老師知道哪一區還是空的。
  const checklist = useMemo(() => [
    { label: "主視覺", ok: Boolean(form.title && form.headline) },
    { label: "海報", ok: Boolean(form.poster_main) },
    { label: "痛點共鳴", ok: lineCount(form.pain_points) > 0 },
    { label: "學完你能", ok: lineCount(form.outcomes) > 0 },
    { label: "課程大綱", ok: lists.curriculum.length > 0 },
    { label: "宣傳影片", ok: Boolean(form.video_one || form.video_two) },
    { label: "講師介紹", ok: Boolean(form.instructor_name && form.instructor_bio) },
    { label: "學員見證", ok: lists.testimonials.length > 0 },
    { label: "常見問題", ok: lists.faqs.length > 0 }
  ], [form, lists]);

  if (loading) return <section className="admin-card"><p className="lead">讀取課程上架資料中⋯</p></section>;

  const text = (key: TextKey, label: string, opts: { placeholder?: string; hint?: string; wide?: boolean; rows?: number; textarea?: boolean } = {}) => (
    <label key={key} className={opts.wide || opts.textarea ? "admin-form-wide" : ""}>
      {label}
      {opts.textarea ? (
        <textarea rows={opts.rows || 4} value={form[key]} placeholder={opts.placeholder} onChange={(e) => set(key, e.target.value)} />
      ) : (
        <input value={form[key]} placeholder={opts.placeholder} onChange={(e) => set(key, e.target.value)} />
      )}
      {opts.hint && <small>{opts.hint}</small>}
    </label>
  );
  const media = (key: TextKey, label: string, kind: "image" | "video", hint?: string) => (
    <label key={key} className="admin-form-wide">
      {label}
      <MediaField value={form[key]} folder="course-promo" kind={kind} onChange={(v) => set(key, v)} onError={setNotice} />
      {hint && <small>{hint}</small>}
    </label>
  );

  const current = STEPS.find((s) => s.key === step)!;

  return (
    <section className="admin-promo-editor admin-launch">
      <div className="admin-promo-overview">
        <div>
          <div className="admin-eyebrow">COURSE LAUNCH</div>
          <h2>課程上架</h2>
          <p>一門課的完整招生頁：報名商品、主視覺、內容、講師、FAQ、媒體、排程，改完按儲存即生效。</p>
        </div>
        <div className="admin-promo-status">
          <span className={`admin-pill ${active ? "confirmed" : "pending"}`}>{active ? "正在上架" : "目前下架"}</span>
          <strong>{form.title || "尚未填寫課程名稱"}{form.title_suffix ? ` ${form.title_suffix}` : ""}</strong>
          <small>{form.publish_start || "立即"} 至 {form.publish_end || "無期限"}{dirty ? "｜有未儲存的變更" : ""}</small>
          <a className="admin-action-btn ghost small" href="/courses" target="_blank" rel="noreferrer">預覽前台 ↗</a>
        </div>
      </div>

      {setupHint && <p className="admin-inline-message" role="status">⚠️ {setupHint}</p>}
      {notice && <p className="admin-inline-message" role="status">{notice}</p>}

      <nav className="admin-launch-steps" aria-label="上架步驟">
        {STEPS.map((s) => (
          <button key={s.key} type="button" className={`admin-launch-step ${step === s.key ? "active" : ""}`} onClick={() => setStep(s.key)}>
            <span>{s.short}</span><strong>{s.label}</strong>
          </button>
        ))}
      </nav>

      <div className="admin-promo-layout">
        <div className="admin-promo-fields">
          <section className="admin-promo-panel">
            <div className="admin-promo-panel-head"><span>{current.short}</span><div><h3>{current.label}</h3><p>{current.description}</p></div></div>

            {step === "product" && <CourseProductEditor embedded />}

            {step === "hero" && (
              <div className="admin-form-grid">
                {text("label", "小標籤", { placeholder: "NEW COURSE｜掌訣班招生" })}
                {text("title", "課程名稱（大標）", { placeholder: "掌中訣" })}
                {text("title_suffix", "名稱後綴", { placeholder: "開班授課" })}
                {text("cta_text", "報名按鈕文字", { placeholder: "立即報名" })}
                {text("headline", "主標題", { placeholder: "別讓命運成為盲盒⋯", wide: true })}
                {text("subheadline", "副標題", { placeholder: "解開命運密碼・掌握人生方向", wide: true })}
                {text("hero_stats", "重點標籤（一行一個，建議 3 個）", { textarea: true, rows: 3, placeholder: "一日密集班\n零基礎可上\n現場實作" })}
                {text("limited_text", "限額提醒", { placeholder: "招生名額有限，立即卡位" })}
                {text("sticky_cta_hint", "固定報名列補充（選填）", { placeholder: "綠界付款後即保留名額" })}
                {text("line_cta_text", "LINE 按鈕文字", { placeholder: "LINE 詢問課程" })}
              </div>
            )}

            {step === "content" && (
              <div className="admin-form-grid">
                {text("pain_title", "痛點區標題", { placeholder: "這些困擾，你也遇過嗎？", wide: true })}
                {text("pain_points", "痛點共鳴（一行一項，格式「標題｜說明」）", { textarea: true, rows: 5, placeholder: "記不住干支五行｜看了很多命理書，一離開書本就忘光", hint: "沒有「｜」也可以，整行會當成說明。" })}
                {text("body", "課程介紹段落（選填，空一行分段）", { textarea: true, rows: 5, hint: "顯示在痛點卡片下方，適合放老師想說的話。" })}
                {text("outcome_title", "學完你能：標題", { placeholder: "一天學會，帶走一輩子的工具", wide: true })}
                {text("outcomes", "學完你能（一行一項，可用「標題｜說明」）", { textarea: true, rows: 6, placeholder: "掌握干支排列口訣，隨時可在掌中推算" })}
                {text("curriculum_title", "課程大綱標題", { placeholder: "一日 7 小時，這樣安排", wide: true })}
                <div className="admin-form-wide">
                  <div className="admin-subhead">課程大綱單元</div>
                  <ListEditor listKey="curriculum" rows={lists.curriculum} onChange={(rows) => setList("curriculum", rows)} />
                </div>
              </div>
            )}

            {step === "instructor" && (
              <div className="admin-form-grid">
                {text("instructor_name", "講師姓名", { placeholder: "風羿老師" })}
                {text("instructor_title", "一句定位", { placeholder: "巽風堪輿研究中心創辦人" })}
                {media("instructor_image", "講師照片", "image", "正方形最好看；留空會用關於頁的老師照片。")}
                {text("instructor_bio", "講師簡介（一行一段）", { textarea: true, rows: 5 })}
                {text("instructor_credentials", "經歷與受邀紀錄（一行一項）", { textarea: true, rows: 4, hint: "只寫可查證的事實。" })}
                <div className="admin-form-wide">
                  <div className="admin-subhead">學員見證（選填）</div>
                  <ListEditor listKey="testimonials" rows={lists.testimonials} onChange={(rows) => setList("testimonials", rows)} />
                </div>
              </div>
            )}

            {step === "faq" && (
              <div className="admin-form-grid">
                <div className="admin-form-wide">
                  <div className="admin-subhead">常見問題</div>
                  <ListEditor listKey="faqs" rows={lists.faqs} onChange={(rows) => setList("faqs", rows)} />
                </div>
                {text("guarantee_text", "報名注意事項（一行一條，顯示在報名表上方）", { textarea: true, rows: 4 })}
                {text("info_note", "課程資訊補充（一句）", { placeholder: "建議攜帶筆記本與筆；現場提供茶水。", wide: true })}
              </div>
            )}

            {step === "media" && (
              <div className="admin-form-grid">
                {media("poster_main", "海報 1（Hero 主圖、輪播第一張）", "image", "直式 3:4 最合適，JPG / PNG / WebP，最大 10MB。")}
                {media("poster_second", "海報 2", "image")}
                {media("poster_third", "海報 3", "image")}
                {media("video_one", "宣傳影片 1", "video", "可上傳 MP4（最大 200MB）或貼 YouTube / Vimeo 網址。")}
                {text("video_one_title", "宣傳影片 1 標題", { placeholder: "課程介紹" })}
                {media("video_two", "宣傳影片 2", "video")}
                {text("video_two_title", "宣傳影片 2 標題")}
                {media("video_cover", "影片預覽圖（只在有宣傳影片時顯示）", "image", "這不是海報。它只會當作影片播放前的靜態畫面。")}
              </div>
            )}

            {step === "publish" && (
              <div className="admin-form-grid">
                <label>上架起日（選填）<input type="date" value={form.publish_start} onChange={(e) => set("publish_start", e.target.value)} /><small>留空＝立即生效</small></label>
                <label>下架迄日（選填）<input type="date" value={form.publish_end} onChange={(e) => set("publish_end", e.target.value)} /><small>留空＝不自動下架；建議填開課當天</small></label>
                <div className="admin-form-wide admin-launch-publish-note">
                  <p>目前狀態：<strong>{active ? "正在上架" : "下架中"}</strong>。下架後 /courses 只剩報名表與其他課程講座。</p>
                  <p>儲存按鈕在頁面底部，任何步驟都可以按。</p>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="admin-promo-preview admin-launch-aside">
          <div className="admin-eyebrow">前台區段檢查</div>
          {form.poster_main ? <img src={mediaSrc(form.poster_main)} alt="海報預覽" /> : <div className="admin-promo-preview-empty">尚未設定海報 1</div>}
          <ul className="admin-launch-checklist">
            {checklist.map((item) => (
              <li key={item.label} className={item.ok ? "ok" : ""}><span>{item.ok ? "●" : "○"}</span>{item.label}<small>{item.ok ? "會顯示" : "空白，隱藏"}</small></li>
            ))}
          </ul>
          <small>報名表與課程資訊固定顯示，資料來自「報名商品」。</small>
        </aside>
      </div>

      <div className="admin-promo-actions">
        <div><strong>{dirty ? "有尚未儲存的變更" : "儲存後最多 30 秒生效"}</strong><small>可以先儲存並下架，用「預覽前台」確認後再上架。</small></div>
        <button className="admin-action-btn" disabled={busy} onClick={() => save(true)}>{busy ? "儲存中⋯" : "儲存並上架"}</button>
        <button className="admin-action-btn ghost" disabled={busy} onClick={() => save(false)}>儲存並下架</button>
        <button className="admin-action-btn ghost" disabled={busy} onClick={() => void load()}>放棄變更、重新讀取</button>
      </div>
    </section>
  );
}
