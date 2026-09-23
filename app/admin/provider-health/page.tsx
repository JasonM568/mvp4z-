"use client";

/**
 * 後台｜決策報告 AI 模型健康狀態。
 *
 * 這一頁要解決的是「看不見」：終稿只由 OpenAI 寫，所以 Gemini 或 DeepSeek 掛掉時
 * 報告照樣產得出來，只是從三家意見變兩家。會員付一樣的錢、拿到少一家意見的報告，
 * 畫面上卻沒有任何跡象。
 *
 * 刻意不只做寄信：這一頁不依賴 Resend 也能用。
 * 2026-09-23 這頁上線時正式站根本沒設 RESEND_API_KEY，全站 admin 告警
 * （含綠界付款異常）一封都沒寄出過而沒有人知道——只做寄信等於做了一個不會響的鈴。
 * 頁面底下的「寄一封測試告警給我」就是為了讓人隨時能證明鈴會響。
 */

import { useEffect, useState } from "react";
import { adminFetch } from "../_shell";

type WindowStat = { calls: number; failures: number; rate: number };

type Health = {
  role: string;
  label: string;
  level: "ok" | "warn" | "down";
  reason: string;
  day: WindowStat;
  week: WindowStat;
  month: WindowStat;
  lastFailureAt: string | null;
  topErrors: { error: string; count: number }[];
};

const LEVEL_TEXT: Record<Health["level"], { text: string; cls: string }> = {
  ok: { text: "正常", cls: "ok" },
  warn: { text: "注意", cls: "warn" },
  down: { text: "疑似不可用", cls: "error" }
};

function pct(s: WindowStat) {
  if (!s.calls) return "—";
  return `${(s.rate * 100).toFixed(1)}%`;
}

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" });
}

export default function ProviderHealthPage() {
  const [health, setHealth] = useState<Health[]>([]);
  const [sampleSize, setSampleSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    adminFetch("/api/admin/provider-health")
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) setError(d.error);
        else {
          setHealth(d?.health || []);
          setSampleSize(d?.sampleSize || 0);
        }
      })
      .catch((e) => setError(e?.message || "讀取失敗"))
      .finally(() => setLoading(false));
  }, []);

  const bad = health.filter((h) => h.level !== "ok");

  /**
   * 告警最糟的失敗方式是安靜地不運作——巽風的 admin 告警就這樣壞了不知道多久。
   * 所以要有一個「現在就證明鈴會響」的按鈕，而不是等真的出事時才發現它不響。
   * 只寄給按下去的人，不寄給全體管理員。
   */
  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await adminFetch("/api/admin/provider-health/test-alert", { method: "POST" });
      const d = await r.json();
      if (d?.ok) {
        setTestResult({ ok: true, text: `已寄出到 ${d.sentTo}。沒收到的話先看垃圾郵件。` });
      } else {
        // 把上游的實際回應原樣顯示。最常見的失敗是寄件網域還沒在 Resend 驗證，
        // 只寫「寄送失敗」會讓人往錯的方向查。
        const dl = d?.delivery;
        const why = [dl?.detail, dl?.reason, d?.error].filter(Boolean).join("　｜　");
        setTestResult({ ok: false, text: why || "寄送失敗，但上游沒有回傳原因。" });
      }
    } catch (e: any) {
      setTestResult({ ok: false, text: e?.message || "請求失敗" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <h1>報告模型健康狀態</h1>
      <p className="lead">
        每份決策報告會打 7 次 API：第一輪三家平行、第二輪攻防三家、終稿一次。
        <strong>終稿只由 OpenAI 寫</strong>，所以其他兩家失敗時報告仍然產得出來——
        只是從三家意見變兩家，而會員看不出任何差別。這一頁就是把那個差別顯示出來。
      </p>

      {error && <div className="status error">{error}</div>}
      {loading && <div className="status">讀取中…</div>}

      {!loading && !error && (
        <>
          {bad.length === 0 ? (
            <div className="status ok">三家都在門檻內。近 30 天共 {sampleSize} 次呼叫。</div>
          ) : (
            <div className="status warn">
              {bad.map((h) => h.label.split("｜")[0]).join("、")} 需要注意。近 30 天共 {sampleSize} 次呼叫。
            </div>
          )}

          <div className="admin-table-wrap" style={{ marginTop: 16 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>模型｜角色</th>
                  <th>狀態</th>
                  <th>24 小時</th>
                  <th>七日</th>
                  <th>三十日</th>
                  <th>最後一次失敗</th>
                </tr>
              </thead>
              <tbody>
                {health.map((h) => (
                  <tr key={h.role}>
                    <td>{h.label}</td>
                    <td>
                      <span className={`status ${LEVEL_TEXT[h.level].cls}`} style={{ margin: 0 }}>
                        {LEVEL_TEXT[h.level].text}
                      </span>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{h.reason}</div>
                    </td>
                    <td>{h.day.failures}/{h.day.calls}　{pct(h.day)}</td>
                    <td>{h.week.failures}/{h.week.calls}　{pct(h.week)}</td>
                    <td>{h.month.failures}/{h.month.calls}　{pct(h.month)}</td>
                    <td>{when(h.lastFailureAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {health.some((h) => h.topErrors.length > 0) && (
            <>
              <h2 style={{ marginTop: 28 }}>近 30 天的失敗原因</h2>
              {health
                .filter((h) => h.topErrors.length > 0)
                .map((h) => (
                  <div key={h.role} style={{ marginTop: 12 }}>
                    <strong>{h.label}</strong>
                    <ul style={{ marginTop: 6, lineHeight: 1.8 }}>
                      {h.topErrors.map((e) => (
                        <li key={e.error}>
                          {e.error}　<span className="muted">（{e.count} 次）</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </>
          )}

          <h2 style={{ marginTop: 28 }}>關於告警信</h2>
          <p className="muted" style={{ lineHeight: 1.9 }}>
            每天台灣時間 09:10 有一支排程掃這份資料，越過門檻才寄信給管理員，全綠就安靜。
            告警最糟的失敗方式是<strong>安靜地不運作</strong>——所以與其相信它會響，
            不如現在就按一次確認。測試信只會寄給你一個人，不會吵到其他管理員。
          </p>
          <button className="admin-action-btn" type="button" onClick={sendTest} disabled={testing}>
            {testing ? "寄送中…" : "寄一封測試告警給我"}
          </button>
          {testResult && (
            <div className={`status ${testResult.ok ? "ok" : "error"}`} style={{ marginTop: 10 }}>
              {testResult.text}
            </div>
          )}
        </>
      )}
    </>
  );
}
