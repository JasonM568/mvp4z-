
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  async function getJSON(path) {
    try {
      const res = await fetch(path, { cache: "no-cache" });
      if (!res.ok) throw new Error(path + " " + res.status);
      return await res.json();
    } catch (err) {
      console.warn("CMS content load failed:", path, err);
      return null;
    }
  }

  function setText(selector, value) {
    if (!value) return;
    $$(selector).forEach(el => el.textContent = value);
  }

  function setHref(selector, value) {
    if (!value) return;
    $$(selector).forEach(el => el.href = value);
  }

  function setSrc(selector, value) {
    if (!value) return;
    $$(selector).forEach(el => el.src = value);
  }

  function getSafeAiUrl(value) {
    // 舊 GPT 目前公開端會 404，因此先導到站內 AI 說明頁。
    // 未來後台換成新的可公開 GPT 連結後，會自動改用新連結。
    const blocked = "g-683d6cacf5648191ade78d93c3aec7ac";
    if (!value || String(value).includes(blocked)) return "/ai";
    return value;
  }

  function escapeHTML(str) {
    return String(str || "").replace(/[&<>"']/g, s => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[s]));
  }

  function renderServices(data) {
    const pricing = $("#cmsPricing");
    const cards = $("#cmsServices");
    if (!data || !Array.isArray(data.services)) return;

    if (pricing) {
      pricing.innerHTML = data.services.map(s => `
        <article class="price-card">
          <div class="price-tag">${escapeHTML(s.category)}</div>
          <h3>${escapeHTML(s.title)}</h3>
          <div class="price-range">${escapeHTML(s.price)}</div>
          <p class="price-note">${escapeHTML(s.note)}</p>
          <p>${escapeHTML(s.description)}</p>
          <div class="actions"><a class="btn btn-primary" href="/booking">預約${escapeHTML(s.title)}</a></div>
        </article>
      `).join("");
    }

    if (cards) {
      cards.innerHTML = data.services.map(s => `
        <article class="card">
          <div class="icon">${escapeHTML(s.title.slice(0, 1))}</div>
          <h3>${escapeHTML(s.title)}</h3>
          <p>${escapeHTML(s.description)}</p>
          <div class="price-tag">${escapeHTML(s.price)}</div>
        </article>
      `).join("");
    }
  }

  function renderCases(data) {
    const target = $("#cmsCases");
    if (!target || !data || !Array.isArray(data.cases)) return;
    target.innerHTML = data.cases.map(c => `
      <article class="case-card">
        <div class="case-tag">${escapeHTML(c.category)}</div>
        ${c.image ? `<img src="${escapeHTML(c.image)}" alt="${escapeHTML(c.title)}" style="height:240px;width:100%;object-fit:cover;border-radius:22px;margin-bottom:18px;">` : ""}
        <h3>${escapeHTML(c.title)}</h3>
        <p>${escapeHTML(c.summary)}</p>
        <p>${escapeHTML(c.body)}</p>
      </article>
    `).join("");
  }


  function isPromoActive(data) {
    if (!data) return false;
    if (data.active === false || String(data.active).toLowerCase() === "false") return false;

    const now = new Date();
    if (data.publishStart) {
      const start = new Date(data.publishStart + "T00:00:00");
      if (!Number.isNaN(start.getTime()) && now < start) return false;
    }
    if (data.publishEnd) {
      const end = new Date(data.publishEnd + "T23:59:59");
      if (!Number.isNaN(end.getTime()) && now > end) return false;
    }
    return true;
  }

  function splitLines(text) {
    return String(text || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
  }

  function renderCoursePromo(data, site) {
    const section = $("#coursePromoSection");
    const target = $("#cmsCoursePromo");
    if (!section || !target) return;

    if (!isPromoActive(data)) {
      section.hidden = true;
      target.innerHTML = "";
      return;
    }

    section.hidden = false;
    // posterMain / posterSecond / posterThird come from admin「新課程推廣」欄位。
    const posters = [data.posterMain, data.posterSecond, data.posterThird].filter(Boolean);
    const videos = [
      data.videoOne ? { title: data.videoOneTitle || "課程宣傳影片 1", src: data.videoOne } : null,
      data.videoTwo ? { title: data.videoTwoTitle || "課程宣傳影片 2", src: data.videoTwo } : null
    ].filter(Boolean);

    const body = splitLines(data.body).map(p => `<p>${escapeHTML(p)}</p>`).join("");
    const highlights = splitLines(data.highlights).map(x => `<li>${escapeHTML(x)}</li>`).join("");
    const lineUrl = site && site.lineUrl ? site.lineUrl : "https://lin.ee/W88wwDB";

    target.innerHTML = `
      <article class="course-promo-card">
        <div class="course-promo-copy">
          <div class="tag">${escapeHTML(data.label || "NEW COURSE")}</div>
          <h2 class="promo-title"><span>${escapeHTML(data.title || "新課程")}</span>${data.titleSuffix ? `<small>${escapeHTML(data.titleSuffix)}</small>` : ""}</h2>
          <h3>${escapeHTML(data.headline || "")}</h3>
          ${data.subheadline ? `<p class="promo-subtitle">${escapeHTML(data.subheadline)}</p>` : ""}
          <div class="promo-body">${body}</div>
          ${highlights ? `<ul class="promo-highlights">${highlights}</ul>` : ""}
          ${data.limitedText ? `<div class="promo-limited">⏳ ${escapeHTML(data.limitedText)}</div>` : ""}
          <div class="actions">
            ${data.registerUrl ? `<a class="btn btn-primary" href="${escapeHTML(data.registerUrl)}" target="_blank" rel="noreferrer">${escapeHTML(data.ctaText || "立即報名")}</a>` : ""}
            <a class="btn btn-ghost" href="${escapeHTML(lineUrl)}" target="_blank" rel="noreferrer">${escapeHTML(data.lineCtaText || "LINE 詢問")}</a>
          </div>
        </div>

        <div class="course-promo-media">
          ${posters.length ? `
            <div class="promo-poster-carousel" data-course-promo-carousel>
              ${posters.map((p, i) => `<img class="promo-carousel-img ${i === 0 ? "active" : ""}" src="${escapeHTML(p)}" alt="${escapeHTML(data.title || "課程海報")} ${i + 1}">`).join("")}
              <div class="promo-carousel-dots">
                ${posters.map((_, i) => `<button type="button" class="${i === 0 ? "active" : ""}" aria-label="切換到第 ${i + 1} 張海報"></button>`).join("")}
              </div>
            </div>
          ` : ""}
        </div>
      </article>
${videos.length ? `
        <div class="promo-video-grid">
          ${videos.map(v => `
            <article class="promo-video-card">
              <h3>${escapeHTML(v.title)}</h3>
              <video controls playsinline preload="metadata" ${data.videoCover ? `poster="${escapeHTML(data.videoCover)}"` : ""}>
                <source src="${escapeHTML(v.src)}" type="video/mp4">
                你的瀏覽器不支援影片播放。
              </video>
            </article>
          `).join("")}
        </div>
      ` : ""}
    `;
  }



  function initCoursePromoCarousels() {
    $$("[data-course-promo-carousel]").forEach(carousel => {
      if (carousel.dataset.ready === "1") return;
      carousel.dataset.ready = "1";
      const imgs = Array.from(carousel.querySelectorAll(".promo-carousel-img"));
      const dots = Array.from(carousel.querySelectorAll(".promo-carousel-dots button"));
      if (imgs.length <= 1) return;

      let index = 0;
      function show(next) {
        index = (next + imgs.length) % imgs.length;
        imgs.forEach((img, i) => img.classList.toggle("active", i === index));
        dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
      }

      dots.forEach((dot, i) => dot.addEventListener("click", () => show(i)));

      setInterval(() => show(index + 1), 5000);
    });
  }


  function renderCourses(data) {
    const target = $("#cmsCourses");
    if (!target || !data || !Array.isArray(data.courses)) return;
    target.innerHTML = data.courses.map(c => `
      <article class="card">
        ${c.image ? `<img src="${escapeHTML(c.image)}" alt="${escapeHTML(c.title)}" style="height:220px;width:100%;object-fit:cover;border-radius:22px;margin-bottom:18px;">` : ""}
        <div class="icon">課</div>
        <h3>${escapeHTML(c.title)}</h3>
        <p><strong>適合對象：</strong>${escapeHTML(c.audience)}</p>
        <p>${escapeHTML(c.description)}</p>
      </article>
    `).join("");
  }

  function renderPhotos(data) {
    const target = $("#cmsPhotos");
    if (!target || !data || !Array.isArray(data.photos)) return;
    target.innerHTML = data.photos.map(p => `
      <article class="photo-card">
        <img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.title)}">
        <div class="photo-caption">
          <strong>${escapeHTML(p.title)}</strong>
          <span>${escapeHTML(p.caption)}</span>
        </div>
      </article>
    `).join("");
  }

  function setupCarousel() {
    const track = document.querySelector('.photo-track');
    const cards = track ? Array.from(track.querySelectorAll('.photo-card')) : [];
    const indexEl = document.getElementById('carouselIndex');
    const totalEl = document.getElementById('carouselTotal');
    const prev = document.querySelector('[data-carousel-prev]');
    const next = document.querySelector('[data-carousel-next]');
    let current = 0;
    let timer = null;
    const delay = 2800;

    if (!track || !cards.length) return;
    if (totalEl) totalEl.textContent = cards.length;

    function goTo(i) {
      current = (i + cards.length) % cards.length;
      const left = cards[current].offsetLeft - track.offsetLeft;
      track.scrollTo({ left, behavior: 'smooth' });
      if (indexEl) indexEl.textContent = current + 1;
    }

    function start() {
      stop();
      timer = setInterval(() => goTo(current + 1), delay);
    }

    function stop() {
      if (timer) clearInterval(timer);
    }

    if (prev) prev.addEventListener('click', () => { goTo(current - 1); start(); });
    if (next) next.addEventListener('click', () => { goTo(current + 1); start(); });
    track.addEventListener('mouseenter', stop);
    track.addEventListener('mouseleave', start);
    track.addEventListener('touchstart', stop, { passive: true });
    track.addEventListener('touchend', start, { passive: true });
    goTo(0);
    start();
  }

  function setupBookingForm(site) {
    const form = document.getElementById('bookingForm');
    const preview = document.getElementById('bookingPreview');
    const copyBtn = document.getElementById('copyBookingBtn');
    if (!form || !preview) return;

    if (site && site.formspreeEndpoint) {
      form.action = site.formspreeEndpoint;
    }

    function val(name) {
      const el = form.elements[name];
      return el && el.value ? String(el.value).trim() : '未填寫';
    }

    function buildText() {
      return [
        '【巽風堪輿研究中心｜預約表單】',
        '服務類型：' + val('service'),
        '姓名 / 單位：' + val('name'),
        '手機 / LINE：' + val('phone'),
        'Email：' + val('email'),
        '地點 / 區域：' + val('location'),
        '坪數 / 規模：' + val('size'),
        '預算級距：' + val('budget'),
        '需求急迫性：' + val('urgency'),
        '希望安排時間：' + val('schedule'),
        '需求說明：' + val('message')
      ].join('\n');
    }

    function renderPreview() {
      preview.textContent = buildText();
    }

    form.addEventListener('input', renderPreview);
    form.addEventListener('change', renderPreview);
    renderPreview();

    if (copyBtn) {
      copyBtn.addEventListener('click', async function () {
        try {
          await navigator.clipboard.writeText(buildText());
          copyBtn.textContent = '已複製，可貼到 LINE';
          setTimeout(() => copyBtn.textContent = '複製內容給 LINE', 2000);
        } catch (err) {
          copyBtn.textContent = '複製失敗，請手動複製';
          setTimeout(() => copyBtn.textContent = '複製內容給 LINE', 2000);
        }
      });
    }

    // 改寫送出：不走 Formspree，改 POST /api/bookings 進 Supabase
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalLabel = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '送出中…';
      }

      const payload = {
        name: val('name'),
        email: val('email'),
        phone: val('phone'),
        service: val('service'),
        location: val('location'),
        size: val('size'),
        budget: val('budget'),
        urgency: val('urgency'),
        schedule: val('schedule'),
        message: val('message'),
        source: 'website'
      };

      // 把 "未填寫" 還原成空字串以利驗證
      Object.keys(payload).forEach((k) => {
        if (payload[k] === '未填寫') payload[k] = '';
      });

      try {
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data && data.error ? data.error : '送出失敗');

        preview.textContent = '✅ ' + (data.message || '預約已送出，巽風團隊將於 24 小時內聯絡您。');
        preview.style.color = '#2f8a4e';
        form.reset();
        renderPreview();
      } catch (err) {
        preview.textContent = '⚠️ 送出失敗：' + (err && err.message ? err.message : '請稍後再試') + '\n您也可以按「複製內容給 LINE」改用 LINE 聯絡。';
        preview.style.color = '#b4533a';
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel || '送出預約表單';
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const [site, services, cases, courses, photos, coursePromo] = await Promise.all([
      getJSON("content/site.json"),
      getJSON("content/services.json"),
      getJSON("content/cases.json"),
      getJSON("content/courses.json"),
      getJSON("content/photos.json"),
      getJSON("content/course_promo.json")
    ]);

    if (site) {
      if (site.seoTitle) document.title = site.seoTitle;
      setText("[data-site='brand']", site.brand);
      setText("[data-site='shortBrand']", site.shortBrand);
      setText("[data-site='subBrand']", site.subBrand);
      setText("[data-site='heroTitle']", site.heroTitle);
      setText("[data-site='heroLead']", site.heroLead);
      setText("[data-site='email']", site.email);
      setHref("[data-link='line']", site.lineUrl);
      setHref("[data-link='facebook']", site.facebookUrl);
      setHref("[data-link='ai']", getSafeAiUrl(site.aiUrl));
      setHref("[data-link='email']", site.email ? "mailto:" + site.email : "");
      setSrc("[data-image='brandAnchor']", site.brandAnchorImage);
      setSrc("[data-image='fengyi']", site.fengyiImage);
    }

    renderCoursePromo(coursePromo, site);
    initCoursePromoCarousels();
    renderServices(services);
    renderCases(cases);
    renderCourses(courses);
    renderPhotos(photos);
    setupBookingForm(site);

    // 重新啟動照片輪播，等動態內容載入後再跑
    setTimeout(setupCarousel, 100);
  });
})();


// Case track mobile drag fallback: makes cases swipe reliably inside mobile browsers / Facebook in-app browser.
(function () {
  function enableCaseSwipe() {
    const track = document.querySelector(".case-track");
    if (!track || track.dataset.swipeReady === "1") return;
    track.dataset.swipeReady = "1";

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    track.addEventListener("pointerdown", (e) => {
      isDown = true;
      startX = e.clientX;
      scrollLeft = track.scrollLeft;
      track.setPointerCapture?.(e.pointerId);
    });

    track.addEventListener("pointermove", (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      track.scrollLeft = scrollLeft - dx;
    });

    function end(e) {
      if (!isDown) return;
      isDown = false;
      track.releasePointerCapture?.(e.pointerId);
    }

    track.addEventListener("pointerup", end);
    track.addEventListener("pointercancel", end);
    track.addEventListener("mouseleave", end);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(enableCaseSwipe, 300));
  } else {
    setTimeout(enableCaseSwipe, 300);
  }
})();


// V4 force: remove legacy expanded course poster galleries after CMS render.
(function(){
  function removeLegacyCourseGallery(){
    document.querySelectorAll('.course-promo-section .promo-gallery, .promo-gallery[aria-label*="課程"], .promo-gallery[aria-label*="掌中訣"]').forEach(function(el){
      el.remove();
    });
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(removeLegacyCourseGallery, 500); });
  } else {
    setTimeout(removeLegacyCourseGallery, 500);
  }
  setTimeout(removeLegacyCourseGallery, 1500);
})();


// V5: lock hero/section title line breaks to avoid browser cutting Chinese copy into broken fragments.
(function(){
  function normalizeControlledTitles(){
    document.querySelectorAll(".hero-title, .section-title").forEach(function(title){
      title.querySelectorAll(".title-line").forEach(function(line){
        line.textContent = String(line.textContent || "")
          .replace(/[，。；、]+$/g, "")
          .replace(/[，。；、]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      });
    });
  }
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", normalizeControlledTitles);
  } else {
    normalizeControlledTitles();
  }
  setTimeout(normalizeControlledTitles, 800);
})();
