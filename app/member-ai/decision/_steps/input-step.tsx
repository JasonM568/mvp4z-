// 階段二：問題輸入頁（Input）— 極簡三欄位＋進階摺疊
// 極簡區只問：問題／出生年月日時／性別；34 個專業欄位原樣收進「進階設定」摺疊區。
// 扣點 consent 紅線：啟動掃描前必須秀出扣點說明並勾選同意。

import {
  baziModes,
  birthPlaceOptions,
  calendarOptions,
  days,
  eventYears,
  genderOptions,
  hourBranches,
  hours,
  liuyaoModes,
  meihuaLowerTrigrams,
  meihuaModes,
  meihuaMovingLines,
  meihuaTimeModes,
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
} from "../_form-config";

export function InputStep({
  form,
  modules,
  update,
  toggleModule,
  showMemberGate,
  canUseCouncil,
  councilCost,
  agreed,
  setAgreed,
  generateLabel,
  generateDisabled,
  onGenerate,
  notice
}: {
  form: CouncilForm;
  modules: CouncilModules;
  update: <K extends keyof CouncilForm>(key: K, value: CouncilForm[K]) => void;
  toggleModule: (key: keyof CouncilModules) => void;
  showMemberGate: boolean;
  canUseCouncil: boolean;
  councilCost: number;
  agreed: boolean;
  setAgreed: (v: boolean) => void;
  generateLabel: string;
  generateDisabled: boolean;
  onGenerate: () => void;
  notice: string;
}) {
  return (
    <section className="section" style={{ paddingTop: 26 }}>
      <div className="wrap">
        <div className="xf-step-hint">步驟 1/3：說出你的困局</div>

        <div
          aria-disabled={showMemberGate}
          style={{
            display: "grid",
            gap: 22,
            ...(showMemberGate
              ? { opacity: 0.45, pointerEvents: "none" as const, userSelect: "none" as const }
              : {})
          }}
        >
          {showMemberGate && (
            <div
              style={{
                background: "rgba(210,169,84,.14)",
                border: "1px solid rgba(210,169,84,.5)",
                borderRadius: 14,
                padding: "12px 16px",
                color: "#ffe2a2",
                fontWeight: 700
              }}
            >
              🔒 此功能為會員專屬，請先登入會員後再填寫。
            </div>
          )}

          <article className="panel">
            <h2 className="xf-input-title">說說你現在卡在哪裡</h2>
            <div className="form" style={{ marginTop: 14 }}>
              <label>
                你的問題
                <textarea
                  id="councilQuestion"
                  value={form.question}
                  onChange={(e) => update("question", e.target.value)}
                  placeholder="例如：「我該不該換工作？」或「這段感情該繼續嗎？」"
                  rows={3}
                />
              </label>
            </div>

            <div className="form" style={{ marginTop: 16 }}>
              <div className="xf-field-label">出生年月日時</div>
              <div className="council-grid-5">
                <label>曆法<select value={form.calendarType} onChange={(e) => update("calendarType", e.target.value)}>{calendarOptions.map((x) => <option key={x}>{x}</option>)}</select></label>
                <label>出生年<select value={form.birthYear} onChange={(e) => update("birthYear", Number(e.target.value))}>{years.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                <label>出生月<select value={form.birthMonth} onChange={(e) => update("birthMonth", Number(e.target.value))}>{months.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                <label>出生日<select value={form.birthDay} onChange={(e) => update("birthDay", Number(e.target.value))}>{days.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                <label>出生時辰<select value={form.birthHourBranch} onChange={(e) => update("birthHourBranch", e.target.value)}>{hourBranches.map((x) => <option key={x[0]} value={x[0]}>{x[0]}｜{x[1]}</option>)}</select></label>
              </div>
            </div>

            <div className="form" style={{ marginTop: 16 }}>
              <div className="xf-field-label">性別</div>
              <div className="xf-gender-row">
                {(["男", "女"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={"xf-gender-btn" + (form.gender === g ? " active" : "")}
                    onClick={() => update("gender", g)}
                  >
                    {g === "男" ? "♂ 男" : "♀ 女"}
                  </button>
                ))}
                {!["男", "女"].includes(form.gender) && (
                  <span className="badge" style={{ marginBottom: 0 }}>{form.gender}</span>
                )}
              </div>
              <p style={{ color: "var(--muted)", fontSize: 12, margin: "8px 0 0" }}>
                其他身分（企業主／考生等）與更多專業選項，請展開下方進階設定。
              </p>
            </div>
          </article>

          <details className="xf-advanced">
            <summary>進階設定（選填）— 案主資料、事件時間與四術專業介面</summary>
            <div className="xf-advanced-body">
              <article className="panel">
                <h2>共同資料</h2>
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
                    背景補充
                    <textarea value={form.context} onChange={(e) => update("context", e.target.value)} placeholder="補充目前狀況、卡點、時間壓力、相關人物、資金條件。" />
                  </label>
                </div>
              </article>

              <article className="panel">
                <h2>出生資料補充</h2>
                <p style={{ color: "var(--muted)", marginTop: -8, marginBottom: 18 }}>
                  以下皆為選填。填得越精確，四柱與時柱的判定越準；出生地用於真太陽時校正，
                  對出生在時辰交界前後的個案影響最明顯。
                </p>
                <div className="form council-grid-4">
                  <label>是否閏月<select value={form.isLeapMonth} onChange={(e) => update("isLeapMonth", e.target.value)}>{yesNoUncertain.map((x) => <option key={x}>{x}</option>)}</select></label>
                  <label>時辰是否確定<select value={form.birthTimeKnown} onChange={(e) => update("birthTimeKnown", e.target.value)}>{yesNoUncertain2.map((x) => <option key={x}>{x}</option>)}</select></label>
                  <label>出生地<select value={form.birthPlace} onChange={(e) => update("birthPlace", e.target.value)}>{birthPlaceOptions.map((x) => <option key={x}>{x}</option>)}</select></label>
                  <label>策略校核層<select value={form.reviewMode} onChange={(e) => update("reviewMode", e.target.value)}>{reviewModes.map((x) => <option key={x}>{x}</option>)}</select></label>
                </div>
                <div className="form council-grid-4">
                  <label>
                    出生時（選填）
                    <select value={form.birthHour} onChange={(e) => update("birthHour", e.target.value)}>
                      <option value="">不確定</option>
                      {hours.map((h) => <option key={h} value={String(h)}>{String(h).padStart(2, "0")} 時</option>)}
                    </select>
                  </label>
                  <label>
                    出生分（選填）
                    <select value={form.birthMinute} onChange={(e) => update("birthMinute", e.target.value)}>
                      <option value="">不確定</option>
                      {minutes.map((m) => <option key={m} value={String(m)}>{String(m).padStart(2, "0")} 分</option>)}
                    </select>
                  </label>
                </div>
              </article>

              <article className="panel">
                <h2>四術專用介面</h2>
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
                    </div>

                    {form.meihuaMode === "數字起卦" && (
                      <>
                        <p style={{ color: "var(--muted)", margin: "12px 0 8px", fontSize: 13 }}>
                          請輸入三組三位數數字，系統依先天八卦數換算：第一組取上卦、第二組取下卦、第三組取動爻。
                        </p>
                        <div className="form council-grid-3">
                          <label>第一組數字（上卦）<input inputMode="numeric" maxLength={3} placeholder="例如 358" value={form.meihuaNum1} onChange={(e) => update("meihuaNum1", e.target.value.replace(/\D/g, ""))} /></label>
                          <label>第二組數字（下卦）<input inputMode="numeric" maxLength={3} placeholder="例如 624" value={form.meihuaNum2} onChange={(e) => update("meihuaNum2", e.target.value.replace(/\D/g, ""))} /></label>
                          <label>第三組數字（動爻）<input inputMode="numeric" maxLength={3} placeholder="例如 197" value={form.meihuaNum3} onChange={(e) => update("meihuaNum3", e.target.value.replace(/\D/g, ""))} /></label>
                        </div>
                      </>
                    )}

                    {form.meihuaMode === "上下卦起卦" && (
                      <div className="form council-grid-3" style={{ marginTop: 12 }}>
                        <label>上卦<select value={form.upperTrigram} onChange={(e) => update("upperTrigram", e.target.value)}>{meihuaUpperTrigrams.map((x) => <option key={x}>{x}</option>)}</select></label>
                        <label>下卦<select value={form.lowerTrigram} onChange={(e) => update("lowerTrigram", e.target.value)}>{meihuaLowerTrigrams.map((x) => <option key={x}>{x}</option>)}</select></label>
                        <label>動爻<select value={form.meihuaMovingLine} onChange={(e) => update("meihuaMovingLine", e.target.value)}>{meihuaMovingLines.map((x) => <option key={x}>{x}</option>)}</select></label>
                      </div>
                    )}

                    {form.meihuaMode === "時間起卦" && (
                      <>
                        <div className="form council-grid-3" style={{ marginTop: 12 }}>
                          <label>時間依據<select value={form.meihuaTimeMode} onChange={(e) => update("meihuaTimeMode", e.target.value)}>{meihuaTimeModes.map((x) => <option key={x}>{x}</option>)}</select></label>
                        </div>
                        {form.meihuaTimeMode === "現在時間" ? (
                          <p style={{ color: "var(--muted)", marginTop: 8, fontSize: 13 }}>
                            以送出當下時間自動起卦，系統依時間推算上下卦與動爻。
                          </p>
                        ) : (
                          <>
                            <p style={{ color: "var(--muted)", margin: "8px 0", fontSize: 13 }}>
                              請輸入要起卦的時間，系統依此時間推算上下卦與動爻。
                            </p>
                            <div className="form council-grid-5">
                              <label>年<select value={form.eventYear} onChange={(e) => update("eventYear", Number(e.target.value))}>{eventYears.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                              <label>月<select value={form.eventMonth} onChange={(e) => update("eventMonth", Number(e.target.value))}>{months.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                              <label>日<select value={form.eventDay} onChange={(e) => update("eventDay", Number(e.target.value))}>{days.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                              <label>時<select value={form.eventHour} onChange={(e) => update("eventHour", Number(e.target.value))}>{hours.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                              <label>分<select value={form.eventMinute} onChange={(e) => update("eventMinute", Number(e.target.value))}>{minutes.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </SubPanel>
                )}
              </article>
            </div>
          </details>

          <article className="panel">
            {canUseCouncil && (
              <div className="consent-box">
                <p className="consent-rule">
                  扣點規則：每生成一份《巽風四象天機書》，將扣 <strong>{councilCost} 點</strong>。天機書生成後即扣點（未通過交付門檻會自動退回）。
                </p>
                <label className="consent-check">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> 已閱讀並同意扣點規則
                </label>
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: canUseCouncil ? 18 : 0 }}>
              <button className="btn primary xf-cta-main" onClick={onGenerate} disabled={generateDisabled}>
                {generateLabel}
              </button>
            </div>
            {notice && <div className="status ok" style={{ marginTop: 14 }}>{notice}</div>}
          </article>
        </div>
      </div>
    </section>
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
