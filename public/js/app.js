
(function(){
  const track = document.querySelector('.photo-track');
  const cards = track ? Array.from(track.querySelectorAll('.photo-card')) : [];
  const indexEl = document.getElementById('carouselIndex');
  const totalEl = document.getElementById('carouselTotal');
  const prev = document.querySelector('[data-carousel-prev]');
  const next = document.querySelector('[data-carousel-next]');
  let current = 0;
  let timer = null;
  const delay = 2800;

  if (track && cards.length) {
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

  const form = document.getElementById('bookingForm');
  const preview = document.getElementById('bookingPreview');
  const copyBtn = document.getElementById('copyBookingBtn');

  if (form && preview) {

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
    // Cloudflare Pages + Formspree 版本：不攔截 submit，讓表單以 POST 正常送到 Formspree。

    if (copyBtn) {
      copyBtn.addEventListener('click', async function() {
        try {
          await navigator.clipboard.writeText(buildText());
          copyBtn.textContent = '已複製，可貼到 LINE';
          setTimeout(() => copyBtn.textContent = '複製內容給 LINE', 2000);
        } catch (err) {
          preview.select?.();
          copyBtn.textContent = '複製失敗，請手動複製';
          setTimeout(() => copyBtn.textContent = '複製內容給 LINE', 2000);
        }
      });
    }
  }
})();
