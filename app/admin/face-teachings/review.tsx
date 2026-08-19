"use client";

import { useState } from "react";
import { reviewState, type ReviewStatus } from "@/lib/face-analysis/review-state";

export { reviewState };

export type ReviewRule = {
  id: string;
  rule_id: string;
  kind: "morphology" | "fingerprint" | "surface";
  target: string;
  payload: Record<string, unknown>;
  member_text: string;
  teacher_text: string;
  themes: string[];
  palaces: string[];
  flow_year_ages: number[];
  safety_level: "standard" | "high" | "critical";
  source_pages: string;
  status: string;
  version: number;
  reviewed_version: number | null;
  reviewed_at: string | null;
  decided_by: string;
};

/**
 * 逐條對照教材原文的審核卡。
 * 老師的實際動作是「翻到出處那一頁，比對原文與會員說法，確認後具名」，
 * 所以出處頁碼、教材原文與會員說法必須同時在畫面上，不能藏在編輯器裡。
 */
export function ReviewCard({ rule, reviewerName, busy, onReview, onEdit }: {
  rule: ReviewRule;
  reviewerName: string;
  busy: boolean;
  onReview: (rule: ReviewRule) => void;
  onEdit: (rule: ReviewRule) => void;
}) {
  const [open, setOpen] = useState(false);
  const state = reviewState(rule);
  const payload = (rule.payload || {}) as Record<string, string>;

  return (
    <article style={{
      padding: 16,
      borderRadius: 12,
      border: `1px solid ${state === "reviewed" ? "rgba(104,145,76,.45)" : state === "stale" ? "rgba(213,173,96,.45)" : "rgba(255,255,255,.1)"}`,
      background: "rgba(0,0,0,.22)"
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button
          onClick={() => setOpen((value) => !value)}
          style={{ background: "none", border: 0, color: "var(--green)", cursor: "pointer", fontSize: 15, fontWeight: 800, padding: 0 }}
        >
          {open ? "▾" : "▸"} {rule.rule_id}
        </button>
        <StateTag state={state} />
        <span className="muted" style={{ fontSize: 13 }}>v{rule.version}</span>
        <span className="muted" style={{ fontSize: 13 }}>{rule.safety_level}</span>
        <span style={{ marginLeft: "auto", color: "#8fb3b6", fontSize: 13 }}>出處：{rule.source_pages || "（未填）"}</span>
      </div>

      <p style={{ margin: "10px 0 0", color: "var(--text)", fontSize: 14, lineHeight: 1.7 }}>
        {rule.member_text.slice(0, 140)}{rule.member_text.length > 140 ? "⋯" : ""}
      </p>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
            <Panel title="教材原文（只給老師版）" tone="teacher">
              {rule.teacher_text || "（這條沒有另存教材原文）"}
            </Panel>
            <Panel title="會員報告會看到的說法" tone="member">
              {rule.kind === "fingerprint"
                ? `相理合：${payload.favorable || "—"}\n\n相理不合：${payload.unfavorable || "—"}`
                : rule.member_text}
            </Panel>
          </div>

          <dl style={{ display: "grid", gridTemplateColumns: "84px minmax(0,1fr)", gap: "6px 12px", margin: "14px 0 0", fontSize: 13 }}>
            <dt className="muted">部位</dt><dd style={{ margin: 0 }}>{rule.kind === "fingerprint" ? payload.partName || rule.target : rule.target}</dd>
            <dt className="muted">宮位</dt><dd style={{ margin: 0 }}>{rule.palaces.join("、") || "—"}</dd>
            <dt className="muted">主題</dt><dd style={{ margin: 0 }}>{rule.themes.join("、") || "—"}</dd>
            <dt className="muted">流年</dt><dd style={{ margin: 0 }}>{rule.flow_year_ages.join("、") || "—"}</dd>
            {rule.reviewed_at && (
              <>
                <dt className="muted">上次核對</dt>
                <dd style={{ margin: 0 }}>
                  {new Date(rule.reviewed_at).toLocaleString("zh-TW")}
                  {rule.decided_by ? `（${rule.decided_by}）` : ""}
                  {state === "stale" ? ` — 核對的是 v${rule.reviewed_version}，內容已改為 v${rule.version}` : ""}
                </dd>
              </>
            )}
          </dl>

          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="admin-action-btn"
              disabled={busy || state === "reviewed" || !reviewerName.trim()}
              onClick={() => onReview(rule)}
              title={!reviewerName.trim() ? "請先在上方填寫核對人姓名" : ""}
            >
              {state === "reviewed" ? "已核對" : state === "stale" ? "重新確認這一版" : "老師已確認"}
            </button>
            <button className="admin-action-btn ghost" disabled={busy} onClick={() => onEdit(rule)}>修改內容</button>
          </div>
        </div>
      )}
    </article>
  );
}

function StateTag({ state }: { state: ReviewStatus }) {
  const map = {
    reviewed: { label: "已核對", color: "#cce3b8", background: "rgba(104,145,76,.22)" },
    stale: { label: "內容已改，需重新確認", color: "#f0dcae", background: "rgba(213,173,96,.2)" },
    pending: { label: "未核對", color: "var(--muted)", background: "rgba(255,255,255,.07)" }
  }[state];
  return <span style={{ color: map.color, background: map.background, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}>{map.label}</span>;
}

function Panel({ title, tone, children }: { title: string; tone: "teacher" | "member"; children: React.ReactNode }) {
  return (
    <section style={{
      padding: 13,
      borderRadius: 10,
      borderLeft: `3px solid ${tone === "teacher" ? "#b98732" : "#7aaeb6"}`,
      background: tone === "teacher" ? "rgba(185,135,50,.09)" : "rgba(122,174,182,.09)"
    }}>
      <strong style={{ display: "block", marginBottom: 7, color: tone === "teacher" ? "#e6d3a7" : "#b9dfe2", fontSize: 13 }}>{title}</strong>
      <p style={{ margin: 0, color: "var(--text)", fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{children}</p>
    </section>
  );
}
