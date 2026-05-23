const CFG = window.XUNFENG_MEMBER_CONFIG || {};
const API_BASE = CFG.API_BASE || "";

function token() {
  return localStorage.getItem("xunfeng_member_token") || "";
}

async function api(path, options = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (token()) headers.Authorization = "Bearer " + token();
  const res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "API 錯誤：" + res.status);
  return data;
}

function escapeHTML(str) {
  return String(str || "").replace(/[&<>"']/g, (s) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[s]));
}

const PLAN_PRESETS = {
  basic: {
    badge: "主力方案",
    description: "個人會員、學員、粉絲日常諮詢前置使用。",
    features: ["八字流年初判", "風水方向建議", "掌訣課程問答"],
    cardClass: ""
  },
  pro: {
    badge: "進階服務",
    description: "深度學員、企業主與個案整理。",
    features: ["企業場域初判", "陽宅初評整理", "進階命理推演"],
    cardClass: "primary"
  },
  vip: {
    badge: "VIP 尊享",
    description: "高頻使用者、決策者與企業顧問。",
    features: ["全功能 AI 諮詢", "易學決策報告月免額度", "優先客服與專屬服務"],
    cardClass: "gold"
  }
};

function formatPrice(price, currency) {
  return (currency || "NT$") === "TWD"
    ? "NT$" + Number(price).toLocaleString("zh-TW") + " / 月"
    : currency + " " + price;
}

function planCardHTML(plan) {
  const preset = PLAN_PRESETS[plan.code] || {
    badge: "方案",
    description: "",
    features: [],
    cardClass: ""
  };
  const btnClass = preset.cardClass === "primary" ? "btn primary block" :
                   preset.cardClass === "gold" ? "btn gold block" : "btn block";
  const featuresLi = preset.features.map((f) => `<li>${escapeHTML(f)}</li>`).join("");
  return `
    <article class="card">
      <span class="badge">${escapeHTML(preset.badge)}</span>
      <h2>${escapeHTML(plan.name)}</h2>
      <div class="price">${escapeHTML(formatPrice(plan.price, plan.currency))}</div>
      <p>${escapeHTML(preset.description)}</p>
      <ul>
        <li>每期 ${escapeHTML(plan.credits)} 次問答</li>
        <li>方案週期 ${escapeHTML(plan.duration_days)} 天</li>
        ${featuresLi}
      </ul>
      <button class="${btnClass}" data-plan-code="${escapeHTML(plan.code)}">立即購買</button>
    </article>
  `;
}

function submitEcpayForm(checkout) {
  const form = document.createElement("form");
  form.method = checkout.method || "POST";
  form.action = checkout.action;
  form.style.display = "none";
  Object.entries(checkout.params || {}).forEach(([key, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = String(value);
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

async function handlePurchase(planCode, button) {
  if (!token()) {
    const next = encodeURIComponent("/member-pricing");
    location.href = "/login?next=" + next;
    return;
  }
  const status = document.getElementById("pricingStatus");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "前往綠界結帳…";
  if (status) {
    status.className = "status";
    status.textContent = "";
  }
  try {
    const data = await api("/api/orders/create", {
      method: "POST",
      body: JSON.stringify({ plan_code: planCode })
    });
    if (!data.checkout) throw new Error("付款資訊建立失敗");
    submitEcpayForm(data.checkout);
  } catch (e) {
    button.disabled = false;
    button.textContent = originalText;
    if (status) {
      status.className = "status error";
      status.textContent = e.message;
    }
  }
}

async function loadPlans() {
  const container = document.getElementById("planList");
  if (!container) return;
  container.innerHTML = '<div class="status">讀取方案…</div>';
  try {
    const data = await api("/api/plans");
    const plans = (data.plans || []).filter((p) => PLAN_PRESETS[p.code]);
    if (!plans.length) {
      container.innerHTML = '<div class="status error">目前沒有可購買的方案，請稍後再試。</div>';
      return;
    }
    container.innerHTML = plans.map(planCardHTML).join("");
    container.querySelectorAll("button[data-plan-code]").forEach((btn) => {
      btn.addEventListener("click", () => handlePurchase(btn.dataset.planCode, btn));
    });
  } catch (e) {
    container.innerHTML = `<div class="status error">讀取方案失敗：${escapeHTML(e.message)}</div>`;
  }
}

document.addEventListener("DOMContentLoaded", loadPlans);
