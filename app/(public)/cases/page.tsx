import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "案例實績｜巽風堪輿研究中心",
  description:
    "巽風堪輿研究中心案例實績，涵蓋陽宅場域、企業顧問、課程講座與品牌命名。"
};

export default function CasesPage() {
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="tag">CASE LIBRARY</div>
              <h1 className="hero-title">
                <span className="title-line title-main">案例實績</span>
                <span className="title-line accent">用現場成果</span>
                <span className="title-line accent">建立信任</span>
              </h1>
            </div>
            <p className="section-desc">
              以下案例涵蓋陽宅場域、企業顧問、課程講座與品牌命名，呈現巽風在不同情境下的實務判斷與顧問價值。
            </p>
          </div>
          <div className="case-track" id="cmsCases"></div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="tag">SERVICE PHOTOS</div>
              <h2>服務現場照片牆</h2>
            </div>
            <p className="section-desc">
              透過現場照片，呈現巽風堪輿在住宅、企業、陰宅、課程與實地勘驗中的真實工作樣貌。
            </p>
          </div>
          <div className="photo-track" id="cmsPhotos"></div>
          <div className="carousel-toolbar">
            <button
              className="carousel-btn"
              type="button"
              data-carousel-prev
            >
              上一張
            </button>
            <div className="carousel-status">
              <span id="carouselIndex">1</span> /{" "}
              <span id="carouselTotal">9</span>｜自動輪播 2.8 秒
            </div>
            <button
              className="carousel-btn"
              type="button"
              data-carousel-next
            >
              下一張
            </button>
          </div>
          <div className="actions">
            <a
              className="btn btn-primary"
              data-link="facebook"
              href="#"
              target="_blank"
              rel="noreferrer"
            >
              前往 Facebook 粉專看完整案例
            </a>
            <a className="btn btn-ghost" href="/booking">
              預約案例式諮詢
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
