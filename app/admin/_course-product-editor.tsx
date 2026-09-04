"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "./_shell";

type Form = {
  title: string; subtitle: string; description: string; course_date: string;
  start_time: string; end_time: string; location: string; price_new: string; price_returning: string;
};

const EMPTY: Form = { title: "", subtitle: "", description: "", course_date: "", start_time: "", end_time: "", location: "", price_new: "", price_returning: "" };

function timeInTaipei(value: unknown) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(String(value)));
}

export function CourseProductEditor({ embedded = false }: { embedded?: boolean } = {}) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminFetch("/api/admin/course-product");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "讀取報名課程失敗");
      const course = data.course || {};
      setForm({
        title: String(course.title || ""), subtitle: String(course.subtitle || ""), description: String(course.description || ""),
        course_date: String(course.course_date || ""), start_time: timeInTaipei(course.starts_at), end_time: timeInTaipei(course.ends_at),
        location: String(course.location || ""), price_new: String(course.price_new ?? ""), price_returning: String(course.price_returning ?? "")
      });
    } catch (error) { setNotice(error instanceof Error ? error.message : "讀取失敗"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy(true); setNotice("");
    try {
      const response = await adminFetch("/api/admin/course-product", { method: "PATCH", body: JSON.stringify(form) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "儲存失敗");
      setNotice("已儲存報名課程設定，前台重新整理後即會顯示新日期。");
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "儲存失敗"); }
    finally { setBusy(false); }
  }

  if (loading) return <section className="admin-card"><p className="lead">讀取報名課程中⋯</p></section>;
  const field = (key: keyof Form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <section className={embedded ? "admin-course-product-editor" : "admin-card admin-course-product-editor"}>
      {!embedded && <div className="admin-section-title"><h2>報名課程設定</h2></div>}
      {!embedded && <p className="lead">這裡會同步控制 <code>/courses</code> 報名區的課程日期、時間、地點與結帳金額。</p>}
      {notice && <p className="admin-inline-message" role="status">{notice}</p>}
      <div className="admin-form-grid">
        <label>課程名稱<input required value={form.title} onChange={(e) => field("title", e.target.value)} /></label>
        <label>期別<input value={form.subtitle} onChange={(e) => field("subtitle", e.target.value)} /></label>
        <label>上課日期<input required type="date" value={form.course_date} onChange={(e) => field("course_date", e.target.value)} /></label>
        <label>開始時間<input required type="time" value={form.start_time} onChange={(e) => field("start_time", e.target.value)} /></label>
        <label>結束時間<input required type="time" value={form.end_time} onChange={(e) => field("end_time", e.target.value)} /></label>
        <label>上課地點<input value={form.location} onChange={(e) => field("location", e.target.value)} /></label>
        <label>新生報名費<input required type="number" min="0" step="1" value={form.price_new} onChange={(e) => field("price_new", e.target.value)} /></label>
        <label>複訓學員費用<input required type="number" min="0" step="1" value={form.price_returning} onChange={(e) => field("price_returning", e.target.value)} /></label>
        <label className="admin-form-wide">課程說明<textarea rows={3} value={form.description} onChange={(e) => field("description", e.target.value)} /></label>
      </div>
      <div className="admin-btn-row">
        <button className="admin-action-btn" disabled={busy || !form.title || !form.course_date || !form.start_time || !form.end_time} onClick={save}>{busy ? "儲存中⋯" : "儲存報名課程"}</button>
        <button className="admin-action-btn ghost" disabled={busy} onClick={() => void load()}>放棄變更、重新讀取</button>
      </div>
    </section>
  );
}
