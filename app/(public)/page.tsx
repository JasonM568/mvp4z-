import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "四象問天機｜巽風堪輿研究中心",
  description:
    "命、局、卦、象，四術合參，一事定向。進入巽風四象問天機與面相民俗文化觀察系統。"
};

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="brand-anchor">
            <div>
              <h1 className="hero-title">
                <span className="title-line title-main">
                  四象問天機
                </span>
                <span className="title-line accent">命・局・卦・象</span>
                <span className="title-line accent">四術合參・一事定向</span>
              </h1>
              <p className="lead">
                以八字觀命、奇門定局、六爻斷卦、梅花取象，將四術結果交叉合參，為你當下的一件事找出方向，生成《巽風四象天機書》。
              </p>
              <div className="hero-actions">
                <a className="btn btn-gold" href="/member-ai/decision">
                  開始問天機
                </a>
                <a className="btn btn-ghost" href="/member-ai/face">
                  進入面相系統
                </a>
                <a className="btn btn-ghost" href="/enterprise">
                  查看企業顧問
                </a>
              </div>
              <div className="brand-points">
                <div>四象問天機：命、局、卦、象四術合參</div>
                <div>面相系統：正面影像品質檢查與民俗文化觀察</div>
                <div>專業服務：重大決策與現場風水仍由風羿老師覆核</div>
              </div>
            </div>
            <img
              data-image="brandAnchor"
              src="/assets/brand-anchor.jpg"
              alt="巽風堪輿研究中心品牌主視覺鎮山母圖"
            />
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="tag">XUNFENG DIGITAL SYSTEMS</div>
              <h2 className="section-title">巽風數位易學系統</h2>
            </div>
            <p className="section-desc">選擇你要進入的專業系統。</p>
          </div>
          <div className="grid-3">
            <article className="panel">
              <div className="tag">FOUR METHODS</div>
              <h3>四象問天機</h3>
              <p>命、局、卦、象，四術合參，一事定向。</p>
              <a className="btn btn-gold" href="/member-ai/decision">開始問天機</a>
            </article>
            <article className="panel">
              <div className="tag">FACE CULTURE</div>
              <h3>巽風面相系統</h3>
              <p>以正面照片進行品質檢查，產出可追溯的民俗文化觀察報告。</p>
              <a className="btn btn-primary" href="/member-ai/face">進入面相系統</a>
            </article>
            <article className="panel">
              <div className="tag">FENG YI CONSULTING</div>
              <h3>風羿老師專業諮詢</h3>
              <p>重大決策、陰陽宅與企業場域，預約老師本人進一步評估。</p>
              <a className="btn btn-ghost" href="/booking">預約專業諮詢</a>
            </article>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap hero-grid">
          <div>
            <div className="tag">FENG YI MASTER</div>
            <h2 className="section-title">
              <span className="title-line">從品牌母圖出發</span>
              <span className="title-line accent">落地每一個現場決策</span>
            </h2>
            <p className="lead">
              風羿老師將傳統堪輿轉譯成客戶聽得懂、企業用得上的決策語言。不是只談吉凶，而是把空間風險、營運節奏、品牌命名與人事配置轉成可執行方案。
            </p>
            <div className="kpi-grid">
              <div className="kpi">
                <strong>LINE</strong>
                <span>官方帳號預約諮詢</span>
              </div>
              <div className="kpi">
                <strong>22K+</strong>
                <span>陰陽宅現場堪驗</span>
              </div>
              <div className="kpi">
                <strong>300K</strong>
                <span>年度企業顧問上限級距</span>
              </div>
            </div>
          </div>
          <div className="hero-photo">
            <img
              data-image="fengyi"
              src="/assets/fengyi-hero.jpg"
              alt="風羿老師主視覺形象照"
            />
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="tag">SERVICE PORTFOLIO</div>
              <h2 className="section-title">
                <span className="title-line">服務項目</span>
                <span className="title-line accent">依需求精準規劃</span>
              </h2>
            </div>
            <p className="section-desc">
              依住宅、企業、命名、擇日與課程需求，提供清楚分流與初步服務級距。
            </p>
          </div>
          <div className="grid-3" id="cmsServices"></div>
          <div className="actions">
            <a className="btn btn-primary" href="/services">
              查看服務與價格
            </a>
            <a className="btn btn-ghost" href="/booking">
              直接預約
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
