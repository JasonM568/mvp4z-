"use client";

// 報告內容維護｜共用欄位編輯元件
//
// 設計取向：老師填欄位，不編輯整段 prompt。
// 中文序號、段落順序、術數展開都由系統產生，他只負責內容。

import { TOKEN_DESCRIPTIONS } from "@/lib/ai/council/settings/tokens";
import type { RuleItem } from "@/lib/ai/council/settings/schema";

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 68,
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  color: "inherit",
  padding: "10px 12px",
  resize: "vertical",
  fontFamily: "inherit",
  fontSize: 14,
  lineHeight: 1.7
};

const inputStyle: React.CSSProperties = { ...textareaStyle, minHeight: 42, resize: "none" };

export function SectionCard({
  title,
  hint,
  children
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="kpi-card" style={{ marginBottom: 18 }}>
      <div className="admin-section-title" style={{ marginTop: 0 }}>
        {title}
      </div>
      {hint && (
        <p className="muted" style={{ marginTop: -6, marginBottom: 14, fontSize: 13, lineHeight: 1.7 }}>
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

export function TokenHelp({ tokens }: { tokens: string[] }) {
  if (!tokens.length) return null;
  return (
    <div
      style={{
        background: "rgba(0,0,0,0.25)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "10px 12px",
        marginBottom: 12,
        fontSize: 13,
        lineHeight: 1.9
      }}
    >
      <strong style={{ fontSize: 12, opacity: 0.7 }}>可用變數（系統會換成實際內容，請勿刪除）</strong>
      {tokens.map((t) => (
        <div key={t}>
          <code style={{ color: "var(--green)" }}>{t}</code>
          <span className="muted"> — {TOKEN_DESCRIPTIONS[t] || ""}</span>
        </div>
      ))}
    </div>
  );
}

/** 純文字條列（人設句子、段落要點）。 */
export function StringListEditor({
  label,
  values,
  onChange,
  placeholder,
  minRows = 1
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  minRows?: number;
}) {
  const update = (i: number, v: string) => onChange(values.map((x, k) => (k === i ? v : x)));
  const remove = (i: number) => onChange(values.filter((_, k) => k !== i));
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= values.length) return;
    const next = [...values];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
      <label style={{ fontSize: 13, opacity: 0.8 }}>{label}</label>
      {values.map((v, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span className="muted" style={{ width: 24, paddingTop: 12, fontSize: 12 }}>
            {i + 1}.
          </span>
          <textarea
            value={v}
            placeholder={placeholder}
            onChange={(e) => update(i, e.target.value)}
            style={{ ...textareaStyle, minHeight: minRows * 34 + 20 }}
          />
          <div style={{ display: "grid", gap: 4 }}>
            <button type="button" className="admin-action-btn small ghost" onClick={() => move(i, -1)} disabled={i === 0}>
              ↑
            </button>
            <button
              type="button"
              className="admin-action-btn small ghost"
              onClick={() => move(i, 1)}
              disabled={i === values.length - 1}
            >
              ↓
            </button>
            <button type="button" className="admin-danger-btn" onClick={() => remove(i)} disabled={values.length <= 1}>
              刪
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="admin-action-btn small ghost"
        style={{ justifySelf: "start" }}
        onClick={() => onChange([...values, ""])}
      >
        ＋ 新增一項
      </button>
    </div>
  );
}

/** 規則條列。系統鎖定的條目可以改字，但不能刪，且會顯示鎖定原因。 */
export function RuleListEditor({
  label,
  items,
  onChange
}: {
  label: string;
  items: RuleItem[];
  onChange: (next: RuleItem[]) => void;
}) {
  const usedTokens = Array.from(new Set(items.flatMap((i) => i.requiredTokens)));
  const update = (i: number, text: string) =>
    onChange(items.map((x, k) => (k === i ? { ...x, text } : x)));
  const remove = (i: number) => onChange(items.filter((_, k) => k !== i));
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
      <label style={{ fontSize: 13, opacity: 0.8 }}>{label}</label>
      <TokenHelp tokens={usedTokens} />
      {items.map((item, i) => {
        const missing = item.requiredTokens.filter((t) => !item.text.includes(t));
        return (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span className="muted" style={{ width: 24, paddingTop: 12, fontSize: 12 }}>
              {i + 1}.
            </span>
            <div style={{ flex: 1 }}>
              <textarea value={item.text} onChange={(e) => update(i, e.target.value)} style={textareaStyle} />
              {item.isLocked && (
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.6 }}>
                  🔒 系統鎖定：{item.lockReason}
                </p>
              )}
              {missing.length > 0 && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#ff8d7a", lineHeight: 1.6 }}>
                  缺少必要變數 {missing.join("、")}，存檔會被擋下。
                </p>
              )}
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              <button
                type="button"
                className="admin-action-btn small ghost"
                onClick={() => move(i, -1)}
                disabled={i === 0}
              >
                ↑
              </button>
              <button
                type="button"
                className="admin-action-btn small ghost"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
              >
                ↓
              </button>
              <button
                type="button"
                className="admin-danger-btn"
                onClick={() => remove(i)}
                disabled={item.isLocked}
                title={item.isLocked ? item.lockReason : "刪除這條規則"}
              >
                刪
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="admin-action-btn small ghost"
        style={{ justifySelf: "start" }}
        onClick={() => onChange([...items, { text: "", isLocked: false, requiredTokens: [], lockReason: "" }])}
      >
        ＋ 新增一條規則
      </button>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  multiline
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
      <label style={{ fontSize: 13, opacity: 0.8 }}>{label}</label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} style={textareaStyle} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      )}
    </div>
  );
}
