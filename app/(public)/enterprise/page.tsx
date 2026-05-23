import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "年度企業顧問｜巽風堪輿研究中心",
  description:
    "巽風年度企業顧問協助企業檢視場域條件、動線配置、辦公環境與長期營運決策。"
};

export default function EnterprisePage() {
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="brand-anchor">
            <div>
              <div className="tag">ENTERPRISE ADVISORY</div>
              <h1 className="hero-title">
                <span className="title-line title-main">年度企業顧問</span>
                <span className="title-line accent">以場域管理</span>
                <span className="title-line accent">支援營運決策</span>
              </h1>
              <p className="lead">
                企業端真正需要的是風險降低、決策明確、組織狀態與營運節奏。巽風把傳統堪輿轉化為企業主看得懂、用得上的場域決策系統。
              </p>
              <div className="hero-actions">
                <a className="btn btn-primary" href="/booking">
                  索取企業方案
                </a>
                <a className="btn btn-ghost" data-link="email" href="#">
                  寄信詢問
                </a>
              </div>
            </div>
            <div className="panel">
              <div className="kpi">
                <strong>50,000 – 300,000</strong>
                <span>年度企業顧問級距</span>
              </div>
              <div className="kpi" style={{ marginTop: 14 }}>
                <strong>1.6億 → 3億</strong>
                <span>企業顧問案例紀錄</span>
              </div>
              <div className="kpi" style={{ marginTop: 14 }}>
                <strong>月 / 季 / 半年 / 年</strong>
                <span>可續約追蹤模型</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="tag">DELIVERABLES</div>
              <h2>企業顧問交付項目</h2>
            </div>
            <p className="section-desc">
              企業服務不能只談理氣，而要轉成董事長、總經理與主管聽得懂的管理語言。
            </p>
          </div>
          <div className="grid-4">
            <article className="card">
              <div className="icon">月</div>
              <h3>月度時運提醒</h3>
              <p>提供企業主與核心主管在當月應注意的節奏、風險與行動排序。</p>
            </article>
            <article className="card">
              <div className="icon">季</div>
              <h3>季度人力檢視</h3>
              <p>針對主管配置、人事互動與組織狀態進行策略性提醒。</p>
            </article>
            <article className="card">
              <div className="icon">半</div>
              <h3>半年場域複查</h3>
              <p>檢視辦公室、店面、工廠、倉儲或總部布局調整成果。</p>
            </article>
            <article className="card">
              <div className="icon">年</div>
              <h3>年度策略回顧</h3>
              <p>整理顧問紀錄，形成下一年度風水與決策節奏建議。</p>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}
