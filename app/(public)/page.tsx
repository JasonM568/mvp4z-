import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "四象問天機｜巽風堪輿研究中心",
  description:
    "命、局、卦、象，四術合參，一事定向。進入巽風四象問天機與面相民俗文化觀察系統。"
};

export default function HomePage() {
  return (
    <>
      <section className="hero home-oracle">
        <div className="wrap">
          <div className="brand-anchor">
            <div className="oracle-copy">
              <div className="oracle-kicker"><span>巽</span> 風羿老師・四術決策</div>
              <h1 className="hero-title">
                <span className="title-line title-main">
                  四象問天機
                </span>
                <span className="oracle-four">命 <i>・</i> 局 <i>・</i> 卦 <i>・</i> 象</span>
              </h1>
              <div className="oracle-motto">四術合參 <b>一事定向</b></div>
              <p className="lead">
                以八字觀命、奇門定局、六爻斷卦、梅花取象。四道術理彼此印證，為你正在面對的一件事辨明時機、局勢與行動方向。
              </p>
              <div className="hero-actions">
                <a className="btn btn-gold" href="/member-ai/decision" data-xf-event="home_start_four_aspects">
                  <span>開始問天機</span><span aria-hidden>→</span>
                </a>
                <a className="oracle-text-link" href="#four-methods" data-xf-event="home_learn_flow">先了解如何運作 ↓</a>
              </div>
              <p className="oracle-alt-entry">想從相貌文化開始？<a href="/member-ai/face">進入巽風面相系統</a></p>
              <div className="oracle-methods" aria-label="四術">
                <div><strong>命</strong><span>八字命理</span></div>
                <div><strong>局</strong><span>奇門遁甲</span></div>
                <div><strong>卦</strong><span>六爻占斷</span></div>
                <div><strong>象</strong><span>梅花易數</span></div>
              </div>
            </div>
            <div className="oracle-visual" aria-hidden="true">
              <div className="oracle-stars"><i /><i /><i /><i /><i /><i /></div>
              <div className="oracle-compass">
                <div className="oracle-ring oracle-ring-one"><span>乾</span><span>坎</span><span>艮</span><span>震</span></div>
                <div className="oracle-ring oracle-ring-two"><span>巽</span><span>離</span><span>坤</span><span>兌</span></div>
                <div className="oracle-core">
                  <small>一事</small>
                  <strong>定</strong>
                  <small>一向</small>
                </div>
              </div>
              <div className="oracle-seal">巽風<br />天機</div>
            </div>
          </div>
        </div>
      </section>

      <section className="oracle-explain-section" id="four-methods">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="tag">HOW FOUR METHODS ALIGN</div>
              <h2 className="section-title">四象如何合參</h2>
            </div>
            <p className="section-desc">不是把四種術數並排，而是讓四條判讀線互相印證、處理矛盾，最後收束成一個可執行方向。</p>
          </div>
          <div className="oracle-method-flow">
            <article><span>01</span><strong>命</strong><h3>八字觀承載</h3><p>理解個人節奏、資源條件與當下能否承擔。</p></article>
            <article><span>02</span><strong>局</strong><h3>奇門察局勢</h3><p>檢視時間、方位、人事與事件部署的互動。</p></article>
            <article><span>03</span><strong>卦</strong><h3>六爻斷變化</h3><p>找出事情的卡點、成敗條件與可能應期。</p></article>
            <article><span>04</span><strong>象</strong><h3>梅花取訊號</h3><p>從象意與變化提取觸發訊號及轉折提醒。</p></article>
          </div>
        </div>
      </section>

      <section className="oracle-book-section">
        <div className="wrap oracle-book-layout">
          <div className="oracle-book-cover" aria-hidden="true">
            <div className="oracle-book-border">
              <span>巽風</span>
              <strong>四象<br />天機書</strong>
              <small>命・局・卦・象</small>
            </div>
          </div>
          <div>
            <div className="tag">YOUR PERSONAL ORACLE BOOK</div>
            <h2 className="section-title">最後得到的，不只是一句吉凶</h2>
            <p className="lead">《巽風四象天機書》把四術合參結果整理成決策結論、四象共識、行動步驟、風險條件與停損提醒。</p>
            <ul className="oracle-deliverables">
              <li><strong>先看方向</strong><span>可進、可試行、暫緩、不建議或補資料後再判。</span></li>
              <li><strong>再看四象</strong><span>哪些訊號同向，哪些矛盾需要降權。</span></li>
              <li><strong>落到行動</strong><span>3 日、7 日、30 日可執行步驟與檢核標準。</span></li>
            </ul>
            <a className="btn btn-gold" href="/member-ai/decision">生成我的天機書</a>
          </div>
        </div>
      </section>

      <section className="oracle-topics-section">
        <div className="wrap">
          <div className="section-head">
            <div><div className="tag">ASK ONE CLEAR THING</div><h2 className="section-title">適合問什麼</h2></div>
            <p className="section-desc">一次聚焦一件具體事情，比問整體命運更容易得到可執行的方向。</p>
          </div>
          <div className="oracle-topic-grid">
            <a href="/member-ai/decision"><strong>事業選擇</strong><span>該留、該走，或先準備什麼？</span></a>
            <a href="/member-ai/decision"><strong>合作判斷</strong><span>能不能合作，風險在哪裡？</span></a>
            <a href="/member-ai/decision"><strong>時機拿捏</strong><span>現在推進，還是等待窗口？</span></a>
            <a href="/member-ai/decision"><strong>重大決策</strong><span>如何降低不可逆的代價？</span></a>
          </div>
        </div>
      </section>

      <section className="oracle-trust-section">
        <div className="wrap oracle-trust-grid">
          <div><span>01</span><strong>四術交叉校核</strong><p>資料不足會明確降權，不為了給答案而硬斷。</p></div>
          <div><span>02</span><strong>完成才扣點</strong><p>未通過交付門檻會依規則退回，不重複扣點。</p></div>
          <div><span>03</span><strong>老師可再覆核</strong><p>重大投資、法律、醫療與現場風水仍由專業確認。</p></div>
          <div><span>04</span><strong>隱私有邊界</strong><p>面相照片私密保存並依政策刪除，不作公開展示。</p></div>
        </div>
      </section>

      <section className="home-face-feature">
        <div className="wrap home-face-layout">
          <div className="home-face-symbol" aria-hidden="true"><span>相</span><i>觀形・察氣・讀勢</i></div>
          <div>
            <div className="tag">XUNFENG FACE CULTURE</div>
            <h2 className="section-title">另一種觀察入口：巽風面相</h2>
            <p className="lead">先免費檢查照片品質，確認清晰度、光線、角度與單一人臉；通過並再次確認後，才進入完整民俗文化觀察報告。</p>
            <div className="home-face-points"><span>品質檢查免費</span><span>完整報告 20 點</span><span>照片最長 24 小時刪除</span></div>
            <div className="actions">
              <a className="btn btn-primary" href="/member-ai/face" data-xf-event="home_start_face">開始品質檢查</a>
              <a className="btn btn-ghost" href="/member-ai/face/history">我的面相報告</a>
            </div>
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
          <div className="grid-3 oracle-system-grid">
            <article className="panel oracle-system-card oracle-system-primary">
              <div className="oracle-card-mark">象</div>
              <div className="tag">命・局・卦・象</div>
              <h3>四象問天機</h3>
              <p>命、局、卦、象，四術合參，一事定向。</p>
              <a className="btn btn-gold" href="/member-ai/decision">開始問天機</a>
            </article>
            <article className="panel oracle-system-card">
              <div className="oracle-card-mark">相</div>
              <div className="tag">觀形・察氣・讀勢</div>
              <h3>巽風面相系統</h3>
              <p>以正面照片進行品質檢查，產出可追溯的民俗文化觀察報告。</p>
              <a className="btn btn-primary" href="/member-ai/face">進入面相系統</a>
            </article>
            <article className="panel oracle-system-card">
              <div className="oracle-card-mark">師</div>
              <div className="tag">現場勘驗・專業覆核</div>
              <h3>風羿老師專業諮詢</h3>
              <p>重大決策、陰陽宅與企業場域，預約老師本人進一步評估。</p>
              <a className="btn btn-ghost" href="/booking" data-xf-event="home_book_teacher">預約專業諮詢</a>
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
