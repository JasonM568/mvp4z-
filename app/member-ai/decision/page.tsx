"use client";

import "./decision.css";
import { useEffect, useMemo, useState } from "react";
import {
  baziModes,
  buildInitialForm,
  buildInitialModules,
  calendarOptions,
  days,
  eventYears,
  genderOptions,
  hourBranches,
  hours,
  liuyaoModes,
  meihuaLowerTrigrams,
  meihuaModes,
  meihuaUpperTrigrams,
  minutes,
  months,
  qimenModes,
  reportTemplates,
  reviewModes,
  topics,
  trigramOptions,
  yaoOptions,
  years,
  yesNoUncertain,
  yesNoUncertain2,
  type CouncilForm,
  type CouncilModules
} from "./_form-config";
import { buildCouncilPayload, runCouncilReport, getMemberToken, type CouncilApiResult } from "./_actions";

type MemberInfo = {
  plan: string;
  status: string;
  credits_remaining: number;
  tier?: { councilCost: number; monthlyFreeQuota: number; canUseCouncil: boolean };
};

export default function DecisionPage() {
  const [form, setForm] = useState<CouncilForm>(buildInitialForm);
  const [modules, setModules] = useState<CouncilModules>(buildInitialModules);
  const [tab, setTab] = useState<"report" | "json">("report");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState("");
  const [jsonPacket, setJsonPacket] = useState<any>(null);
  const [notice, setNotice] = useState("尚未生成報告。完成下方表單後按「生成綜合報告」。");
  const [member, setMember] = useState<MemberInfo | null>(null);

  useEffect(() => {
    const token = getMemberToken();
    if (!token) {
      setNotice("尚未登入，請先登入會員。");
      return;
    }
    fetch("/api/member/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d?.member) setMember(d.member as MemberInfo);
      })
      .catch(() => {});
  }, []);

  function update<K extends keyof CouncilForm>(key: K, value: CouncilForm[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function toggleModule(key: keyof CouncilModules) {
    const next = { ...modules, [key]: !modules[key] };
    if (!Object.values(next).some(Boolean)) return;
    setModules(next);
  }

  const payload = useMemo(() => buildCouncilPayload(form, modules), [form, modules]);
  const tier = member?.tier;
  const canUseCouncil = tier?.canUseCouncil ?? false;
  const costHint = useMemo(() => {
    if (!tier) return "";
    if (tier.monthlyFreeQuota > 0) {
      return `本方案月內前 ${tier.monthlyFreeQuota} 份免費，超過後每份 ${tier.councilCost} 點`;
    }
    return `本次將扣 ${tier.councilCost} 點`;
  }, [tier]);

  async function generate() {
    if (!form.question.trim()) {
      setNotice("請先輸入問題主軸。");
      return;
    }
    setLoading(true);
    setNotice("巽風多維校核中，約需 60～90 秒…");
    setReport("");
    setJsonPacket(null);

    const data: CouncilApiResult = await runCouncilReport(payload).catch((err) => ({
      error: err?.message || "送出失敗"
    }));

    if (data?.error) {
      setNotice(`系統提示：${data.error}`);
      setJsonPacket({ request: payload, error: data.error });
      setLoading(false);
      return;
    }

    const finalText = data?.final?.text || "未取得最終報告。";
    setReport(finalText);
    setJsonPacket({ request: payload, response: data });
    setNotice(
      data?.fallback_used
        ? "本次未通過交付門檻，已自動退回點數，回傳兜底交付稿。"
        : data?.free_quota_used
          ? "本次使用 VIP 月內免費額度，未扣點。"
          : `已扣 ${data?.credits_charged || 0} 點，剩餘 ${data?.member?.credits_remaining ?? "未知"} 點。`
    );
    if (data?.member) setMember(data.member as MemberInfo);
    setTab("report");
    setLoading(false);
  }

  function resetForm() {
    setReport("");
    setJsonPacket(null);
    setNotice("尚未生成報告。");
  }

  const currentContent = tab === "json" ? JSON.stringify(jsonPacket || payload, null, 2) : report || notice;

  async function copy() {
    await navigator.clipboard.writeText(currentContent);
  }

  function download() {
    const blob = new Blob([currentContent], { type: tab === "json" ? "application/json" : "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = tab === "json" ? "xunfeng-council-packet.json" : "xunfeng-council-report.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <header className="topbar">
        <div className="wrap nav">
          <a className="brand" href="/">
            <div className="mark">巽</div>
            <div>
              <strong>巽風堪輿</strong>
              <small>XUNFENG FIELD STRATEGY</small>
            </div>
          </a>
          <nav className="nav-actions">
            <a className="btn" href="/member-pricing">會員方案</a>
            <a className="btn" href="/login">登入</a>
            {member && (
              <span className="btn" style={{ pointerEvents: "none", opacity: 0.85 }}>
                {member.plan?.toUpperCase()} ｜ 剩 {member.credits_remaining} 點
              </span>
            )}
            <a className="btn primary" href="/member-ai">AI 會員版</a>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <div className="kicker">YIXUE DECISION COUNCIL</div>
          <h1>
            巽風易學決策報告
            <span className="accent">四術同步 × 多維校核 × 可交付顧問書</span>
          </h1>
          <p className="lead">
            結合八字、奇門遁甲、卜卦／六爻、梅花易數，由巽風多維校核系統內部攻防，輸出十段商業顧問報告，含 3／7／30 日行動方案與停損條件。
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 22, alignItems: "center" }}>
            {costHint && (
              <span className="badge" style={{ marginBottom: 0 }}>{costHint}</span>
            )}
            {!canUseCouncil && member && (
              <span className="badge" style={{ background: "rgba(210,169,84,.18)", borderColor: "rgba(210,169,84,.45)", color: "#ffdfa0", marginBottom: 0 }}>
                {member.plan?.toUpperCase()} 方案不含此功能，請升級至基礎會員以上
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap council-shell">
          <div style={{ display: "grid", gap: 22 }}>
            <article className="panel">
              <h2>一、共同資料</h2>
              <div className="form council-grid-2">
                <label>
                  案主姓名
                  <input value={form.clientName} onChange={(e) => update("clientName", e.target.value)} placeholder="例如：王先生" />
                </label>
                <label>
                  性別／身分
                  <select value={form.gender} onChange={(e) => update("gender", e.target.value)}>
                    {genderOptions.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </label>
                <label>
                  問題類型
                  <select value={form.topic} onChange={(e) => update("topic", e.target.value)}>
                    {topics.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </label>
                <label>
                  報告模板
                  <select value={form.reportTemplate} onChange={(e) => update("reportTemplate", e.target.value)}>
                    {reportTemplates.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </label>
                <label className="council-span-2">
                  問題主軸
                  <input value={form.question} onChange={(e) => update("question", e.target.value)} placeholder="例如：我今年是否適合投資？" />
                </label>
                <label className="council-span-2">
                  背景補充
                  <textarea value={form.context} onChange={(e) => update("context", e.target.value)} placeholder="補充目前狀況、卡點、時間壓力、相關人物、資金條件。" />
                </label>
              </div>
            </article>

            <article className="panel">
              <h2>二、出生年月日時</h2>
              <div className="form council-grid-4">
                <label>曆法<select value={form.calendarType} onChange={(e) => update("calendarType", e.target.value)}>{calendarOptions.map((x) => <option key={x}>{x}</option>)}</select></label>
                <label>出生年<select value={form.birthYear} onChange={(e) => update("birthYear", Number(e.target.value))}>{years.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                <label>出生月<select value={form.birthMonth} onChange={(e) => update("birthMonth", Number(e.target.value))}>{months.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                <label>出生日<select value={form.birthDay} onChange={(e) => update("birthDay", Number(e.target.value))}>{days.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                <label>出生時辰<select value={form.birthHourBranch} onChange={(e) => update("birthHourBranch", e.target.value)}>{hourBranches.map((x) => <option key={x[0]} value={x[0]}>{x[0]}｜{x[1]}</option>)}</select></label>
                <label>是否閏月<select value={form.isLeapMonth} onChange={(e) => update("isLeapMonth", e.target.value)}>{yesNoUncertain.map((x) => <option key={x}>{x}</option>)}</select></label>
                <label>時辰是否確定<select value={form.birthTimeKnown} onChange={(e) => update("birthTimeKnown", e.target.value)}>{yesNoUncertain2.map((x) => <option key={x}>{x}</option>)}</select></label>
                <label>策略校核層<select value={form.reviewMode} onChange={(e) => update("reviewMode", e.target.value)}>{reviewModes.map((x) => <option key={x}>{x}</option>)}</select></label>
              </div>
            </article>

            <article className="panel">
              <h2>三、四術專用介面</h2>
              <p style={{ color: "var(--muted)", marginTop: -8, marginBottom: 18 }}>勾選要啟用的術數模組，至少保留一項。</p>

              <div className="council-grid-4" style={{ marginBottom: 22 }}>
                {(
                  [
                    ["bazi", "八字命理", "依出生資料自動初判"],
                    ["qimen", "奇門遁甲", "部署／時機／方位"],
                    ["liuyao", "卜卦／六爻", "成敗／卡點／應期"],
                    ["meihua", "梅花易數", "象意／變化／提示"]
                  ] as const
                ).map(([key, title, desc]) => {
                  const active = modules[key as keyof CouncilModules];
                  return (
                    <button
                      key={key}
                      onClick={() => toggleModule(key as keyof CouncilModules)}
                      style={{
                        textAlign: "left",
                        padding: "16px 18px",
                        borderRadius: 20,
                        border: active ? "1px solid var(--green)" : "1px solid var(--line)",
                        background: active
                          ? "linear-gradient(180deg,rgba(111,240,180,.18),rgba(111,240,180,.06))"
                          : "rgba(255,255,255,.04)",
                        color: "var(--text)",
                        cursor: "pointer",
                        fontFamily: "inherit"
                      }}
                    >
                      <div style={{ fontWeight: 900, fontSize: 16, color: active ? "var(--green)" : "var(--text)" }}>{title}</div>
                      <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>{desc}</div>
                    </button>
                  );
                })}
              </div>

              <div className="form council-grid-5" style={{ marginBottom: 16 }}>
                <label>事件年<select value={form.eventYear} onChange={(e) => update("eventYear", Number(e.target.value))}>{eventYears.map((x) => <option key={x}>{x}</option>)}</select></label>
                <label>事件月<select value={form.eventMonth} onChange={(e) => update("eventMonth", Number(e.target.value))}>{months.map((x) => <option key={x}>{x}</option>)}</select></label>
                <label>事件日<select value={form.eventDay} onChange={(e) => update("eventDay", Number(e.target.value))}>{days.map((x) => <option key={x}>{x}</option>)}</select></label>
                <label>事件時<select value={form.eventHour} onChange={(e) => update("eventHour", Number(e.target.value))}>{hours.map((x) => <option key={x}>{x}</option>)}</select></label>
                <label>事件分<select value={form.eventMinute} onChange={(e) => update("eventMinute", Number(e.target.value))}>{minutes.map((x) => <option key={x}>{x}</option>)}</select></label>
              </div>

              {modules.bazi && (
                <SubPanel title="八字命理">
                  <label>判讀方式<select value={form.baziMode} onChange={(e) => update("baziMode", e.target.value)}>{baziModes.map((x) => <option key={x}>{x}</option>)}</select></label>
                </SubPanel>
              )}

              {modules.qimen && (
                <SubPanel title="奇門遁甲">
                  <div className="form council-grid-2">
                    <label>起局方式<select value={form.qimenTimeMode} onChange={(e) => update("qimenTimeMode", e.target.value)}>{qimenModes.map((x) => <option key={x}>{x}</option>)}</select></label>
                    <label>事件方位<select value={form.direction} onChange={(e) => update("direction", e.target.value)}>{trigramOptions.map((x) => <option key={x}>{x}</option>)}</select></label>
                  </div>
                </SubPanel>
              )}

              {modules.liuyao && (
                <SubPanel title="卜卦／六爻">
                  <div className="form council-grid-3">
                    <label>起卦方式<select value={form.liuyaoMode} onChange={(e) => update("liuyaoMode", e.target.value)}>{liuyaoModes.map((x) => <option key={x}>{x}</option>)}</select></label>
                    {(["yao1", "yao2", "yao3", "yao4", "yao5", "yao6"] as const).map((k, i) => (
                      <label key={k}>
                        {["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"][i]}
                        <select value={form[k]} onChange={(e) => update(k, e.target.value)}>{yaoOptions.map((x) => <option key={x}>{x}</option>)}</select>
                      </label>
                    ))}
                  </div>
                </SubPanel>
              )}

              {modules.meihua && (
                <SubPanel title="梅花易數">
                  <div className="form council-grid-3">
                    <label>起卦方式<select value={form.meihuaMode} onChange={(e) => update("meihuaMode", e.target.value)}>{meihuaModes.map((x) => <option key={x}>{x}</option>)}</select></label>
                    <label>上卦<select value={form.upperTrigram} onChange={(e) => update("upperTrigram", e.target.value)}>{meihuaUpperTrigrams.map((x) => <option key={x}>{x}</option>)}</select></label>
                    <label>下卦<select value={form.lowerTrigram} onChange={(e) => update("lowerTrigram", e.target.value)}>{meihuaLowerTrigrams.map((x) => <option key={x}>{x}</option>)}</select></label>
                  </div>
                </SubPanel>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
                <button className="btn primary" onClick={generate} disabled={loading || !canUseCouncil}>
                  {loading ? "校核中…" : "生成綜合報告"}
                </button>
                <button className="btn" onClick={resetForm}>重設</button>
              </div>
              {notice && (
                <div className={"status" + (loading ? "" : " ok")} style={{ marginTop: 14 }}>
                  {notice}
                </div>
              )}
            </article>
          </div>

          <aside className="council-output">
            <article className="panel">
              <h2>四、輸出中心</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                <button className={"btn" + (tab === "report" ? " primary" : "")} onClick={() => setTab("report")} style={{ padding: "10px 16px", minHeight: 38 }}>
                  正式報告
                </button>
                <button className={"btn" + (tab === "json" ? " primary" : "")} onClick={() => setTab("json")} style={{ padding: "10px 16px", minHeight: 38 }}>
                  JSON 資料包
                </button>
              </div>
              <pre
                style={{
                  background: "rgba(0,0,0,.32)",
                  border: "1px solid var(--line)",
                  borderRadius: 20,
                  padding: 18,
                  color: "var(--text)",
                  fontSize: 13,
                  lineHeight: 1.85,
                  whiteSpace: "pre-wrap",
                  minHeight: 520,
                  maxHeight: 680,
                  overflow: "auto",
                  margin: 0,
                  fontFamily: "inherit"
                }}
              >
                {currentContent}
              </pre>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                <button className="btn primary" onClick={copy} style={{ flex: 1, minHeight: 44 }}>複製內容</button>
                <button className="btn gold" onClick={download} style={{ flex: 1, minHeight: 44 }}>下載</button>
              </div>
            </article>
          </aside>
        </div>
      </section>
    </>
  );
}

function SubPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--line)", background: "rgba(255,255,255,.025)", borderRadius: 20, padding: 18, marginBottom: 14 }}>
      <div style={{ fontWeight: 900, color: "var(--green)", marginBottom: 12, letterSpacing: ".05em" }}>{title}</div>
      {children}
    </div>
  );
}
