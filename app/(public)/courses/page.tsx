import type { Metadata } from "next";
import Script from "next/script";
import { readCoursePromo, readPublishedContent, type CourseItem, type CoursePromo } from "@/lib/site/content";
import {
  daysUntilCourse,
  formatCourseDate,
  formatPrice,
  formatTaipeiTime,
  readActiveCourseProduct,
  type CourseProduct
} from "@/lib/site/course-product";

export const metadata: Metadata = {
  title: "課程講座｜巽風堪輿研究中心",
  description:
    "巽風堪輿研究中心提供風水、命理、場域管理與傳統智慧現代應用之課程講座。"
};

// Landing Page 直接在 server 端讀 DB 渲染，後台儲存後最多 30 秒生效；
// 不再靠 cms-render.js 在瀏覽器端補內容，首屏就有完整版面。
export const revalidate = 30;

function taipeiToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function isPromoLive(promo: CoursePromo | null) {
  if (!promo || !promo.active) return false;
  const today = taipeiToday();
  if (promo.publishStart && today < promo.publishStart) return false;
  if (promo.publishEnd && today > promo.publishEnd) return false;
  return true;
}

const lines = (value: string) => String(value || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
/** 「標題｜說明」一行一項；沒有分隔符就整行當說明。 */
const splitTitled = (line: string) => {
  const idx = line.search(/[｜|]/);
  if (idx < 0) return { title: "", desc: line };
  return { title: line.slice(0, idx).trim(), desc: line.slice(idx + 1).trim() };
};
const mediaSrc = (value: string) => {
  const url = String(value || "").trim();
  if (!url) return "";
  return /^https?:\/\//i.test(url) || url.startsWith("/") ? url : `/${url}`;
};

function videoEmbedUrl(src: string) {
  const url = String(src || "").trim();
  let m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{6,})/i);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0`;
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return "";
}

function VideoPlayer({ src, cover, title }: { src: string; cover: string; title: string }) {
  const embed = videoEmbedUrl(src);
  if (embed) {
    return (
      <div className="promo-video-embed">
        <iframe src={embed} title={title} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    );
  }
  const clean = src.split(/[?#]/)[0].toLowerCase();
  const type = clean.endsWith(".webm") ? "video/webm" : clean.endsWith(".mov") ? "video/quicktime" : "video/mp4";
  return (
    <video controls playsInline preload="metadata" poster={cover ? mediaSrc(cover) : undefined}>
      <source src={mediaSrc(src)} type={type} />
      你的瀏覽器不支援影片播放。
    </video>
  );
}

// 固定 CTA：捲過 Hero 才出現，進到報名表後自動收起，避免遮住綠界付款按鈕。
const STICKY_JS = `
(function(){
  var bar = document.getElementById('clSticky');
  var hero = document.getElementById('clHero');
  var register = document.getElementById('courseCheckout');
  if(!bar || !hero || !register || !('IntersectionObserver' in window)) return;
  var heroVisible = true, registerVisible = false;
  function sync(){ bar.classList.toggle('show', !heroVisible && !registerVisible); }
  new IntersectionObserver(function(entries){ heroVisible = entries[0].isIntersecting; sync(); }, { threshold: 0.15 }).observe(hero);
  new IntersectionObserver(function(entries){ registerVisible = entries[0].isIntersecting; sync(); }, { threshold: 0.05 }).observe(register);
})();
`;

export default async function CoursesPage() {
  const [promo, product, courses] = await Promise.all([
    readCoursePromo(),
    readActiveCourseProduct(),
    readPublishedContent<CourseItem>("courses")
  ]);
  const live = isPromoLive(promo);
  const p = live ? (promo as CoursePromo) : null;

  const dateText = product ? formatCourseDate(product.course_date) : "";
  const dateFull = product ? formatCourseDate(product.course_date, true) : "";
  const timeText = product ? `${formatTaipeiTime(product.starts_at)}–${formatTaipeiTime(product.ends_at)}` : "";
  const priceNew = product ? formatPrice(product.price_new) : "";
  const priceReturning = product ? formatPrice(product.price_returning) : "";
  const daysLeft = product ? daysUntilCourse(product.course_date) : null;
  const ctaText = (p?.ctaText || "立即報名").trim();
  const registerHref = p?.registerUrl && !p.registerUrl.startsWith("#") ? p.registerUrl : "#register";
  const lineUrl = "https://lin.ee/W88wwDB";

  const posters = p ? [p.posterMain, p.posterSecond, p.posterThird].map(mediaSrc).filter(Boolean) : [];
  const videos = p ? [
    p.videoOne ? { src: p.videoOne, title: p.videoOneTitle || "課程宣傳影片 1" } : null,
    p.videoTwo ? { src: p.videoTwo, title: p.videoTwoTitle || "課程宣傳影片 2" } : null
  ].filter((v): v is { src: string; title: string } => Boolean(v)) : [];
  const heroStats = p ? lines(p.heroStats) : [];
  // 課程介紹圖：海報 1 當 Hero 主視覺；海報 2、3 與老師上傳的介紹圖依序往下堆疊，同一張只出現一次。
  // 後台 STEP 6 的「圖片順序」整串存在 gallery；gallery 為空的舊資料才退回海報 1～3。
  const orderedImages = p
    ? (p.gallery.length > 0
        ? p.gallery.map((g) => ({ image: mediaSrc(g.image), caption: g.caption }))
        : posters.map((src) => ({ image: src, caption: "" })))
        .filter((g, i, arr) => g.image && arr.findIndex((x) => x.image === g.image) === i)
    : [];
  const heroImage = orderedImages[0]?.image || "";
  const introImages = orderedImages.slice(1);
  const painPoints = p ? lines(p.painPoints).map(splitTitled) : [];
  const outcomes = p ? lines(p.outcomes).map(splitTitled) : [];
  const curriculum = p?.curriculum || [];
  const credentials = p ? lines(p.instructorCredentials) : [];
  const faqs = p?.faqs || [];
  const testimonials = p?.testimonials || [];
  const notices = p ? lines(p.guaranteeText) : [];
  const mapHref = product?.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(product.location)}` : "";

  return (
    <>
      {/* 這一頁的主要行動是報名，隱藏全站的問天機浮動按鈕，避免與固定報名列打架。 */}
      <style dangerouslySetInnerHTML={{ __html: ".floating-ai,.mobile-dock,.xf-mobile-cta{display:none!important}" }} />

      {p && product && (
        <div id="clSticky" className="cl-sticky" aria-label="快速報名">
          <div className="cl-sticky-info">
            <strong>{p.title}{p.titleSuffix ? ` ${p.titleSuffix}` : ""}</strong>
            <span>{dateText}{timeText ? ` ${timeText}` : ""}｜新生 {priceNew}</span>
          </div>
          <a className="btn btn-primary" href={registerHref}>{ctaText}</a>
        </div>
      )}

      {p && (
        <section id="clHero" className="cl-hero">
          <div className="wrap cl-hero-grid">
            <div className="cl-hero-copy">
              {p.label && <div className="tag">{p.label}</div>}
              <h1 className="cl-title"><span>{p.title}</span>{p.titleSuffix && <small>{p.titleSuffix}</small>}</h1>
              {p.headline && <h2 className="cl-headline">{p.headline}</h2>}
              {p.subheadline && <p className="cl-subheadline">{p.subheadline}</p>}
              {heroStats.length > 0 && (
                <ul className="cl-stats">{heroStats.map((s) => <li key={s}>{s}</li>)}</ul>
              )}
              {product && (
                <dl className="cl-facts">
                  <div><dt>開課日期</dt><dd>{dateFull}<small>{timeText}</small></dd></div>
                  <div><dt>上課地點</dt><dd>{product.location || "巽風堪輿研究中心"}</dd></div>
                  <div><dt>課程費用</dt><dd>新生 {priceNew}<small>複訓 {priceReturning}</small></dd></div>
                </dl>
              )}
              <div className="cl-actions">
                <a className="btn btn-primary cl-btn-lg" href={registerHref}>{ctaText}</a>
                <a className="btn btn-ghost" href={lineUrl} target="_blank" rel="noreferrer">{p.lineCtaText || "LINE 詢問課程"}</a>
              </div>
              {(p.limitedText || (daysLeft !== null && daysLeft >= 0)) && (
                <p className="cl-urgency">
                  {p.limitedText && <span>⏳ {p.limitedText}</span>}
                  {daysLeft !== null && daysLeft > 0 && <span>距開課還有 {daysLeft} 天</span>}
                  {daysLeft === 0 && <span>今天開課</span>}
                </p>
              )}
            </div>
            <div className="cl-hero-media">
              {heroImage ? (
                <div className="cl-hero-key-visual">
                  <img src={heroImage} alt={`${p.title} 主視覺`} />
                </div>
              ) : (
                <div className="cl-hero-placeholder"><span>{p.title}</span></div>
              )}
            </div>
          </div>
        </section>
      )}

      {p && introImages.length > 0 && (
        <section className="cl-section cl-intro-images">
          <div className="wrap cl-intro-wrap">
            {introImages.map((g, i) => (
              <figure key={g.image} className="cl-intro-figure">
                <img src={g.image} alt={g.caption || `${p.title} 課程介紹 ${i + 1}`} loading={i < 2 ? "eager" : "lazy"} />
                {g.caption && <figcaption>{g.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {p && painPoints.length > 0 && (
        <section className="cl-section cl-pain">
          <div className="wrap">
            <div className="cl-section-head">
              <div className="tag">WHY THIS COURSE</div>
              <h2>{p.painTitle || "這些困擾，你也遇過嗎？"}</h2>
            </div>
            <div className="cl-pain-grid">
              {painPoints.map((item, i) => (
                <article key={i} className="cl-pain-card">
                  {item.title && <h3>{item.title}</h3>}
                  <p>{item.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {p && outcomes.length > 0 && (
        <section className="cl-section cl-outcomes">
          <div className="wrap">
            <div className="cl-section-head">
              <div className="tag">WHAT YOU WILL GET</div>
              <h2>{p.outcomeTitle || "上完課，你能做到"}</h2>
            </div>
            <ol className="cl-outcome-grid">
              {outcomes.map((item, i) => (
                <li key={i}>
                  <span className="cl-num">{String(i + 1).padStart(2, "0")}</span>
                  <div>{item.title && <strong>{item.title}</strong>}<p>{item.desc}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {p && curriculum.length > 0 && (
        <section className="cl-section cl-curriculum">
          <div className="wrap">
            <div className="cl-section-head">
              <div className="tag">CURRICULUM</div>
              <h2>{p.curriculumTitle || "課程大綱"}</h2>
              {product && <p className="cl-section-desc">{dateFull} {timeText}，實際進度依現場調整。</p>}
            </div>
            <ol className="cl-timeline">
              {curriculum.map((unit, i) => (
                <li key={i}>
                  <span className="cl-timeline-dot" aria-hidden="true" />
                  <div className="cl-timeline-card">
                    <div className="cl-timeline-head">
                      <h3>{unit.title}</h3>
                      {unit.duration && <span className="cl-duration">{unit.duration}</span>}
                    </div>
                    {unit.description && <p>{unit.description}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {p && videos.length > 0 && (
        <section className="cl-section cl-videos">
          <div className="wrap">
            <div className="cl-section-head">
              <div className="tag">PREVIEW</div>
              <h2>先看一段課程介紹</h2>
            </div>
            <div className="promo-video-grid">
              {videos.map((v) => (
                <article className="promo-video-card" key={v.src}>
                  <h3>{v.title}</h3>
                  <VideoPlayer src={v.src} cover={p.videoCover} title={v.title} />
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {p && (p.instructorName || p.instructorBio) && (
        <section className="cl-section cl-instructor">
          <div className="wrap cl-instructor-grid">
            <div className="cl-instructor-photo">
              <img src={mediaSrc(p.instructorImage) || "/assets/fengyi-hero.jpg"} alt={p.instructorName || "授課講師"} />
            </div>
            <div>
              <div className="tag">INSTRUCTOR</div>
              <h2>{p.instructorName}{p.instructorTitle && <small>{p.instructorTitle}</small>}</h2>
              {lines(p.instructorBio).map((para, i) => <p key={i} className="cl-instructor-bio">{para}</p>)}
              {credentials.length > 0 && (
                <ul className="cl-credentials">{credentials.map((c) => <li key={c}>{c}</li>)}</ul>
              )}
              <div className="cl-proof">
                <img src="/assets/proof-speaker.jpg" alt="風羿老師主講" />
                <img src="/assets/proof-group.jpg" alt="協會交流合影" />
              </div>
            </div>
          </div>
        </section>
      )}

      {p && testimonials.length > 0 && (
        <section className="cl-section cl-testimonials">
          <div className="wrap">
            <div className="cl-section-head">
              <div className="tag">STUDENTS</div>
              <h2>學員怎麼說</h2>
            </div>
            <div className="cl-testimonial-grid">
              {testimonials.map((t, i) => (
                <blockquote key={i}><p>{t.quote}</p><footer>{t.name}{t.role && <span>｜{t.role}</span>}</footer></blockquote>
              ))}
            </div>
          </div>
        </section>
      )}

      {p && product && (
        <section className="cl-section cl-info">
          <div className="wrap">
            <div className="cl-section-head">
              <div className="tag">COURSE INFO</div>
              <h2>課程資訊</h2>
            </div>
            <div className="cl-info-grid">
              <article><span>日期時間</span><strong>{dateFull}</strong><small>{timeText}</small></article>
              <article><span>上課地點</span><strong>{product.location || "巽風堪輿研究中心"}</strong>{mapHref && <a href={mapHref} target="_blank" rel="noreferrer">在 Google 地圖開啟</a>}</article>
              <article><span>新生報名</span><strong>{priceNew}</strong><small>含講義，綠界付款保留名額</small></article>
              <article><span>複訓學員</span><strong>{priceReturning}</strong><small>曾上過本課程任一期次</small></article>
            </div>
            {(p.infoNote || p.limitedText) && (
              <p className="cl-info-note">{p.limitedText && <strong>⏳ {p.limitedText}　</strong>}{p.infoNote}</p>
            )}
          </div>
        </section>
      )}

      {p && faqs.length > 0 && (
        <section className="cl-section cl-faq">
          <div className="wrap">
            <div className="cl-section-head">
              <div className="tag">FAQ</div>
              <h2>常見問題</h2>
            </div>
            <div className="cl-faq-list">
              {faqs.map((f, i) => (
                <details key={i} className="cl-faq-item">
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="courseCheckout" className="course-checkout-section cl-register">
        <div id="register" className="cl-anchor" aria-hidden="true" />
        <div className="wrap">
          <div className="cl-register-head">
            <div className="tag">REGISTER</div>
            <h2>課程報名</h2>
            <p className="cl-register-sub">{product?.subtitle ? `${product.subtitle}｜` : ""}{dateText}{timeText ? ` ${timeText}` : ""}</p>
            <ol className="cl-steps">
              <li><span>1</span>填寫報名資料</li>
              <li><span>2</span>前往綠界付款</li>
              <li><span>3</span>付款完成，名額保留</li>
            </ol>
          </div>

          {notices.length > 0 && (
            <ul className="cl-notices">{notices.map((n) => <li key={n}>{n}</li>)}</ul>
          )}

          <div className="cl-register-grid">
            <article className="form-panel cl-form-panel">
              <form id="courseCheckoutForm" className="booking-form cl-form">
                <fieldset className="cl-fieldset">
                  <legend><span>1</span>報名身份</legend>
                  <div className="course-radio-group" aria-label="報名身份">
                    <label>
                      <input type="radio" name="courseRegistrationType" value="new" defaultChecked />
                      <span id="courseRadioPriceNew">新生報名（價格讀取中）</span>
                    </label>
                    <label>
                      <input type="radio" name="courseRegistrationType" value="returning" />
                      <span id="courseRadioPriceReturning">複訓學員（價格讀取中）</span>
                    </label>
                  </div>
                  <small className="cl-field-hint">複訓學員：曾上過本課程任一期次。</small>
                </fieldset>

                <fieldset className="cl-fieldset">
                  <legend><span>2</span>基本資料</legend>
                  <div className="form-grid">
                    <label>姓名<input id="courseName" autoComplete="name" required /></label>
                    <label>性別<select id="courseGender" defaultValue="">
                      <option value="">不填寫</option>
                      <option value="男">男</option>
                      <option value="女">女</option>
                      <option value="不便透露">不便透露</option>
                    </select></label>
                    <label>聯絡電話<input id="coursePhone" autoComplete="tel" required /></label>
                    <label>LINE ID<input id="courseLineId" /></label>
                    <label className="span-2">電子信箱<input id="courseEmail" type="email" autoComplete="email" required /></label>
                  </div>
                </fieldset>

                <fieldset className="cl-fieldset">
                  <legend><span>3</span>學習背景<em>選填，幫老師了解你</em></legend>
                  <label>學習背景<select id="courseLearningBackground" defaultValue="">
                    <option value="">請選擇</option>
                    <option value="完全沒有，第一次接觸">完全沒有，第一次接觸</option>
                    <option value="有初步了解">有初步了解</option>
                    <option value="曾上過相關課程">曾上過相關課程</option>
                    <option value="已有實務經驗">已有實務經驗</option>
                  </select></label>
                  <div>
                    <div className="form-label">想加強的內容</div>
                    <div className="course-checkbox-grid">
                      {["五行基礎判斷", "掌訣快速記憶", "命理應用", "風水應用", "擇日應用", "卜卦應用", "個人運勢判讀", "實務案例解析"].map((item) => (
                        <label key={item}>
                          <input type="checkbox" name="courseInterests" value={item} />
                          <span>{item}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="form-grid">
                    <label>報名動機或學習期待<textarea id="courseMotivation" /></label>
                    <label>備註<textarea id="courseNote" /></label>
                  </div>
                </fieldset>

                <fieldset className="cl-fieldset">
                  <legend><span>4</span>發票資訊</legend>
                  <div className="course-radio-group" aria-label="發票類型">
                    <label>
                      <input type="radio" name="courseInvoiceBuyerType" value="personal" defaultChecked />
                      <span>個人雲端發票</span>
                    </label>
                    <label>
                      <input type="radio" name="courseInvoiceBuyerType" value="company" />
                      <span>公司三聯式</span>
                    </label>
                  </div>
                  <div className="form-grid">
                    <label>發票抬頭<input id="courseInvoiceBuyerName" placeholder="個人填姓名 / 公司填公司名" /></label>
                    <label>Email<input id="courseInvoiceBuyerEmail" type="email" placeholder="用於接收綠界發票通知" /></label>
                    <label id="courseInvoiceCompanyRow" className="span-2">統一編號<input id="courseInvoiceBuyerId" inputMode="numeric" maxLength={8} /></label>
                    <label id="courseInvoiceDeliveryRow" className="span-2">個人發票方式<select id="courseInvoiceDelivery" defaultValue="email">
                      <option value="email">雲端發票寄 Email</option>
                      <option value="cellphone">手機條碼載具</option>
                      <option value="donation">捐贈碼</option>
                    </select></label>
                    <label id="courseInvoiceCarrierRow" className="span-2">手機條碼載具<input id="courseInvoiceCarrierNum" placeholder="/ABC1234" maxLength={8} /></label>
                    <label id="courseInvoiceDonationRow" className="span-2">捐贈碼<input id="courseInvoiceDonationCode" inputMode="numeric" maxLength={7} /></label>
                  </div>
                </fieldset>

                <div className="cl-pay">
                  <div className="cl-pay-total"><span>本次應付</span><strong id="courseSelectedPrice">課程價格讀取中…</strong></div>
                  <button id="courseCheckoutSubmit" className="btn btn-primary cl-submit" type="submit" disabled>
                    讀取課程資訊中…
                  </button>
                  <small>付款流程由綠界 ECPay 處理，巽風不接觸您的卡片資料；電子發票依上方資訊開立。</small>
                </div>
                <div id="courseCheckoutStatus" className="booking-preview course-checkout-status" style={{ display: "none" }}></div>
              </form>
            </article>

            <aside className="panel course-checkout-summary cl-summary">
              <div className="cl-summary-head">
                <div id="courseSummaryTitle" className="tag">讀取最新課程資訊中…</div>
                <h3 id="courseSummarySubtitle">請稍候</h3>
              </div>
              <dl className="cl-summary-list">
                <div><dt>日期時間</dt><dd id="courseSummaryDate">讀取中</dd></div>
                <div><dt>上課地點</dt><dd id="courseSummaryLocation">讀取中</dd></div>
              </dl>
              <div className="price-line">
                <span>新生報名</span>
                <strong id="courseSummaryPriceNew">讀取中</strong>
              </div>
              <div className="price-line">
                <span>複訓學員</span>
                <strong id="courseSummaryPriceReturning">讀取中</strong>
              </div>
              <ul className="cl-summary-trust">
                <li>綠界 ECPay 安全付款</li>
                <li>付款完成即保留名額</li>
                <li>電子發票自動開立</li>
              </ul>
              <a className="cl-summary-line" href={lineUrl} target="_blank" rel="noreferrer">報名前有問題？LINE 詢問</a>
            </aside>
          </div>
        </div>
      </section>

      {courses.length > 0 && (
        <section className="cl-section cl-others">
          <div className="wrap">
            <div className="cl-section-head">
              <div className="tag">MORE COURSES &amp; TALKS</div>
              <h2>其他課程與講座</h2>
              <p className="cl-section-desc">可依扶輪社、企業、協會、校園與專業社群需求調整深度，歡迎邀約。</p>
            </div>
            <div className="cl-others-grid">
              {courses.map((c) => (
                <article key={c.id || c.title} className="cl-other-card">
                  {c.image && <img src={mediaSrc(c.image)} alt={c.title} loading="lazy" />}
                  <div>
                    <h3>{c.title}</h3>
                    {c.audience && <p className="cl-other-audience">適合對象：{c.audience}</p>}
                    {c.description && <p>{c.description}</p>}
                    {(c.schedule || c.location || c.price_text) && (
                      <p className="cl-other-meta">{[c.schedule, c.location, c.price_text].filter(Boolean).join("｜")}</p>
                    )}
                    {c.href && <a className="btn btn-ghost" href={c.href}>了解更多</a>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}


      <Script id="courses-sticky" strategy="afterInteractive">{STICKY_JS}</Script>
      <Script src="/js/course-checkout.js" strategy="afterInteractive" />
    </>
  );
}
