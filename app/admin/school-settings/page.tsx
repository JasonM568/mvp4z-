"use client";

// 後台｜排盤流派設定
//
// 流派決定干支怎麼算。這些是專業判斷不是工程判斷，所以搬到後台讓風羿老師自己定。
//
// 設定與試算放同一頁是刻意的：這些選項單看文字沒有回饋，老師無從判斷。
// 改一個選項就立刻用同一組生辰重排，把「目前生效」與「修改後」並列給他看差異。

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../_shell";
import { TAIWAN_PLACES } from "@/lib/yixue/geo/places";
import type { YixueChart } from "@/lib/yixue/types";

type SchoolConfig = {
  id: string;
  label: string;
  decidedAt: string;
  decidedBy: string;
  calendar: {
    timezone: "Asia/Taipei";
    trueSolarTime: "off" | "longitude" | "longitude+eot";
    defaultLongitude: number;
    lateZiDayPillar: "next" | "same";
    earlyLateZiHourPillar: "split" | "merge";
    termTieBreak: "instant" | "day";
  };
};

type FieldGuide = {
  path: string;
  title: string;
  why: string;
  options: ReadonlyArray<{ value: string; label: string; hint: string }>;
};

type ApiState = {
  draft: { id: string; version_label: string; settings: SchoolConfig; note: string; decided_by: string } | null;
  published: { id: string; version_label: string; settings: SchoolConfig; published_at: string } | null;
  defaults: SchoolConfig;
  field_guide: FieldGuide[];
  cache_seconds: number;
  setup_required?: string;
};

type PreviewResult = { label: string; chart: YixueChart | null; error: string | null };

const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

export default function SchoolSettingsPage() {
  const [state, setState] = useState<ApiState | null>(null);
  const [settings, setSettings] = useState<SchoolConfig | null>(null);
  const [versionLabel, setVersionLabel] = useState("");
  const [decidedBy, setDecidedBy] = useState("風羿老師");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // 試算用的生辰。預設挑一個會踩到晚子時分歧的時刻，老師一進來就看得到差別。
  const [birth, setBirth] = useState({
    calendar: "國曆" as "國曆" | "農曆",
    isLeapMonth: false,
    year: 2024,
    month: 1,
    day: 1,
    hourBranch: "子" as string | null,
    hour: 23 as number | null,
    minute: 30 as number | null,
    placeLabel: "臺北市" as string | null
  });
  const [preview, setPreview] = useState<PreviewResult[]>([]);
  const [previewing, setPreviewing] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/school-settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "讀取失敗");
      setState(data);
      const base = data.draft?.settings || data.published?.settings || data.defaults;
      setSettings(structuredClone(base));
      setVersionLabel(data.draft?.version_label || nextVersion(data.published?.version_label));
      setDecidedBy(data.draft?.decided_by || "風羿老師");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "讀取失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, [reload]);

  const runPreview = useCallback(async () => {
    if (!settings || !state) return;
    setPreviewing(true);
    try {
      // 同時算兩組：目前生效的（或系統預設）與畫面上修改中的，直接並列比對。
      const current = state.published?.settings || state.defaults;
      const schools = [{ ...current, label: `目前生效：${current.label}` }, { ...settings, label: `修改後：${settings.label}` }];
      const res = await adminFetch("/api/admin/school-settings/preview", {
        method: "POST",
        body: JSON.stringify({ birth, schools })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "試算失敗");
      setPreview(data.results);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "試算失敗");
    } finally {
      setPreviewing(false);
    }
  }, [settings, state, birth]);

  // 設定或生辰一改就重算，讓老師的每一次調整都立刻有回饋
  useEffect(() => {
    if (!settings || !state) return;
    const t = setTimeout(() => void runPreview(), 250);
    return () => clearTimeout(t);
  }, [settings, birth, state, runPreview]);

  function setCalendarField(path: string, value: string) {
    setSettings((prev) => (prev ? { ...prev, calendar: { ...prev.calendar, [path]: value } } : prev));
    setMessage("");
  }

  async function saveDraft() {
    if (!settings) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await adminFetch("/api/admin/school-settings", {
        method: "POST",
        body: JSON.stringify({ settings, version_label: versionLabel, decided_by: decidedBy })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "儲存失敗");
      setMessage("草稿已儲存。目前的報告仍用已發布的流派，要按「發布」才生效。");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!window.confirm("發布後，之後每一份報告的干支都會依這組算法排。舊報告不受影響。確定發布？")) return;
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/school-settings/publish", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "發布失敗");
      setMessage(`已發布。最多 ${data.effective_in_seconds} 秒後全面生效。`);
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "發布失敗");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="admin-empty">讀取中⋯</p>;
  if (!state || !settings) return <p className="admin-empty">{message || "讀取失敗"}</p>;

  return (
    <>
      <h1>排盤流派設定</h1>
      <p className="lead">
        同一個生辰，用不同流派會排出不同的盤，沒有對錯，但系統只能選一種。
        每改一個選項，右邊會立刻用下方的生辰重排給你看差別。
      </p>

      {state.setup_required && (
        <div className="kpi-card" style={{ borderColor: "#ffd166", marginBottom: 16 }}>
          <strong style={{ color: "#ffd166" }}>尚未完成資料庫設定</strong>
          <p className="muted" style={{ margin: "8px 0 0", lineHeight: 1.8 }}>{state.setup_required}</p>
        </div>
      )}

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="kpi-card">
          <div className="label">目前生效流派</div>
          <div className="value" style={{ fontSize: 18 }}>{state.published?.settings.label || "系統預設（暫定）"}</div>
          <div className="hint">
            {state.published?.published_at
              ? `發布於 ${new Date(state.published.published_at).toLocaleString("zh-TW")}`
              : "尚未發布過，報告使用程式內建的暫定值"}
          </div>
        </div>
        <div className="kpi-card">
          <div className="label">草稿</div>
          <div className="value" style={{ fontSize: 18 }}>{state.draft?.version_label || "無"}</div>
          <div className="hint">{state.draft ? "已儲存，尚未發布" : "尚未建立草稿"}</div>
        </div>
      </div>

      <div className="admin-form-grid" style={{ marginBottom: 18 }}>
        <label>
          流派名稱
          <input value={settings.label} onChange={(e) => setSettings({ ...settings, label: e.target.value })} />
        </label>
        <label>
          版本名稱
          <input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} />
        </label>
        <label>
          拍板人
          <input value={decidedBy} onChange={(e) => setDecidedBy(e.target.value)} />
        </label>
      </div>

      {message && (
        <div className="admin-inline-message" style={{ whiteSpace: "pre-wrap", marginBottom: 16 }}>{message}</div>
      )}

      <div className="admin-detail">
        <div>
          {state.field_guide.map((field) => {
            const current = (settings.calendar as unknown as Record<string, string>)[field.path];
            return (
              <div className="kpi-card" key={field.path} style={{ marginBottom: 18 }}>
                <div className="admin-section-title" style={{ marginTop: 0 }}>{field.title}</div>
                <p className="muted" style={{ marginTop: -6, marginBottom: 14, fontSize: 13, lineHeight: 1.8 }}>
                  {field.why}
                </p>
                <div style={{ display: "grid", gap: 10 }}>
                  {field.options.map((opt) => (
                    <label
                      key={opt.value}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        padding: "10px 12px",
                        borderRadius: 10,
                        cursor: "pointer",
                        background: current === opt.value ? "rgba(110,240,180,0.08)" : "rgba(0,0,0,0.2)",
                        border: `1px solid ${current === opt.value ? "var(--green)" : "rgba(255,255,255,0.08)"}`
                      }}
                    >
                      <input
                        type="radio"
                        name={field.path}
                        checked={current === opt.value}
                        onChange={() => setCalendarField(field.path, opt.value)}
                        style={{ marginTop: 4 }}
                      />
                      <span>
                        <strong style={{ fontSize: 14 }}>{opt.label}</strong>
                        <span className="muted" style={{ display: "block", fontSize: 12.5, lineHeight: 1.7 }}>
                          {opt.hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <aside>
          <div className="kpi-card" style={{ marginBottom: 16 }}>
            <div className="admin-section-title" style={{ marginTop: 0 }}>試算生辰</div>
            <div className="admin-form-grid">
              <label>
                曆法
                <select value={birth.calendar} onChange={(e) => setBirth({ ...birth, calendar: e.target.value as "國曆" | "農曆" })}>
                  <option>國曆</option>
                  <option>農曆</option>
                </select>
              </label>
              <label>年<input type="number" value={birth.year} onChange={(e) => setBirth({ ...birth, year: Number(e.target.value || 2024) })} /></label>
              <label>月<input type="number" min={1} max={12} value={birth.month} onChange={(e) => setBirth({ ...birth, month: Number(e.target.value || 1) })} /></label>
              <label>日<input type="number" min={1} max={31} value={birth.day} onChange={(e) => setBirth({ ...birth, day: Number(e.target.value || 1) })} /></label>
              <label>
                時辰
                <select value={birth.hourBranch ?? ""} onChange={(e) => setBirth({ ...birth, hourBranch: e.target.value || null })}>
                  <option value="">不確定</option>
                  {BRANCHES.map((b) => <option key={b}>{b}</option>)}
                </select>
              </label>
              <label>時<input type="number" min={0} max={23} value={birth.hour ?? ""} onChange={(e) => setBirth({ ...birth, hour: e.target.value === "" ? null : Number(e.target.value) })} /></label>
              <label>分<input type="number" min={0} max={59} value={birth.minute ?? ""} onChange={(e) => setBirth({ ...birth, minute: e.target.value === "" ? null : Number(e.target.value) })} /></label>
              <label>
                出生地
                <select value={birth.placeLabel ?? ""} onChange={(e) => setBirth({ ...birth, placeLabel: e.target.value || null })}>
                  <option value="">不指定</option>
                  {TAIWAN_PLACES.map((p) => <option key={p.label}>{p.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="kpi-card">
            <div className="admin-section-title" style={{ marginTop: 0 }}>
              排盤結果{previewing ? "（計算中⋯）" : ""}
            </div>
            {preview.length === 0 && <p className="admin-empty">尚未試算</p>}
            {preview.map((r, i) => (
              <div key={i} style={{ marginBottom: 16, paddingBottom: 12, borderBottom: i === 0 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                <strong style={{ fontSize: 13 }}>{r.label}</strong>
                {r.error && <p style={{ color: "#ff8d7a", fontSize: 13 }}>{r.error}</p>}
                {r.chart && <ChartView chart={r.chart} />}
              </div>
            ))}
            {preview.length === 2 && preview[0].chart && preview[1].chart && (
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 4 }}>
                {samePillars(preview[0].chart, preview[1].chart)
                  ? "這組生辰在兩種設定下排出的四柱相同——換一個接近時辰交界或 23 點後的時間才看得出差異。"
                  : "兩種設定排出的四柱不同，差異已如上。"}
              </p>
            )}
          </div>
        </aside>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
        <button type="button" className="admin-action-btn" onClick={saveDraft} disabled={saving}>
          {saving ? "處理中⋯" : "儲存草稿"}
        </button>
        <button type="button" className="admin-action-btn ghost" onClick={publish} disabled={saving || !state.draft}>
          發布草稿
        </button>
        <button
          type="button"
          className="admin-action-btn ghost"
          onClick={() => { setSettings(structuredClone(state.defaults)); setMessage("已載入系統預設值，確認後請按「儲存草稿」。"); }}
          disabled={saving}
        >
          還原成系統預設
        </button>
      </div>
    </>
  );
}

function ChartView({ chart }: { chart: YixueChart }) {
  const p = chart.bazi?.pillars;
  return (
    <div style={{ fontSize: 13, lineHeight: 1.9, marginTop: 6 }}>
      {p && (
        <div style={{ fontSize: 20, letterSpacing: 2, margin: "6px 0" }}>
          {p.year.ganzhi.label}　{p.month.ganzhi.label}　{p.day.ganzhi.label}　{p.hour ? p.hour.ganzhi.label : "—"}
        </div>
      )}
      {!p?.hour && <div className="muted">時辰不確定，不排時柱</div>}
      {chart.bazi && (
        <div className="muted">
          月令 {chart.bazi.monthOrder.term}（交節 {chart.bazi.monthOrder.termAt}，距節 {chart.bazi.monthOrder.daysIntoTerm} 天）
        </div>
      )}
      <div className="muted">當地標準時 {chart.resolvedTime.civil}</div>
      {chart.resolvedTime.trueSolar && (
        <div className="muted">
          真太陽時 {chart.resolvedTime.trueSolar}
          {chart.resolvedTime.corrections.length > 0 &&
            `（${chart.resolvedTime.corrections.map((c) => `${c.kind === "longitude" ? "經度" : "均時差"} ${c.minutes > 0 ? "+" : ""}${c.minutes} 分`).join("、")}）`}
        </div>
      )}
      {chart.resolvedTime.ziPeriod && <div className="muted">子時判定：{chart.resolvedTime.ziPeriod}</div>}
      <div className="muted">完整度 {chart.completeness.score} 分{chart.completeness.missing.length ? `（缺：${chart.completeness.missing.join("、")}）` : ""}</div>
    </div>
  );
}

function samePillars(a: YixueChart, b: YixueChart): boolean {
  const key = (c: YixueChart) => {
    const p = c.bazi?.pillars;
    if (!p) return "";
    return [p.year, p.month, p.day].map((x) => x.ganzhi.label).join() + (p.hour?.ganzhi.label ?? "-");
  };
  return key(a) === key(b);
}

function nextVersion(current?: string) {
  const m = current?.match(/^v(\d+)/i);
  return m ? `v${Number(m[1]) + 1}` : "v1";
}
