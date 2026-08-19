"use client";

import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../_shell";

type Kind = "morphology" | "fingerprint" | "surface";
type Rule = {
  id: string;
  rule_id: string;
  kind: Kind;
  target: string;
  payload: Record<string, unknown>;
  member_text: string;
  teacher_text: string;
  themes: string[];
  palaces: string[];
  flow_year_ages: number[];
  safety_level: "standard" | "high" | "critical";
  health_sensitive: boolean;
  source_pages: string;
  status: "draft" | "published" | "archived";
  version: number;
  updated_at: string;
};

const KIND_LABELS: Record<Kind, string> = {
  morphology: "形態條文",
  fingerprint: "指紋部位",
  surface: "斑痣部位"
};

const FEATURE_LABELS: Record<string, string> = {
  forehead: "額頭", eyebrows: "眉", eyes: "眼", nose: "鼻", cheeks: "顴頰", mouth: "口",
  jaw: "下顎", ears: "耳", glabella: "印堂", nasalRoot: "山根", outerEyeCorners: "奸門",
  tearTroughs: "淚堂", philtrum: "人中", chin: "地閣",
  foreheadShape: "額形", eyebrowShape: "眉形", eyebrowTail: "眉尾", eyeShape: "眼形",
  eyeTilt: "眼尾斜度", eyeSpacing: "眉眼距", nasalBridge: "鼻樑", noseTip: "準頭",
  noseWing: "鼻翼", cheekbone: "顴骨", lipShape: "唇形", mouthCorner: "嘴角",
  philtrumShape: "人中形", jawline: "腮骨", chinShape: "地閣形", earShape: "耳形"
};

const CONDITION_LABELS: Record<string, Record<string, string>> = {
  contour: { rounded: "圓潤", straight: "平直", angular: "稜角", mixed: "混合", not_assessable: "無法判讀" },
  relativeWidth: { narrow: "偏窄", medium: "適中", wide: "偏寬", not_assessable: "無法判讀" },
  relativeHeight: { short: "偏短", medium: "適中", long: "偏長", not_assessable: "無法判讀" },
  symmetry: { balanced: "對稱", slightly_asymmetric: "略不對稱", asymmetric: "明顯不對稱", not_assessable: "無法判讀" }
};

const FIELD_LABELS: Record<string, string> = {
  contour: "輪廓", relativeWidth: "寬窄", relativeHeight: "長短", symmetry: "對稱"
};

function describeCondition(payload: Record<string, unknown>): string {
  const condition = payload?.condition as Record<string, string[]> | undefined;
  if (!condition) return "—";
  const parts = Object.entries(condition)
    .filter(([, values]) => Array.isArray(values) && values.length > 0)
    .map(([field, values]) => `${FIELD_LABELS[field] || field}：${values.map((v) => CONDITION_LABELS[field]?.[v] || v).join("／")}`);
  return parts.length > 0 ? parts.join("，") : "—";
}

export default function FaceTeachingsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [kind, setKind] = useState<Kind | "">("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await adminFetch(`/api/admin/face-teachings${kind ? `?kind=${kind}` : ""}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "讀取失敗");
      setRules(body.rules || []);
      if (body.tableMissing) setMessage("face_teaching_rules 資料表尚未建立，系統目前使用程式碼內建的回退規則。");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "讀取失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [kind]);

  const counts = useMemo(() => ({
    published: rules.filter((r) => r.status === "published").length,
    draft: rules.filter((r) => r.status === "draft").length,
    archived: rules.filter((r) => r.status === "archived").length,
    critical: rules.filter((r) => r.safety_level === "critical").length
  }), [rules]);

  async function patch(rule: Rule, body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const response = await adminFetch(`/api/admin/face-teachings/${rule.id}`, { method: "PATCH", body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "更新失敗");
      setMessage(`已更新 ${rule.rule_id}；之後的新分析會套用。`);
      setEditing(null);
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  }

  async function importBuiltIn() {
    if (!window.confirm("把程式碼內建的判讀規則匯入為已發布規則？已存在的識別碼不會被覆蓋。")) return;
    setBusy(true);
    try {
      const response = await adminFetch("/api/admin/face-teachings/import-builtin", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "匯入失敗");
      setMessage(`匯入完成：新增 ${data.inserted} 條，略過 ${data.skipped} 條（識別碼已存在）。`);
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "匯入失敗");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="admin-empty">讀取中⋯</p>;

  return (
    <>
      <h1>面相判讀規則</h1>
      <p className="lead">
        沈師教材的判讀條文。只有「已發布」且安全分級為 standard 或 high 的規則會進會員報告；
        critical 只留給老師版與稽核。改完即時生效於之後的新分析，既有報告不受影響。
      </p>
      {message && <div className="admin-inline-message">{message}</div>}

      <div className="kpi-grid">
        <article className="kpi-card"><div className="label">已發布</div><div className="value" style={{ fontSize: 22 }}>{counts.published}</div></article>
        <article className="kpi-card"><div className="label">草稿</div><div className="value" style={{ fontSize: 22 }}>{counts.draft}</div></article>
        <article className="kpi-card"><div className="label">已封存</div><div className="value" style={{ fontSize: 22 }}>{counts.archived}</div></article>
        <article className="kpi-card"><div className="label">critical（不進報告）</div><div className="value" style={{ fontSize: 22 }}>{counts.critical}</div></article>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "18px 0 10px" }}>
        <button className="admin-action-btn ghost" disabled={busy} onClick={() => void importBuiltIn()}>
          從程式碼內建規則匯入
        </button>
        <span className="muted" style={{ alignSelf: "center", fontSize: 13 }}>
          已存在的識別碼不會被覆蓋，重跑安全；老師改過的內容不受影響。
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 18px" }}>
        {(["", "morphology", "fingerprint", "surface"] as const).map((value) => (
          <button
            key={value || "all"}
            className={`admin-action-btn${kind === value ? "" : " ghost"}`}
            onClick={() => setKind(value)}
          >
            {value === "" ? "全部" : KIND_LABELS[value]}
          </button>
        ))}
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>識別碼</th><th>類型</th><th>部位</th><th>條件</th><th>教材說法</th>
              <th>分級</th><th>狀態</th><th>版本</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && <tr><td colSpan={9} className="admin-empty">沒有規則。</td></tr>}
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td><code style={{ fontSize: 12 }}>{rule.rule_id}</code></td>
                <td>{KIND_LABELS[rule.kind]}</td>
                <td>{FEATURE_LABELS[rule.target] || rule.target}</td>
                <td style={{ fontSize: 13 }}>{rule.kind === "morphology" ? describeCondition(rule.payload) : rule.kind === "fingerprint" ? String(rule.payload?.partName || "—") : "—"}</td>
                <td style={{ maxWidth: 420, fontSize: 13, lineHeight: 1.6 }}>{rule.member_text.slice(0, 120)}{rule.member_text.length > 120 ? "⋯" : ""}</td>
                <td>{rule.safety_level}{rule.health_sensitive ? "（健康）" : ""}</td>
                <td>{rule.status}</td>
                <td>v{rule.version}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="admin-action-btn ghost" onClick={() => setEditing(rule)}>編輯</button>{" "}
                  {rule.status !== "published" && (
                    <button className="admin-action-btn" disabled={busy} onClick={() => void patch(rule, { status: "published" }, `發布「${rule.rule_id}」？之後的新分析會套用這條規則。`)}>發布</button>
                  )}
                  {rule.status === "published" && (
                    <button className="admin-action-btn ghost" disabled={busy} onClick={() => void patch(rule, { status: "archived" }, `封存「${rule.rule_id}」？之後的新分析不再套用，既有報告不受影響。`)}>封存</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <RuleEditor rule={editing} busy={busy} onCancel={() => setEditing(null)} onSave={(body) => void patch(editing, body)} />}
    </>
  );
}

function RuleEditor({ rule, busy, onCancel, onSave }: {
  rule: Rule;
  busy: boolean;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [memberText, setMemberText] = useState(rule.member_text);
  const [teacherText, setTeacherText] = useState(rule.teacher_text);
  const [themes, setThemes] = useState(rule.themes.join("、"));
  const [palaces, setPalaces] = useState(rule.palaces.join("、"));
  const [ages, setAges] = useState(rule.flow_year_ages.join(","));
  const [sourcePages, setSourcePages] = useState(rule.source_pages);
  const [safety, setSafety] = useState(rule.safety_level);
  const payload = (rule.payload || {}) as Record<string, string>;
  const [partName, setPartName] = useState(payload.partName || "");
  const [looksAt, setLooksAt] = useState(payload.looksAt || "");
  const [favorable, setFavorable] = useState(payload.favorable || "");
  const [unfavorable, setUnfavorable] = useState(payload.unfavorable || "");

  return (
    <section className="kpi-card" style={{ marginTop: 22, padding: 24 }}>
      <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>編輯 {rule.rule_id}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        識別碼與類型發布後不可更改——既有報告的引用與稽核鏈都靠它回溯。要停用請改狀態為封存。
      </p>

      {rule.kind === "fingerprint" && (
        <div className="admin-form-grid">
          <label>教材部位名<input value={partName} onChange={(e) => setPartName(e.target.value)} /></label>
          <label>教材看什麼<input value={looksAt} onChange={(e) => setLooksAt(e.target.value)} /></label>
        </div>
      )}
      {rule.kind === "fingerprint" && (
        <>
          <label style={{ display: "block", marginTop: 12 }}>相理合（正向條件）
            <textarea value={favorable} onChange={(e) => setFavorable(e.target.value)} rows={3} style={textarea} />
          </label>
          <label style={{ display: "block", marginTop: 12 }}>相理不合（反向條件）
            <textarea value={unfavorable} onChange={(e) => setUnfavorable(e.target.value)} rows={3} style={textarea} />
          </label>
        </>
      )}

      {rule.kind !== "fingerprint" && (
        <label style={{ display: "block", marginTop: 12 }}>教材說法（進會員報告）
          <textarea value={memberText} onChange={(e) => setMemberText(e.target.value)} rows={4} style={textarea} />
        </label>
      )}
      <label style={{ display: "block", marginTop: 12 }}>教材原文（只進老師版與稽核，不進會員報告）
        <textarea value={teacherText} onChange={(e) => setTeacherText(e.target.value)} rows={3} style={textarea} />
      </label>

      <div className="admin-form-grid" style={{ marginTop: 12 }}>
        <label>主題（頓號分隔）<input value={themes} onChange={(e) => setThemes(e.target.value)} /></label>
        <label>宮位（頓號分隔）<input value={palaces} onChange={(e) => setPalaces(e.target.value)} /></label>
        <label>流年歲數（逗號分隔）<input value={ages} onChange={(e) => setAges(e.target.value)} /></label>
        <label>教材出處<input value={sourcePages} onChange={(e) => setSourcePages(e.target.value)} /></label>
        <label>安全分級
          <select value={safety} onChange={(e) => setSafety(e.target.value as Rule["safety_level"])}>
            <option value="standard">standard（進會員報告）</option>
            <option value="high">high（進報告，原文只給老師）</option>
            <option value="critical">critical（不進會員報告）</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="admin-action-btn" disabled={busy} onClick={() => onSave({
          ...(rule.kind === "fingerprint" ? { partName, looksAt, favorable, unfavorable } : { memberText }),
          teacherText,
          themes: themes.split(/[、,]/).map((s) => s.trim()).filter(Boolean),
          palaces: palaces.split(/[、,]/).map((s) => s.trim()).filter(Boolean),
          flowYearAges: ages.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 120),
          sourcePages,
          safetyLevel: safety
        })}>儲存</button>{" "}
        <button className="admin-action-btn ghost" disabled={busy} onClick={onCancel}>取消</button>
      </div>
    </section>
  );
}

const textarea: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", minHeight: 70, padding: 12,
  border: "1px solid rgba(255,255,255,.16)", borderRadius: 10,
  background: "rgba(0,0,0,.3)", color: "var(--text)", font: "inherit", lineHeight: 1.7, resize: "vertical"
};
