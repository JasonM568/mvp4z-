// 階段一：登陸頁（Landing）— 天機四象 · 順轉人生
// 3 秒內讓用戶理解「這是什麼、對我有什麼用、怎麼開始」；唯一主 CTA。

type MemberGateInfo = {
  showMemberGate: boolean;
  isGuest: boolean;
  planLabel: string;
};

export function LandingStep({
  gate,
  costHint,
  onStart
}: {
  gate: MemberGateInfo;
  costHint: string;
  onStart: () => void;
}) {
  return (
    <>
      <section className="xf-landing">
        <div className="wrap">
          <div className="xf-compass" aria-hidden>
            <div className="xf-compass-ring xf-compass-ring-outer" />
            <div className="xf-compass-ring xf-compass-ring-inner" />
            <div className="xf-compass-core">巽</div>
            <span className="xf-compass-mark xf-compass-mark-n">定</span>
            <span className="xf-compass-mark xf-compass-mark-e">觀</span>
            <span className="xf-compass-mark xf-compass-mark-s">測</span>
            <span className="xf-compass-mark xf-compass-mark-w">感</span>
          </div>
          <h1 className="xf-landing-title">四象問天機</h1>
          <p className="xf-landing-sub">
            命、局、卦、象，四術合參，一事定向。
          </p>
          <div className="xf-landing-cta">
            <button className="btn primary xf-cta-main" onClick={onStart}>
              🧭 開始問天機
            </button>
          </div>
          <p className="xf-landing-trust">四套古法交叉驗算・約需 2 分鐘</p>
          {costHint && <span className="badge xf-landing-cost">{costHint}</span>}
        </div>
      </section>

      {gate.showMemberGate && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <article
              className="panel"
              style={{
                borderColor: "rgba(210,169,84,.5)",
                background: "linear-gradient(180deg,rgba(210,169,84,.14),rgba(255,255,255,.03))"
              }}
            >
              <span
                className="badge"
                style={{ background: "rgba(210,169,84,.18)", borderColor: "rgba(210,169,84,.5)", color: "#ffe2a2" }}
              >
                會員專屬服務
              </span>
              <h2 style={{ fontSize: 26, lineHeight: 1.4, margin: "8px 0 10px" }}>
                {gate.isGuest
                  ? "四象問天機為會員專屬功能"
                  : `您目前的方案（${gate.planLabel}）尚未包含此功能`}
              </h2>
              <p className="lead" style={{ fontSize: 17 }}>
                {gate.isGuest
                  ? "本報告由風羿老師多維校核系統產製，需登入會員並具備可用點數才能啟動四象掃描。請先登入或註冊會員。"
                  : "四象問天機需基礎會員（含）以上方案，升級後即可生成四術合參的天機書。"}
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
                {gate.isGuest ? (
                  <>
                    <a className="btn primary" href="/login?next=/member-ai/decision">
                      登入會員
                    </a>
                    <a className="btn gold" href="/login?tab=register&next=/member-ai/decision">
                      免費註冊
                    </a>
                    <a className="btn" href="/member-pricing">
                      查看會員方案
                    </a>
                  </>
                ) : (
                  <>
                    <a className="btn primary" href="/member-pricing">
                      升級方案
                    </a>
                    <a className="btn" href="/member">
                      回會員中心
                    </a>
                  </>
                )}
              </div>
            </article>
          </div>
        </section>
      )}
    </>
  );
}
