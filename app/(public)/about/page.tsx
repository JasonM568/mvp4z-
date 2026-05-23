import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "關於巽風堪輿研究中心｜風羿老師",
  description: "了解巽風堪輿研究中心與風羿老師。"
};

export default function AboutPage() {
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <div className="tag">ABOUT XUNFENG</div>
            <h1 className="hero-title">
              <span className="title-line title-main">關於巽風</span>
              <span className="title-line accent">傳統堪輿</span>
              <span className="title-line accent">現代決策語言</span>
            </h1>
            <p className="lead">
              巽風堪輿研究中心以乾坤國寶、龍門八局、形家、八宅、命理與現代頻率思維為基礎，將傳統理法轉化為企業與個人都能理解的場域風險管理。
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="/booking">
                預約諮詢
              </a>
              <a
                className="btn btn-ghost"
                data-link="ai"
                href="/ai"
                target="_blank"
                rel="noreferrer"
              >
                使用 AI 初步諮詢
              </a>
            </div>
          </div>
          <div className="hero-photo">
            <img
              data-image="fengyi"
              src="/assets/fengyi-hero.jpg"
              alt="風羿老師"
            />
          </div>
        </div>
      </section>

      <section>
        <div className="wrap grid-3">
          <article className="card">
            <div className="icon">根</div>
            <h3>傳統理法為根</h3>
            <p>以乾坤國寶、龍門八局、形家與命理作為判準，不以流行話術取代專業。</p>
          </article>
          <article className="card">
            <div className="icon">場</div>
            <h3>現代場域為用</h3>
            <p>將方位、格局、動線、採光、壓迫與人事條件轉化為風險與資源配置。</p>
          </article>
          <article className="card">
            <div className="icon">策</div>
            <h3>顧問交付為本</h3>
            <p>重點不是玄而又玄，而是讓客戶知道問題在哪、如何調整、如何追蹤。</p>
          </article>
        </div>
      </section>
    </>
  );
}
