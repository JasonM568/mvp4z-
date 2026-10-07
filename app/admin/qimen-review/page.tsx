"use client";

// 後台｜奇門遁甲校對與簽核
//
// 奇門的定局法（拆補／置閏／茅山）沒有定本，工程無從自己驗證，只有老師能判斷。
// 這頁讓老師拿自己的排盤，與系統排出的三張盤例逐格比對：
//   - 三張都一致 → 簽核，之後報告的奇門段落改印「已校對」
//   - 有任何一格不同 → 寫下差異送出，不簽核，工程會依此修正
// 盤面由伺服器用目前生效的流派現算，不是存起來的圖。

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../_shell";

type CaseView = { id: string; label: string; headlines: string[]; grid: string[][] };
type Status = { signed: boolean; signedBy: string; signedAt: string; ruleVersion: string | null; latestRejected: boolean };
type HistoryRow = {
  id: string; rule_version: string; approved: boolean; signed_by: string; note: string; created_at: string;
  case_results: Array<{ id: string; label: string; match: boolean; note: string }>;
};
type ApiState = {
  rule_version: string; method: string; cases: CaseView[]; school_notes: string[]; school_warnings: string[]; status: Status; history: HistoryRow[]; setup_required: string | null;
};
type Answer = { match: boolean | null; note: string };

const RULES = [
  "節氣：取起局時刻當下生效的那一個，二十四節氣全取（含中氣），不是八字用的十二節。",
  "陰陽遁：冬至到芒種為陽遁，夏至到大雪為陰遁。",
  "三元：由「符頭」（日干為甲或己之日，往回找最近的一個）的地支決定。子午卯酉＝上元，寅申巳亥＝中元，辰戌丑未＝下元。",
  "局數：查二十四節氣三元局數表（口訣：冬至一七四、小寒二八五…）。",
  "不置閏：遇超神接氣直接以符頭補足——這是拆補法與置閏法的分水嶺。"
];

export default function QimenReviewPage() {
  const [state, setState] = useState<ApiState | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [signedBy, setSignedBy] = useState("風羿老師");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/qimen-review");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "讀取失敗");
      setState(data);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "讀取失敗");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const answered = state ? state.cases.every((c) => answers[c.id]?.match !== undefined && answers[c.id]?.match !== null) : false;
  const allMatch = state ? state.cases.every((c) => answers[c.id]?.match === true) : false;

  async function submit() {
    if (!state) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await adminFetch("/api/admin/qimen-review/signoff", {
        method: "POST",
        body: JSON.stringify({
          signed_by: signedBy,
          note,
          results: state.cases.map((c) => ({ id: c.id, match: answers[c.id]?.match === true, note: answers[c.id]?.note || "" }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "送出失敗");
      setMessage(data.approved
        ? "已簽核。之後的報告奇門段落會印「已校對」（最多 1 分鐘內生效）。"
        : "已記錄你回報的差異，這一版不會簽核。工程會依你寫的內容修正，修正後請再比對一次。");
      setAnswers({});
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "送出失敗");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="admin-empty">讀取中⋯</p>;
  if (!state) return <p className="admin-empty">{message || "讀取失敗"}</p>;

  const s = state.status;
  return (
    <>
      <h1>奇門遁甲校對與簽核</h1>
      <p className="lead">
        奇門的定局法沒有定本，只有老師能判斷系統排得對不對。請用你自己的排盤軟體或手排，
        與下面三張盤逐格比對。任何一格不同都請寫下來，不必自己判斷是哪一步錯。
      </p>

      <div className="kpi-card" style={{ marginBottom: 18, borderColor: s.signed ? "var(--green)" : "#ffd166" }}>
        <strong style={{ fontSize: 18, color: s.signed ? "var(--green)" : "#ffd166" }}>
          {s.signed ? `目前狀態：已校對（${s.signedBy}　${s.signedAt}）` : "目前狀態：尚未校對"}
        </strong>
        <p className="muted" style={{ margin: "8px 0 0", lineHeight: 1.8 }}>
          {s.signed
            ? "報告的奇門段落會標示「已由老師比對確認」。"
            : s.latestRejected
              ? "上一次校對回報了差異，待工程修正後請再比對。"
              : s.ruleVersion && s.ruleVersion !== state.rule_version
                ? "奇門的排盤規則在上次簽核之後改過，需要重新比對。"
                : "報告的奇門段落會要求 AI 明說「定局法尚待老師校對」，不當作定論。"}
          目前採用：{state.method}（規則版本 {state.rule_version}）。
        </p>
      </div>

      {state.setup_required && (
        <div className="admin-inline-message" style={{ marginBottom: 16 }}>{state.setup_required}</div>
      )}

      <div className="kpi-card" style={{ marginBottom: 18 }}>
        <div className="admin-section-title" style={{ marginTop: 0 }}>系統目前實作的規則（拆補法）</div>
        <ol style={{ margin: 0, paddingLeft: 22, lineHeight: 2, fontSize: 16 }}>
          {RULES.map((r) => <li key={r}>{r}</li>)}
        </ol>
        <p className="muted" style={{ marginBottom: 0, lineHeight: 1.8 }}>
          若你用的是置閏法或茅山法，請在最下方備註寫明。那兩種目前系統沒有實作，會另外排工。
        </p>
      </div>

      <div className="kpi-card" style={{ marginBottom: 18 }}>
        <div className="admin-section-title" style={{ marginTop: 0 }}>這三盤使用的曆法設定（來自「排盤流派設定」已發布版本）</div>
        <ul style={{ margin: 0, paddingLeft: 22, lineHeight: 2, fontSize: 16 }}>
          {state.school_notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
        {state.school_warnings.map((w) => (
          <p key={w} style={{ margin: "12px 0 0", lineHeight: 1.9, fontSize: 16, color: "#ffd166" }}>⚠ {w}</p>
        ))}
        <p className="muted" style={{ marginBottom: 0, lineHeight: 1.8 }}>
          這些設定只會改變日柱與時柱的標示；文件裡的盤例是以「晚子時進位」寫的，所以盤例一的日柱可能與文件不同，九宮盤內容是一樣的。
        </p>
      </div>

      {message && <div className="admin-inline-message" style={{ whiteSpace: "pre-wrap", marginBottom: 16 }}>{message}</div>}

      {state.cases.map((c) => {
        const a = answers[c.id] || { match: null, note: "" };
        return (
          <div className="kpi-card" key={c.id} style={{ marginBottom: 18 }}>
            <div className="admin-section-title" style={{ marginTop: 0 }}>{c.label}</div>
            {c.headlines.map((h) => <div key={h} style={{ fontSize: 17, lineHeight: 1.9 }}>{h}</div>)}
            <ChartGrid grid={c.grid} />
            <p className="muted" style={{ margin: "8px 0 12px" }}>
              表格由上而下為南、中、北，由左而右為東、中、西（洛書方位）。每格順序：宮 八神 九星 八門 天盤干 地盤干。
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 16 }}>
                <input type="radio" name={c.id} checked={a.match === true} onChange={() => setAnswers({ ...answers, [c.id]: { match: true, note: "" } })} />
                與我的盤完全一致
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 16 }}>
                <input type="radio" name={c.id} checked={a.match === false} onChange={() => setAnswers({ ...answers, [c.id]: { match: false, note: a.note } })} />
                有差異
              </label>
              {a.match === false && (
                <textarea
                  rows={3}
                  placeholder="哪一格不同？例如：離9 宮的八門應該是景門、不是傷門；或整張局數應為陰遁四局。"
                  value={a.note}
                  onChange={(e) => setAnswers({ ...answers, [c.id]: { match: false, note: e.target.value } })}
                  style={{ fontSize: 16 }}
                />
              )}
            </div>
          </div>
        );
      })}

      <div className="kpi-card" style={{ marginBottom: 18 }}>
        <div className="admin-form-grid">
          <label>校對人<input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} /></label>
        </div>
        <label style={{ display: "block", marginTop: 12 }}>
          備註（選填，例如你慣用的是哪一種定局法）
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%", fontSize: 16 }} />
        </label>
        <button className="admin-action-btn" style={{ marginTop: 14 }} disabled={saving || !answered || !signedBy.trim()} onClick={submit}>
          {saving ? "送出中⋯" : allMatch ? "三盤一致，簽核" : "送出校對結果（有差異，不簽核）"}
        </button>
        {!answered && <p className="muted" style={{ marginBottom: 0 }}>三張盤都要回報才能送出。</p>}
      </div>

      <FreeCast />

      <div className="admin-section-title">校對紀錄</div>
      {state.history.length === 0 && <p className="admin-empty">尚無紀錄</p>}
      {state.history.map((h) => (
        <div className="kpi-card" key={h.id} style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: 16, color: h.approved ? "var(--green)" : "#ffd166" }}>
            {h.approved ? "簽核通過" : "回報差異"}　{h.signed_by}　{new Date(h.created_at).toLocaleString("zh-TW")}
          </strong>
          <div className="muted">規則版本 {h.rule_version}</div>
          {h.case_results.filter((r) => !r.match).map((r) => (
            <div key={r.id} style={{ fontSize: 15, lineHeight: 1.8 }}>{r.label}：{r.note}</div>
          ))}
          {h.note && <div style={{ fontSize: 15, lineHeight: 1.8 }}>備註：{h.note}</div>}
        </div>
      ))}
    </>
  );
}

function ChartGrid({ grid }: { grid: string[][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", margin: "12px 0", tableLayout: "fixed" }}>
      <tbody>
        {grid.map((row, i) => (
          <tr key={i}>
            {row.map((cell) => (
              <td key={cell} style={{ border: "1px solid rgba(255,255,255,0.18)", padding: "12px 10px", fontSize: 16, lineHeight: 1.8, textAlign: "center", wordBreak: "keep-all" }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FreeCast() {
  const [t, setT] = useState({ year: 2026, month: 10, day: 8, hour: 10, minute: 0 });
  const [out, setOut] = useState<{ headlines: string[]; grid: string[][]; error: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const res = await adminFetch("/api/admin/qimen-review/preview", { method: "POST", body: JSON.stringify(t) });
      const data = await res.json();
      setOut(res.ok ? data : { headlines: [], grid: [], error: data?.error || "排盤失敗" });
    } finally {
      setBusy(false);
    }
  }
  const field = (k: keyof typeof t, label: string, min: number, max: number) => (
    <label>{label}
      <input type="number" min={min} max={max} value={t[k]} onChange={(e) => setT({ ...t, [k]: Number(e.target.value) })} />
    </label>
  );
  return (
    <div className="kpi-card" style={{ marginBottom: 18 }}>
      <div className="admin-section-title" style={{ marginTop: 0 }}>自選時間試排（選用）</div>
      <p className="muted" style={{ marginTop: -6 }}>想多驗幾個時間點，輸入起局時刻（台北時間）即可，不扣點、不會影響任何報告。</p>
      <div className="admin-form-grid">
        {field("year", "年", 1900, 2100)}{field("month", "月", 1, 12)}{field("day", "日", 1, 31)}{field("hour", "時", 0, 23)}{field("minute", "分", 0, 59)}
      </div>
      <button className="admin-action-btn ghost" style={{ marginTop: 12 }} disabled={busy} onClick={run}>{busy ? "排盤中⋯" : "排盤"}</button>
      {out?.error && <p style={{ color: "#ff8a8a" }}>這個時間排不出來：{out.error}</p>}
      {out && !out.error && (
        <div style={{ marginTop: 12 }}>
          {out.headlines.map((h) => <div key={h} style={{ fontSize: 17, lineHeight: 1.9 }}>{h}</div>)}
          <ChartGrid grid={out.grid} />
        </div>
      )}
    </div>
  );
}
