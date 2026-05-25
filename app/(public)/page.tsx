import type { Metadata } from "next";
import { AiEntryButton } from "@/components/AiEntryButton";

export const metadata: Metadata = {
  title: "巽風堪輿研究中心｜風羿老師｜場域策略與風水顧問",
  description:
    "巽風堪輿研究中心提供陰陽宅堪驗、企業場域顧問、命名擇日、八字流年、課程講座與初步諮詢服務。"
};

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="brand-anchor">
            <div>
              <div className="tag">BRAND ANCHOR IMAGE</div>
              <h1 className="hero-title">
                <span className="title-line title-main" data-site="heroTitle">
                  巽風堪輿研究中心
                </span>
                <span className="title-line accent">以場域策略</span>
                <span className="title-line accent">重整人宅場運</span>
              </h1>
              <p className="lead" data-site="heroLead">
                以乾坤國寶、龍門八局、形家風水、命理與現代場域管理為核心，提供陰陽宅堪驗、年度企業顧問、命名擇日、八字流年、課程講座與 AI 初步諮詢。
              </p>
              <div className="hero-actions">
                <AiEntryButton variant="header" className="btn btn-primary ai-hero-primary" />
                <a className="btn btn-gold" href="/member-ai/decision">
                  易學決策報告
                </a>
                <a className="btn btn-ghost" href="/booking">
                  填寫預約表單
                </a>
                <a className="btn btn-ghost" href="/enterprise">
                  查看企業顧問
                </a>
              </div>
              <div className="brand-points">
                <div>品牌定位：傳統五術底蘊 × 現代頻率語彙 × 高端顧問信任感</div>
                <div>正式原則：重大風水決策仍須風羿老師本人親至現場評估</div>
                <div>服務策略：從線上初判、現場勘驗到長期顧問追蹤</div>
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

      <section className="ai-entry-section">
        <div className="wrap ai-entry-panel">
          <div>
            <div className="tag">AI FIRST STEP</div>
            <h2 className="section-title">
              <span className="title-line">先用 AI</span>
              <span className="title-line accent">整理你的問題</span>
            </h2>
            <p className="lead">
              不確定該問陽宅、命理、擇日還是企業場域？先用 AI 初步諮詢整理資料與問題方向，再決定是否預約風羿老師正式評估。
            </p>
          </div>
          <div className="ai-entry-actions">
            <AiEntryButton variant="header" className="btn btn-primary" />
            <a className="btn btn-ghost" href="/member-pricing">
              查看會員方案
            </a>
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
                <strong>AI</strong>
                <span>24H 初步諮詢</span>
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
