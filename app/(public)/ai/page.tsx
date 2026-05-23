import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "風羿老師 AI 初步諮詢｜巽風堪輿研究中心",
  description:
    "風羿老師 AI 初步諮詢入口。若 ChatGPT 分身尚未完成公開設定，請先透過 LINE 預約，巽風堪輿研究中心將協助安排後續諮詢。"
};

export default function AiPage() {
  return (
    <section className="hero">
      <div className="wrap">
        <div className="section-head">
          <div>
            <div className="tag">AI CONSULTATION</div>
            <h1 className="hero-title">
              <span className="title-line title-main">風羿老師 AI</span>
              <span className="title-line title-main">初步諮詢</span>
              <span className="title-line accent">先釐清問題</span>
              <span className="title-line accent">再安排評估</span>
            </h1>
          </div>
          <p className="section-desc">
            AI 可協助初步整理風水、命理、命名、擇日與場域管理問題；正式結論仍需由風羿老師本人依資料與現場條件進一步判斷。
          </p>
        </div>

        <div className="grid-2">
          <article className="panel ai-safe-box">
            <div className="ai-status">目前建議：先透過 LINE 啟動諮詢</div>
            <h2>避免客戶點到 404，AI 分身公開前先導入 LINE</h2>
            <p>
              ChatGPT 分身若尚未完成公開權限設定，客戶直接點擊可能出現 404。正式上線期間，建議先透過 LINE 收件，由巽風端確認需求後，再導入 AI 或真人諮詢流程。
            </p>
            <div className="actions">
              <a
                className="btn btn-primary"
                data-link="line"
                href="https://lin.ee/W88wwDB"
                target="_blank"
                rel="noreferrer"
              >
                加入 LINE 預約諮詢
              </a>
              <a className="btn btn-ghost" href="/booking">
                填寫預約表單
              </a>
            </div>
          </article>

          <article className="panel">
            <h2>適合先問 AI 的問題</h2>
            <div className="process-list">
              <div className="process-item">
                <div className="num">1</div>
                <div>
                  <strong>陽宅初判</strong>
                  <br />
                  坐向、門位、明堂、動線與居住者狀態。
                </div>
              </div>
              <div className="process-item">
                <div className="num">2</div>
                <div>
                  <strong>命理方向</strong>
                  <br />
                  八字五行、流年節奏、命名與行業方向。
                </div>
              </div>
              <div className="process-item">
                <div className="num">3</div>
                <div>
                  <strong>企業場域</strong>
                  <br />
                  辦公室、店面、廠房與年度顧問需求。
                </div>
              </div>
              <div className="process-item">
                <div className="num">4</div>
                <div>
                  <strong>正式評估</strong>
                  <br />
                  需要現場勘驗者，請透過 LINE 或表單預約。
                </div>
              </div>
            </div>
          </article>
        </div>

        <div className="ai-notice" style={{ marginTop: 22 }}>
          AI 僅作初步諮詢與問題整理，不取代正式堪輿、命理與現場評估。涉及重大居住、投資、企業或祖先墓園決策，仍需由風羿老師本人親至現場評估。
        </div>
      </div>
    </section>
  );
}
