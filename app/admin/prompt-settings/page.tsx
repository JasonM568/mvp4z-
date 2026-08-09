"use client";

// 後台｜報告內容維護
//
// 風羿老師在這裡編輯易學決策報告的專業內容。這些內容以前寫死在程式裡，
// 要改必須由工程師改 code 重新部署。
//
// 流程刻意分兩段：儲存草稿 →（確認無誤）→ 發布。
// 草稿不影響任何正在產出的報告；發布後才會套用到之後的每一份 20 點報告。

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "../_shell";
import type { PromptSettings } from "@/lib/ai/council/settings/schema";
import { RuleListEditor, SectionCard, StringListEditor, TextField } from "./_editors";

type ApiState = {
  draft: { id: string; version_label: string; settings: PromptSettings; note: string; updated_at: string } | null;
  published: { id: string; version_label: string; settings: PromptSettings; published_at: string } | null;
  defaults: PromptSettings;
  env_overrides: string[];
  cache_seconds: number;
  char_budget: number;
  setup_required?: string;
};

const TABS = [
  { key: "skeleton", label: "報告骨架" },
  { key: "personas", label: "分身人設" },
  { key: "rules", label: "品質門檻" },
  { key: "fallback", label: "兜底報告" }
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function PromptSettingsPage() {
  const [state, setState] = useState<ApiState | null>(null);
  const [settings, setSettings] = useState<PromptSettings | null>(null);
  const [versionLabel, setVersionLabel] = useState("");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<TabKey>("skeleton");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/prompt-settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "讀取失敗");
      setState(data);
      const base = data.draft?.settings || data.published?.settings || data.defaults;
      setSettings(structuredClone(base));
      setVersionLabel(data.draft?.version_label || nextVersionLabel(data.published?.version_label));
      setNote(data.draft?.note || "");
      setDirty(false);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "讀取失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, [reload]);

  const patch = (fn: (draft: PromptSettings) => void) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
    setMessage("");
  };

  const charCount = useMemo(() => (settings ? JSON.stringify(settings).length : 0), [settings]);
  const overBudget = state ? charCount > state.char_budget : false;

  async function saveDraft() {
    if (!settings) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await adminFetch("/api/admin/prompt-settings", {
        method: "POST",
        body: JSON.stringify({ settings, version_label: versionLabel, note })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "儲存失敗");
      setMessage("草稿已儲存。目前正在產出的報告不受影響，要按「發布」才會生效。");
      setDirty(false);
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (dirty && !window.confirm("還有未儲存的修改不會被發布。要先發布已儲存的草稿嗎？")) return;
    if (!window.confirm("發布後，之後每一份易學決策報告都會採用這份設定。確定發布？")) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await adminFetch("/api/admin/prompt-settings/publish", { method: "POST" });
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

  function resetToDefaults() {
    if (!state) return;
    if (!window.confirm("會把畫面上的內容換成系統預設值，你尚未儲存的修改會消失。確定？")) return;
    setSettings(structuredClone(state.defaults));
    setDirty(true);
    setMessage("已載入系統預設值，確認後請按「儲存草稿」。");
  }

  if (loading) return <p className="admin-empty">讀取中⋯</p>;
  if (!state || !settings) return <p className="admin-empty">{message || "讀取失敗"}</p>;

  return (
    <>
      <h1>報告內容維護</h1>
      <p className="lead">
        易學決策報告的專業內容。修改後先存成草稿，確認無誤再發布；發布後之後的每一份報告都會採用。
      </p>

      {state.setup_required && (
        <div className="kpi-card" style={{ borderColor: "#ffd166", marginBottom: 16 }}>
          <strong style={{ color: "#ffd166" }}>尚未完成資料庫設定</strong>
          <p className="muted" style={{ margin: "8px 0 0", lineHeight: 1.8 }}>{state.setup_required}</p>
        </div>
      )}

      {state.env_overrides.length > 0 && (
        <div className="kpi-card" style={{ borderColor: "#ff8d7a", marginBottom: 16 }}>
          <strong style={{ color: "#ff8d7a" }}>注意：以下分身目前被環境變數覆寫</strong>
          <p className="muted" style={{ margin: "8px 0 0", lineHeight: 1.8 }}>
            {state.env_overrides.join("、")}
            ——這幾個分身在這裡改了<strong>不會生效</strong>，因為正式環境設了對應的環境變數。
            要讓後台設定生效，請先請工程師移除那些環境變數。
          </p>
        </div>
      )}

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="kpi-card">
          <div className="label">目前生效版本</div>
          <div className="value" style={{ fontSize: 18 }}>
            {state.published?.version_label || "系統預設"}
          </div>
          <div className="hint">
            {state.published?.published_at
              ? `發布於 ${new Date(state.published.published_at).toLocaleString("zh-TW")}`
              : "尚未發布過任何版本，報告使用程式內建內容"}
          </div>
        </div>
        <div className="kpi-card">
          <div className="label">草稿</div>
          <div className="value" style={{ fontSize: 18 }}>
            {state.draft ? state.draft.version_label : "無"}
          </div>
          <div className="hint">
            {dirty ? "有尚未儲存的修改" : state.draft ? "已儲存，尚未發布" : "尚未建立草稿"}
          </div>
        </div>
        <div className="kpi-card">
          <div className="label">內容字數</div>
          <div className="value" style={{ fontSize: 18, color: overBudget ? "#ff8d7a" : undefined }}>
            {charCount.toLocaleString()} / {state.char_budget.toLocaleString()}
          </div>
          <div className="hint">這些文字在一份報告裡會送出 7 次，過長會讓模型逾時</div>
        </div>
      </div>

      <div className="admin-form-grid" style={{ marginBottom: 16 }}>
        <label>
          版本名稱
          <input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} />
        </label>
        <label>
          版本備註（只給自己看，不會進報告）
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      <div className="admin-filter" style={{ marginBottom: 18 }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <div className="admin-inline-message" style={{ whiteSpace: "pre-wrap", marginBottom: 16 }}>
          {message}
        </div>
      )}

      {tab === "skeleton" && <SkeletonTab settings={settings} patch={patch} />}
      {tab === "personas" && <PersonasTab settings={settings} patch={patch} />}
      {tab === "rules" && <RulesTab settings={settings} patch={patch} />}
      {tab === "fallback" && <FallbackTab settings={settings} patch={patch} />}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
        <button type="button" className="admin-action-btn" onClick={saveDraft} disabled={saving || overBudget}>
          {saving ? "處理中⋯" : "儲存草稿"}
        </button>
        <button type="button" className="admin-action-btn ghost" onClick={publish} disabled={saving || !state.draft}>
          發布草稿
        </button>
        <button type="button" className="admin-action-btn ghost" onClick={resetToDefaults} disabled={saving}>
          還原成系統預設
        </button>
      </div>
    </>
  );
}

type TabProps = { settings: PromptSettings; patch: (fn: (d: PromptSettings) => void) => void };

function SkeletonTab({ settings, patch }: TabProps) {
  const r = settings.reportSkeleton;
  return (
    <>
      <SectionCard title="各術獨立判讀的小節" hint="每一個啟用的術數都會依這些小節逐項展開。{{術數名稱}} 會換成該術的名字。">
        <StringListEditor
          label="小節名稱"
          values={r.termSubsections}
          onChange={(v) => patch((d) => void (d.reportSkeleton.termSubsections = v))}
        />
      </SectionCard>

      <SectionCard title="個案總論" hint="報告開頭的總結段落要寫哪幾項。">
        <TextField label="段落標題" value={r.overview.title} onChange={(v) => patch((d) => void (d.reportSkeleton.overview.title = v))} />
        <StringListEditor
          label="要點"
          values={r.overview.items}
          onChange={(v) => patch((d) => void (d.reportSkeleton.overview.items = v))}
        />
      </SectionCard>

      <SectionCard title="行動方案" hint="每一期要交代哪些欄位。期別可以增減，系統會自動編號。">
        <TextField label="段落標題" value={r.actionPlan.title} onChange={(v) => patch((d) => void (d.reportSkeleton.actionPlan.title = v))} />
        {r.actionPlan.windows.map((w, i) => (
          <div key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, marginTop: 12 }}>
            <TextField
              label={`第 ${i + 1} 期名稱`}
              value={w.label}
              onChange={(v) => patch((d) => void (d.reportSkeleton.actionPlan.windows[i].label = v))}
            />
            <StringListEditor
              label="這一期要填的欄位"
              values={w.fields}
              onChange={(v) => patch((d) => void (d.reportSkeleton.actionPlan.windows[i].fields = v))}
            />
            <button
              type="button"
              className="admin-danger-btn"
              disabled={r.actionPlan.windows.length <= 1}
              onClick={() => patch((d) => void d.reportSkeleton.actionPlan.windows.splice(i, 1))}
            >
              刪除這一期
            </button>
          </div>
        ))}
        <button
          type="button"
          className="admin-action-btn small ghost"
          style={{ marginTop: 12 }}
          onClick={() =>
            patch((d) => void d.reportSkeleton.actionPlan.windows.push({ label: "", fields: ["動作："] }))
          }
        >
          ＋ 新增一期
        </button>
      </SectionCard>

      <SectionCard title="交叉驗證">
        <TextField
          label="段落標題"
          value={r.crossValidation.title}
          onChange={(v) => patch((d) => void (d.reportSkeleton.crossValidation.title = v))}
        />
        <StringListEditor
          label="要點"
          values={r.crossValidation.items}
          onChange={(v) => patch((d) => void (d.reportSkeleton.crossValidation.items = v))}
        />
      </SectionCard>

      <SectionCard title="最終建議與專業聲明">
        <TextField
          label="最終建議標題"
          value={r.finalRecommendation.title}
          onChange={(v) => patch((d) => void (d.reportSkeleton.finalRecommendation.title = v))}
        />
        <TextField
          label="最終建議要求"
          multiline
          value={r.finalRecommendation.body}
          onChange={(v) => patch((d) => void (d.reportSkeleton.finalRecommendation.body = v))}
        />
        <TextField
          label="專業聲明標題"
          value={r.disclaimer.title}
          onChange={(v) => patch((d) => void (d.reportSkeleton.disclaimer.title = v))}
        />
        <TextField
          label="專業聲明內容"
          multiline
          value={r.disclaimer.body}
          onChange={(v) => patch((d) => void (d.reportSkeleton.disclaimer.body = v))}
        />
      </SectionCard>
    </>
  );
}

const PERSONA_HINTS: Record<string, string> = {
  main: "負責建立主判讀框架，是報告的骨幹。",
  strategy: "內部參謀，補充情境、客戶心理與替代方案，不會單獨對外呈現。",
  attack: "內部反證層，負責挑錯與找出客戶會質疑的地方。",
  final: "最後定稿者，把前面幾輪整合成對外的正式報告。"
};

function PersonasTab({ settings, patch }: TabProps) {
  const keys = ["main", "strategy", "attack", "final"] as const;
  return (
    <>
      {keys.map((key) => {
        const p = settings.personas[key];
        return (
          <SectionCard key={key} title={p.label} hint={PERSONA_HINTS[key]}>
            <StringListEditor
              label="人設描述（一行一句）"
              values={p.lines}
              onChange={(v) => patch((d) => void (d.personas[key].lines = v))}
            />
            {key === "final" && (
              <>
                <TextField
                  label="報告段落清單的引導句"
                  value={p.formatHeading}
                  onChange={(v) => patch((d) => void (d.personas.final.formatHeading = v))}
                />
                <StringListEditor
                  label="報告必須包含的段落"
                  values={p.formatItems}
                  onChange={(v) => patch((d) => void (d.personas.final.formatItems = v))}
                />
              </>
            )}
          </SectionCard>
        );
      })}
      <SectionCard title="品牌共同規則" hint="四個分身都會套用這一組規則。">
        <RuleListEditor
          label="規則"
          items={settings.brand.items}
          onChange={(v) => patch((d) => void (d.brand.items = v))}
        />
      </SectionCard>
    </>
  );
}

function RulesTab({ settings, patch }: TabProps) {
  const g = settings.qualityGate;
  return (
    <>
      <SectionCard title="品牌規則" hint="控制報告的對外措辭，避免露出技術細節。">
        <RuleListEditor label="規則" items={g.brandRules.items} onChange={(v) => patch((d) => void (d.qualityGate.brandRules.items = v))} />
      </SectionCard>
      <SectionCard title="格式規則" hint="控制排版，例如禁用 Markdown 符號、標題用中文序號。">
        <RuleListEditor label="規則" items={g.formatRules.items} onChange={(v) => patch((d) => void (d.qualityGate.formatRules.items = v))} />
      </SectionCard>
      <SectionCard title="內容規則" hint="控制判讀品質，例如禁止空話、要求具體決策語句。">
        <RuleListEditor label="規則" items={g.contentRules.items} onChange={(v) => patch((d) => void (d.qualityGate.contentRules.items = v))} />
      </SectionCard>
      <SectionCard title="終稿階段的格式規則" hint="最後定稿時會再檢查一次的排版要求。">
        <RuleListEditor
          label="規則"
          items={settings.reportSkeleton.formatRules.items}
          onChange={(v) => patch((d) => void (d.reportSkeleton.formatRules.items = v))}
        />
      </SectionCard>
    </>
  );
}

function FallbackTab({ settings, patch }: TabProps) {
  const f = settings.fallbackReport;
  const weightKeys = [
    ["qimen", "奇門"],
    ["bazi", "八字"],
    ["liuyao", "六爻"],
    ["meihua", "梅花"]
  ] as const;
  const total = f.weights.bazi + f.weights.qimen + f.weights.liuyao + f.weights.meihua;

  return (
    <>
      <SectionCard
        title="這是什麼"
        hint="AI 全部無回應時交付的備援稿。這條路徑不扣會員點數，改動不影響收費，可以放心調整。"
      >
        <TextField label="報告標題" value={f.reportTitle} onChange={(v) => patch((d) => void (d.fallbackReport.reportTitle = v))} />
      </SectionCard>

      <SectionCard title="個案總論">
        <StringListEditor
          label="要點"
          values={f.overview.items}
          onChange={(v) => patch((d) => void (d.fallbackReport.overview.items = v))}
        />
      </SectionCard>

      <SectionCard title="各術判讀說明" hint="備援稿固定列出四術，說明為什麼此刻無法下定論、還缺什麼資料。">
        {Object.entries(f.termReadings).map(([term, text]) => (
          <TextField
            key={term}
            label={term}
            multiline
            value={text}
            onChange={(v) => patch((d) => void (d.fallbackReport.termReadings[term] = v))}
          />
        ))}
      </SectionCard>

      <SectionCard title="四術權重" hint={`會填入交叉驗證段落。目前加總 ${total}%，必須剛好 100% 才能儲存。`}>
        <div className="admin-form-grid">
          {weightKeys.map(([key, label]) => (
            <label key={key}>
              {label}（%）
              <input
                type="number"
                min={0}
                max={100}
                value={f.weights[key]}
                onChange={(e) => patch((d) => void (d.fallbackReport.weights[key] = Number(e.target.value || 0)))}
              />
            </label>
          ))}
        </div>
        {total !== 100 && (
          <p style={{ color: "#ff8d7a", fontSize: 13, marginTop: 8 }}>目前加總 {total}%，請調整成 100%。</p>
        )}
      </SectionCard>

      <SectionCard title="交叉驗證">
        <StringListEditor
          label="要點"
          values={f.crossValidation.items}
          onChange={(v) => patch((d) => void (d.fallbackReport.crossValidation.items = v))}
        />
      </SectionCard>

      <SectionCard title="最終建議">
        <StringListEditor
          label="要點"
          values={f.finalAdvice.items}
          onChange={(v) => patch((d) => void (d.fallbackReport.finalAdvice.items = v))}
        />
      </SectionCard>

      <SectionCard title="專業聲明">
        <TextField
          label="內容"
          multiline
          value={f.disclaimer.body}
          onChange={(v) => patch((d) => void (d.fallbackReport.disclaimer.body = v))}
        />
      </SectionCard>
    </>
  );
}

function nextVersionLabel(current?: string) {
  const match = current?.match(/^v(\d+)/i);
  return match ? `v${Number(match[1]) + 1}` : "v1";
}
