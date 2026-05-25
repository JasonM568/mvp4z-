import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "風羿老師 AI 初步諮詢｜巽風堪輿研究中心",
  description:
    "風羿老師 AI 初步諮詢為會員功能，需先註冊並啟用會員方案。"
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
            AI 初步諮詢為會員功能。請先建立會員並啟用方案，系統才會開放問答入口；正式結論仍需由風羿老師本人依資料與現場條件進一步判斷。
          </p>
        </div>

        <div className="grid-2">
          <article className="panel ai-safe-box">
            <div className="ai-status">會員限定</div>
            <h2>完成會員註冊後使用 AI 初步諮詢</h2>
            <p>
              這個功能會消耗會員點數，因此需要登入會員並啟用方案。尚未註冊者可先建立帳號；已註冊但尚未啟用者，可到會員方案頁完成付款開通。
            </p>
            <div className="actions">
              <a
                className="btn btn-primary"
                href="/login?tab=register&next=/member-ai"
              >
                建立會員帳號
              </a>
              <a className="btn btn-ghost" href="/member-pricing">
                查看會員方案
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
