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

// ─────────────────────────────── Invoice modal ───────────────────────────────

// 從 /api/member/me 拿到的會員資料（用來預填 modal）；登入後第一次開 modal 才 fetch。
let cachedMember = null;

async function getMember() {
  if (cachedMember) return cachedMember;
  try {
    const data = await api("/api/member/me");
    cachedMember = data.member || {};
  } catch {
    cachedMember = {};
  }
  return cachedMember;
}

function ensureInvoiceModal() {
  let modal = document.getElementById("invoiceModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "invoiceModal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.style.cssText = "position:fixed;inset:0;background:rgba(4,18,13,0.78);z-index:9999;display:none;align-items:center;justify-content:center;padding:16px;";
  modal.innerHTML = `
    <div style="background:#0b1a14;color:var(--text,#fff8ec);max-width:520px;width:100%;border:1px solid rgba(111,240,180,0.3);border-radius:12px;padding:24px 22px 20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="margin:0;font-size:20px;">填寫發票資訊</h3>
        <button id="invoiceCloseBtn" type="button" aria-label="關閉" style="background:none;border:none;color:var(--muted,#a8b3a8);font-size:24px;cursor:pointer;line-height:1;">×</button>
      </div>
      <p class="muted" style="margin:0 0 14px;font-size:13px;">付款完成後自動開立電子發票，請填寫買受人資訊。</p>

      <div id="invoiceFormBody" class="form" style="display:grid;gap:12px;">
        <label style="display:grid;gap:6px;font-size:13px;">
          買受人類型
          <div style="display:flex;gap:12px;align-items:center;">
            <label style="display:flex;gap:6px;align-items:center;cursor:pointer;font-weight:normal;">
              <input type="radio" name="invoiceBuyerType" value="personal" checked /> 個人雲端發票
            </label>
            <label style="display:flex;gap:6px;align-items:center;cursor:pointer;font-weight:normal;">
              <input type="radio" name="invoiceBuyerType" value="company" /> 公司（三聯式）
            </label>
          </div>
        </label>

        <label style="display:grid;gap:6px;font-size:13px;">
          抬頭（個人填姓名 / 公司填公司名）
          <input id="invoiceBuyerName" type="text" maxlength="60" />
        </label>

        <label id="invoiceBuyerIdRow" style="display:none;grid-template-columns:1fr;gap:6px;font-size:13px;">
          統一編號（8 碼數字）
          <input id="invoiceBuyerId" type="text" inputmode="numeric" maxlength="8" pattern="\\d{8}" />
        </label>

        <label style="display:grid;gap:6px;font-size:13px;">
          收件 Email（綠界會寄發票通知）
          <input id="invoiceBuyerEmail" type="email" />
        </label>

        <div id="invoiceStatus" class="status" style="display:none;"></div>

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;">
          <button id="invoiceCancelBtn" class="btn" type="button">取消</button>
          <button id="invoiceConfirmBtn" class="btn primary" type="button">確認並前往結帳</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  function close() {
    modal.style.display = "none";
  }

  modal.querySelector("#invoiceCloseBtn").addEventListener("click", close);
  modal.querySelector("#invoiceCancelBtn").addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  modal.querySelectorAll('input[name="invoiceBuyerType"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const isCompany = modal.querySelector('input[name="invoiceBuyerType"]:checked').value === "company";
      modal.querySelector("#invoiceBuyerIdRow").style.display = isCompany ? "grid" : "none";
    });
  });

  return modal;
}

function getBuyerFromModal(modal) {
  const type = modal.querySelector('input[name="invoiceBuyerType"]:checked').value;
  const name = modal.querySelector("#invoiceBuyerName").value.trim();
  const id = modal.querySelector("#invoiceBuyerId").value.trim();
  const email = modal.querySelector("#invoiceBuyerEmail").value.trim();

  if (!name) return { error: "請填寫抬頭" };
  if (type === "company" && !/^\d{8}$/.test(id)) return { error: "公司發票必須填 8 碼統一編號" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email 格式錯誤" };

  return {
    buyer: {
      buyer_type: type,
      buyer_name: name,
      buyer_id: type === "company" ? id : null,
      buyer_email: email || null,
      carrier_type: "none"
    }
  };
}

async function openInvoiceModal() {
  const modal = ensureInvoiceModal();
  const member = await getMember();
  modal.querySelector("#invoiceBuyerName").value = member.name || "";
  modal.querySelector("#invoiceBuyerEmail").value = member.email || "";
  modal.querySelector("#invoiceBuyerId").value = "";
  modal.querySelector('input[name="invoiceBuyerType"][value="personal"]').checked = true;
  modal.querySelector("#invoiceBuyerIdRow").style.display = "none";
  const status = modal.querySelector("#invoiceStatus");
  status.style.display = "none";
  status.textContent = "";

  modal.style.display = "flex";

  return new Promise((resolve) => {
    const confirmBtn = modal.querySelector("#invoiceConfirmBtn");
    const cancelBtn = modal.querySelector("#invoiceCancelBtn");
    const closeBtn = modal.querySelector("#invoiceCloseBtn");

    function cleanup() {
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      closeBtn.onclick = null;
    }

    confirmBtn.onclick = () => {
      const result = getBuyerFromModal(modal);
      if (result.error) {
        status.className = "status error";
        status.style.display = "block";
        status.textContent = result.error;
        return;
      }
      modal.style.display = "none";
      cleanup();
      resolve(result.buyer);
    };

    const onCancel = () => {
      modal.style.display = "none";
      cleanup();
      resolve(null);
    };
    cancelBtn.onclick = onCancel;
    closeBtn.onclick = onCancel;
  });
}

// ───────────────────────────────── handlers ─────────────────────────────────

async function handlePurchase(planCode, button) {
  if (!token()) {
    const next = encodeURIComponent("/member-pricing");
    location.href = "/login?next=" + next;
    return;
  }
  const status = document.getElementById("pricingStatus");
  const originalText = button.textContent;
  if (status) {
    status.className = "status";
    status.textContent = "";
  }

  const buyer = await openInvoiceModal();
  if (!buyer) return;  // 使用者取消

  button.disabled = true;
  button.textContent = "前往綠界結帳…";

  try {
    const data = await api("/api/orders/create", {
      method: "POST",
      body: JSON.stringify({ plan_code: planCode, invoice_request: buyer })
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

// 暴露給 Next.js client component 在 useEffect 內手動觸發
window.loadPlans = loadPlans;
// Legacy 路徑（直接 <script src> 載入）也能自啟動
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadPlans);
} else {
  loadPlans();
}
