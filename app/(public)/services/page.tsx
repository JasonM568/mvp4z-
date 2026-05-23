import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "服務方案與價格｜巽風堪輿研究中心",
  description:
    "巽風堪輿研究中心服務方案與價格，包含陰陽宅堪驗、年度企業顧問、命名擇日、八字流年與課程講座。"
};

export default function ServicesPage() {
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="tag">SERVICES & PRICING</div>
              <h1 className="hero-title">
                <span className="title-line title-main">服務方案與價格</span>
                <span className="title-line accent">清楚分流</span>
                <span className="title-line accent">精準規劃</span>
              </h1>
            </div>
            <p className="section-desc">
              依服務類型、場域規模、需求急迫性與顧問深度安排方案；正式報價仍以實際需求確認後為準。
            </p>
          </div>
          <div className="grid-2" id="cmsPricing"></div>
        </div>
      </section>

      <section>
        <div className="wrap grid-2">
          <div className="panel">
            <h2>正式服務原則</h2>
            <p>
              線上 AI 與表單只做需求盤點，不取代現場堪驗。陽宅、陰宅、企業場域與重大決策，仍須由風羿老師本人親至現場評估。
            </p>
            <div className="actions">
              <a className="btn btn-primary" href="/booking">
                填寫預約表單
              </a>
              <a
                className="btn btn-ghost"
                data-link="line"
                href="#"
                target="_blank"
                rel="noreferrer"
              >
                LINE 詢問
              </a>
            </div>
          </div>
          <div className="panel">
            <h2>服務確認重點</h2>
            <div className="process-list">
              <div className="process-item">
                <div className="num">1</div>
                <div>
                  <strong>服務名稱</strong>
                  <br />
                  先釐清服務類型與實際需求。
                </div>
              </div>
              <div className="process-item">
                <div className="num">2</div>
                <div>
                  <strong>價格級距</strong>
                  <br />
                  依坪數、場域數量與服務深度確認報價。
                </div>
              </div>
              <div className="process-item">
                <div className="num">3</div>
                <div>
                  <strong>服務說明</strong>
                  <br />
                  將建議轉化為可執行的調整方向。
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
