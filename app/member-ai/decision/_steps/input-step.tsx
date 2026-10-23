// 階段二：問題輸入頁（Input）— 極簡三欄位＋進階摺疊
// 極簡區只問：問題／出生年月日時／性別；進階欄位收進摺疊區。
// 扣點 consent 紅線：啟動掃描前必須秀出扣點說明並勾選同意。

import { CreditsNotice } from "../../_credits-notice";
import { CastingPanel } from "./casting-panel";
import {
  birthPlaceOptions,
  calendarOptions,
  days,
  genderOptions,
  hourBranches,
  hours,
  meihuaLowerTrigrams,
  meihuaModes,
  meihuaMovingLines,
  meihuaUpperTrigrams,
  minutes,
  months,
  reportTemplates,
  topics,
  trigramOptions,
  suggestTopic,
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
  notice,
  creditsShortfall
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
  /** 點數看起來不夠時的提示資料。只提示不擋——最終仍由後端判定。 */
  creditsShortfall?: { required: number; remaining: number; shortfall: number; feature: string } | null;
}) {
  // 改任何一個出生欄位就視為已看過；預設值剛好就是本人時按「以上出生資料正確」。
  function setBirth<K extends keyof CouncilForm>(key: K, value: CouncilForm[K]) {
    update(key, value);
    update("birthConfirmed", true);
  }

  // 送出前還缺什麼：每一項都能點，直接帶到那個欄位。
  const castCount = form.castThrows.length;
  const checks: Array<{ id: string; label: string; ok: boolean }> = [
    { id: "councilQuestion", label: "你的問題", ok: form.question.trim().length >= 2 },
    { id: "councilTopic", label: "問題類型", ok: Boolean(form.topic) },
    { id: "councilBirth", label: "出生年月日時（確認過）", ok: form.birthConfirmed },
    ...(modules.bazi ? [{ id: "councilGender", label: "性別（八字排大運需要）", ok: form.gender === "男" || form.gender === "女" }] : []),
    ...(modules.liuyao ? [{ id: "councilCasting", label: `親手搖卦（${castCount}/6）`, ok: castCount >= 6 }] : []),
    ...(canUseCouncil ? [{ id: "councilConsent", label: "同意扣點規則", ok: agreed }] : [])
  ];
  const pending = checks.filter((item) => !item.ok);

  function jumpTo(id: string) {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = el?.querySelector<HTMLElement>("textarea, input, select, button");
    window.setTimeout(() => (id === "councilQuestion" ? (el as HTMLElement | null) : focusable)?.focus({ preventScroll: true }), 350);
  }

  function goNext() {
    const target = pending.find((item) => item.id !== "councilCasting") ?? pending[0];
    jumpTo(target ? target.id : "councilConsent");
  }

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

            <div className="form council-grid-2" style={{ marginTop: 16 }}>
              <label>
                案主姓名（選填）
                <input value={form.clientName} onChange={(e) => update("clientName", e.target.value)} placeholder="例如：王先生；不填也能生成" />
              </label>
              <label className="council-span-2">
                背景補充（選填）
                <textarea value={form.context} onChange={(e) => update("context", e.target.value)} rows={2} placeholder="補充目前狀況、卡點、時間壓力、相關人物。不填也能生成。" />
              </label>
            </div>

            <div className="form" id="councilTopic" style={{ marginTop: 16 }}>
              <div className="xf-field-label">
                問題類型<span className="xf-required">（請點選確認）</span>
              </div>
              {(() => {
                const suggested = suggestTopic(form.question);
                return (
                  <>
                    {suggested && form.topic !== suggested && (
                      <p style={{ color: "var(--muted)", fontSize: 13, margin: "4px 0 0" }}>
                        系統依你的問題建議「{suggested}」，請點選確認或改選其他類型。
                      </p>
                    )}
                    <div className="xf-topic-row">
                      {topics.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={"xf-topic-btn" + (form.topic === t ? " active" : "") + (suggested === t ? " suggested" : "")}
                          onClick={() => update("topic", t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="form" id="councilBirth" style={{ marginTop: 16 }}>
              <div className="xf-field-label">
                出生年月日時<span className="xf-required">（請確認，預設值不是你的資料）</span>
              </div>
              <div className="council-grid-5">
                <label>曆法<select value={form.calendarType} onChange={(e) => setBirth("calendarType", e.target.value)}>{calendarOptions.map((x) => <option key={x}>{x}</option>)}</select></label>
                <label>出生年<select value={form.birthYear} onChange={(e) => setBirth("birthYear", Number(e.target.value))}>{years.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                <label>出生月<select value={form.birthMonth} onChange={(e) => setBirth("birthMonth", Number(e.target.value))}>{months.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                <label>出生日<select value={form.birthDay} onChange={(e) => setBirth("birthDay", Number(e.target.value))}>{days.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
                <label>出生時辰<select value={form.birthHourBranch} onChange={(e) => setBirth("birthHourBranch", e.target.value)}>{hourBranches.map((x) => <option key={x[0]} value={x[0]}>{x[0]}｜{x[1]}</option>)}</select></label>
              </div>
              {form.birthConfirmed ? (
                <p className="xf-birth-ok">✓ 已確認出生資料</p>
              ) : (
                <button type="button" className="xf-birth-confirm" onClick={() => update("birthConfirmed", true)}>
                  ✓ 以上出生資料正確
                </button>
              )}
            </div>

            <div className="form" id="councilGender" style={{ marginTop: 16 }}>
              <div className="xf-field-label">
                性別{modules.bazi && <span className="xf-required">（八字必填）</span>}
              </div>
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
                <button
                  type="button"
                  className={"xf-gender-btn" + (form.gender === "不指定" ? " active" : "")}
                  onClick={() => update("gender", "不指定")}
                >
                  不指定
                </button>
              </div>
              {/* 「不指定」也要顯示：選了它一樣排不出大運，會員有權在送出前知道。 */}
              {form.gender !== "男" && form.gender !== "女" && modules.bazi && (
                <p className="xf-gender-hint">
                  大運的順排／逆排由性別決定（陽男陰女順、陰男陽女逆），
                  <strong>沒有選男或女就不會排大運</strong>。其餘四柱、十神與流年流月不受影響。
                </p>
              )}
              <p style={{ color: "var(--muted)", fontSize: 12, margin: "8px 0 0" }}>
                身分（企業主／考生等）現在是獨立欄位，與更多專業選項一起放在下方進階設定。
              </p>
            </div>

            {modules.liuyao && (
              <CastingPanel throws={form.castThrows} onChange={(next) => update("castThrows", next)} onNext={goNext} />
            )}
          </article>

          <details className="xf-advanced">
            <summary>進階設定（全部選填，不填也能生成）— 事件日期、事件方位與專業選項</summary>
            <div className="xf-advanced-body">
              <article className="panel">
                <h2>其他選填資料</h2>
                <div className="form council-grid-2">
                  <label>
                    性別
                    <select value={form.gender} onChange={(e) => update("gender", e.target.value)}>
                      {/* 若帶進來的值不在清單內（例如舊版的「企業主」），仍列出來，
                          不要讓使用者填過的資料在切到這一頁時被靜默換掉。 */}
                      {(genderOptions.includes(form.gender)
                        ? genderOptions
                        : [form.gender, ...genderOptions]
                      ).map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </label>
                  <label>
                    身分（選填）
                    <input
                      value={form.identity}
                      onChange={(e) => update("identity", e.target.value)}
                      placeholder="例如：企業主、考生、負責人"
                    />
                  </label>
                  <label>
                    報告模板
                    <select value={form.reportTemplate} onChange={(e) => update("reportTemplate", e.target.value)}>
                      {reportTemplates.map((x) => <option key={x}>{x}</option>)}
                    </select>
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

                <div className="form council-grid-2" style={{ marginBottom: 16 }}>
                  <label>
                    這件事有確切日期嗎？（選填）
                    <input type="date" value={form.eventDate} onChange={(e) => update("eventDate", e.target.value)} />
                  </label>
                </div>
                <p style={{ color: "var(--muted)", marginTop: -6, marginBottom: 16, fontSize: 13 }}>
                  日期只作為判讀背景，不用來起局。奇門、梅花與六爻一律使用你第一次搖卦的時刻。
                </p>

                {modules.qimen && (
                  <SubPanel title="奇門遁甲：事件方位（選填）">
                    <p style={{ color: "var(--muted)", margin: "0 0 12px", fontSize: 15, lineHeight: 1.75 }}>
                      你問的事情發生在哪個方向？或你想問的那個人、那個地點，在<b style={{ color: "var(--text)" }}>你家（或你現在所在的位置）的哪個方向</b>？
                      例如：想問「搬到南邊那間新辦公室好不好」就選「南」。方向可以用手機地圖或指南針確認。
                      不確定、或問題跟方向無關，<b style={{ color: "var(--text)" }}>就不用選</b>，不影響生成；選了會讓奇門判讀多看這個方向的宮位。
                    </p>
                    <div className="xf-dir-grid" role="radiogroup" aria-label="事件方位">
                      {(
                        [
                          ["西北", "↖"], ["北", "↑"], ["東北", "↗"],
                          ["西", "←"], null, ["東", "→"],
                          ["西南", "↙"], ["南", "↓"], ["東南", "↘"]
                        ] as const
                      ).map((cell) =>
                        cell === null ? (
                          <button
                            key="center"
                            type="button"
                            role="radio"
                            aria-checked={form.direction === "不確定"}
                            className={"xf-dir-btn center" + (form.direction === "不確定" ? " active" : "")}
                            onClick={() => update("direction", "不確定")}
                          >
                            <b>不確定</b>
                            <small>不選也可以</small>
                          </button>
                        ) : (
                          <button
                            key={cell[0]}
                            type="button"
                            role="radio"
                            aria-checked={form.direction === cell[0]}
                            className={"xf-dir-btn" + (form.direction === cell[0] ? " active" : "")}
                            onClick={() => update("direction", form.direction === cell[0] ? "不確定" : cell[0])}
                          >
                            <span className="xf-dir-arrow" aria-hidden>{cell[1]}</span>
                            <b>{cell[0]}</b>
                          </button>
                        )
                      )}
                    </div>
                    <p style={{ color: "var(--muted)", margin: "10px 0 0", fontSize: 13 }}>
                      目前選擇：{form.direction === "不確定" ? "不確定（不指定方向）" : form.direction}。畫面上方是北、右邊是東，和手機地圖一樣。
                    </p>
                    <p style={{ color: "var(--muted)", marginTop: 8, fontSize: 13 }}>
                      奇門起局時間：以你第一次搖卦的時刻起時家奇門。
                    </p>
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
                      <p style={{ color: "var(--muted)", marginTop: 12, fontSize: 13 }}>
                        以你第一次搖卦的時刻（農曆年支、月、日、時）自動起卦。
                      </p>
                    )}
                  </SubPanel>
                )}
              </article>
            </div>
          </details>

          <article className="panel xf-ready" id="councilReady">
            <h2 className="xf-ready-title">送出前檢查</h2>
            <ul className="xf-ready-list">
              {checks.map((item) => (
                <li key={item.id} className={item.ok ? "ok" : "todo"}>
                  <span aria-hidden>{item.ok ? "✓" : "○"}</span>
                  <span>{item.label}</span>
                  {!item.ok && (
                    <button type="button" onClick={() => jumpTo(item.id)}>
                      去填寫
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="xf-ready-hint">
              {pending.length === 0
                ? "都完成了，按下方「生成天機書」即可。"
                : `還差 ${pending.length} 項。案主姓名、背景補充與「進階設定」都是選填，不填也能生成。`}
            </p>
          </article>

          <article className="panel">
            {canUseCouncil && (
              <div className="consent-box" id="councilConsent">
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

            {/* 點數看起來不夠時，在按鈕正下方就先講清楚並給出口，
                不必等他按下去、跑完流程才被擋。
                刻意不停用按鈕：餘額是前端快取的值，萬一過時會把有點數的人鎖死，
                最終判定仍在後端。 */}
            {creditsShortfall && (
              <div style={{ marginTop: 16 }}>
                <CreditsNotice details={creditsShortfall} />
              </div>
            )}
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
