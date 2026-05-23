import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "課程講座｜巽風堪輿研究中心",
  description:
    "巽風堪輿研究中心提供風水、命理、場域管理與傳統智慧現代應用之課程講座。"
};

const FORCE_HIDE_GALLERY_CSS = `
  /* V4 強制清除：課程新推廣區只保留主輪播，不顯示下方排開海報 */
  .course-promo-section .promo-gallery,
  #zzjStaticFallback .promo-gallery,
  #cmsCoursePromo + .promo-gallery,
  .promo-gallery[aria-label*="課程"],
  .promo-gallery[aria-label*="掌中訣"] {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    overflow: hidden !important;
    padding: 0 !important;
    margin: 0 !important;
  }
`;

const REMOVE_FALLBACK_JS = `
(function removeFallbackWhenPromoLoaded(){
  setTimeout(function(){
    var dynamic = document.querySelector('#cmsCoursePromo .course-promo-card');
    var fallback = document.getElementById('zzjStaticFallback');
    if(dynamic && fallback) fallback.remove();
  }, 800);
})();
`;

const STATIC_CAROUSEL_JS = `
(function initStaticCoursePosterCarousel(){
  function run(){
    document.querySelectorAll('[data-course-promo-carousel]').forEach(function(carousel){
      if(carousel.dataset.ready === '1') return;
      carousel.dataset.ready = '1';
      var imgs = Array.prototype.slice.call(carousel.querySelectorAll('.promo-carousel-img'));
      var dots = Array.prototype.slice.call(carousel.querySelectorAll('.promo-carousel-dots button'));
      if(imgs.length <= 1) return;
      var index = 0;
      function show(next){
        index = (next + imgs.length) % imgs.length;
        imgs.forEach(function(img, i){ img.classList.toggle('active', i === index); });
        dots.forEach(function(dot, i){ dot.classList.toggle('active', i === index); });
      }
      dots.forEach(function(dot, i){ dot.addEventListener('click', function(){ show(i); }); });
      setInterval(function(){ show(index + 1); }, 5000);
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
`;

const FORCE_REMOVE_GALLERY_JS = `
(function(){
  function removePromoGallery(){
    document.querySelectorAll('.course-promo-section .promo-gallery, .promo-gallery[aria-label*="課程"], .promo-gallery[aria-label*="掌中訣"]').forEach(function(el){
      el.remove();
    });
  }
  removePromoGallery();
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', removePromoGallery);
  } else {
    setTimeout(removePromoGallery, 100);
  }
  setTimeout(removePromoGallery, 600);
  setTimeout(removePromoGallery, 1500);
})();
`;

export default function CoursesPage() {
  return (
    <>
      <style
        id="force-hide-course-promo-gallery"
        dangerouslySetInnerHTML={{ __html: FORCE_HIDE_GALLERY_CSS }}
      />

      {/* V3: front-end only shows the controlled carousel; poster images are managed in admin/course_promo.json. */}
      <section id="zzjStaticFallback" className="course-promo-section">
        <div className="wrap">
          <article className="course-promo-card">
            <div className="course-promo-copy">
              <div className="tag">NEW COURSE｜掌訣班招生</div>
              <h2 className="promo-title">
                <span>掌中訣</span>
                <small>開班授課</small>
              </h2>
              <h3>別讓命運成為盲盒，風羿老師帶你親手改寫人生劇本！</h3>
              <p className="promo-subtitle">解開命運密碼・掌握人生方向</p>
              <div className="promo-body">
                <p>您是否總覺得人生像在迷霧中行走？努力了很久，卻總在關鍵時刻與機會擦身而過？</p>
                <p>
                  其實，您的成功路徑、財富密碼、甚至避坑指南，早已刻在你的掌心之中。玄學名師風羿老師傾囊相授，將千年不外傳的「掌中訣」化繁為簡。
                </p>
                <p>這不只是一門命理課，更是一套讓你「看透局勢、精準決策」的人生導航系統。</p>
              </div>
              <ul className="promo-highlights">
                <li>干支解析｜洞悉先天與後天趨勢</li>
                <li>五行陰陽｜結合五行生剋原理</li>
                <li>運程趨勢｜掌握人生關鍵時機</li>
                <li>實戰運用｜學以致用，快速上手</li>
              </ul>
              <div className="promo-limited">⏳ 招生名額有限，立即卡位</div>
              <div className="actions">
                <a
                  className="btn btn-primary"
                  href="https://psee.io/9255j4"
                  target="_blank"
                  rel="noreferrer"
                >
                  立即報名
                </a>
                <a
                  className="btn btn-ghost"
                  href="https://lin.ee/W88wwDB"
                  target="_blank"
                  rel="noreferrer"
                >
                  LINE 詢問課程
                </a>
              </div>
            </div>
            <div className="course-promo-media">
              <div
                className="promo-poster-carousel"
                data-course-promo-carousel
              >
                <img
                  className="promo-carousel-img active"
                  src="/assets/courses/zhangzhongjue-poster-qr.png"
                  alt="掌中訣課程海報 1"
                />
                <img
                  className="promo-carousel-img"
                  src="/assets/courses/zhangzhongjue-poster-dark.png"
                  alt="掌中訣課程海報 2"
                />
                <img
                  className="promo-carousel-img"
                  src="/assets/courses/zhangzhongjue-video-cover.png"
                  alt="掌中訣課程海報 3"
                />
                <div className="promo-carousel-dots">
                  <button
                    type="button"
                    className="active"
                    aria-label="切換到第 1 張海報"
                  ></button>
                  <button type="button" aria-label="切換到第 2 張海報"></button>
                  <button type="button" aria-label="切換到第 3 張海報"></button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section
        id="coursePromoSection"
        className="course-promo-section"
        hidden
      >
        <div className="wrap">
          <div id="cmsCoursePromo"></div>
        </div>
      </section>

      <section className="hero">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="tag">COURSES & TALKS</div>
              <h1 className="hero-title">
                <span className="title-line title-main">課程講座</span>
                <span className="title-line accent">讓傳統智慧</span>
                <span className="title-line accent">走進現代現場</span>
              </h1>
            </div>
            <p className="section-desc">
              課程可依扶輪社、企業、協會、校園與專業社群需求調整深度，從入門觀念到專業風水與場域管理皆可規劃。
            </p>
          </div>
          <div className="grid-4" id="cmsCourses"></div>
        </div>
      </section>

      <section>
        <div className="wrap grid-2">
          <article className="panel">
            <img src="/assets/proof-speaker.jpg" alt="風羿老師主講" />
            <h3>演講實景</h3>
            <p>以真實講座與協會合作照片作為信任背書，適合企業與社團邀約。</p>
          </article>
          <article className="panel">
            <img src="/assets/proof-group.jpg" alt="協會交流合影" />
            <h3>國際交流</h3>
            <p>台灣省地理師協會國際交流活動，展現專業社群與跨域合作。</p>
          </article>
        </div>
      </section>

      <Script id="courses-remove-fallback" strategy="afterInteractive">
        {REMOVE_FALLBACK_JS}
      </Script>
      <Script id="courses-static-carousel" strategy="afterInteractive">
        {STATIC_CAROUSEL_JS}
      </Script>
      <Script
        id="force-remove-course-promo-gallery"
        strategy="afterInteractive"
      >
        {FORCE_REMOVE_GALLERY_JS}
      </Script>
    </>
  );
}
