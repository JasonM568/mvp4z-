const CFG = window.XUNFENG_MEMBER_CONFIG || {};
const API_BASE = CFG.API_BASE || "";

function session() {
  return window.XFSession || null;
}

function token() {
  const s = session();
  return s ? s.token() : localStorage.getItem("xunfeng_member_token") || "";
}

// 一律走 XFSession.fetch：access token 過期時會自動換發再重送，
// 不會讓使用者填完發票資料才收到「登入已過期」。
async function api(path, options = {}) {
  const s = session();
  if (s) return s.fetch(path, options);

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

// points：方案點數拆解（設計意圖，DB credits 為總和；報告每份 20 點、聊天每 1000 中文字 1 點，不分桶先扣先用）
const PLAN_PRESETS = {
  basic: {
    badge: "主力方案",
    description: "個人會員、學員、粉絲日常諮詢前置使用。",
    points: { report: 100, reportCount: 5, chat: 6 },
    features: ["八字流年初判", "風水方向建議", "掌訣課程問答"],
    cardClass: ""
  },
  pro: {
    badge: "進階服務",
    description: "深度學員、企業主與個案整理。",
    points: { report: 206, reportCount: 10, chat: 12 },
    features: ["企業場域初判", "陽宅初評整理", "進階命理推演"],
    cardClass: "primary"
  },
  vip: {
    badge: "VIP 尊享",
    description: "高頻使用者、決策者與企業顧問。",
    points: { report: 516, reportCount: 26, chat: 18 },
    features: ["全功能會員諮詢", "四象天機書大量點數", "優先客服與專屬服務"],
    cardClass: "gold"
  },
  single_report: {
    badge: "單次加購",
    description: "想再看一份報告，但還不需要整個月方案。",
    // 20 點剛好一份報告，不做報告／聊天拆解。
    points: null,
    features: ["可用於四象天機書或完整面相報告（每份 20 點）", "已有方案時直接加進現有點數，到期日不變"],
    cardClass: ""
  }
};

function formatPrice(price, currency, plan) {
  // 綠界走的是單次 AIO 付款，沒有定期定額。原本寫「/ 月」會讓人以為每月自動扣款，
  // 也會讓人以為再買一次等於續訂。改成講效期，加購則標明是單次。
  const unit = plan && plan.is_addon ? " / 單次" : " / " + (plan ? plan.duration_days : 30) + " 天";
  return (currency || "NT$") === "TWD"
    ? "NT$" + Number(price).toLocaleString("zh-TW") + unit
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
  const pts = preset.points;
  // 防呆：前台寫死的拆解（報告點 + 聊天點）必須等於 DB 的 plan.credits 總額，
  // 否則代表 migration 0013 改了點數但這裡沒同步 → 顯示會誤導，先 warn 提醒。
  if (pts && pts.report + pts.chat !== Number(plan.credits)) {
    console.warn(
      `[member-pricing] ${plan.code} 點數拆解不一致：` +
      `報告 ${pts.report} + 聊天 ${pts.chat} = ${pts.report + pts.chat}，` +
      `但 DB credits = ${plan.credits}。請同步 member-pricing.js 與 migration 0013。`
    );
  }
  const pointsLi = pts
    ? `<li>贈送 ${pts.report} 點（約 ${pts.reportCount} 次易學報告）</li>
       <li>額外贈送 ${pts.chat} 點（AI 即時問答用）</li>
       <li>點數效期 ${escapeHTML(plan.duration_days)} 天</li>`
    : plan.is_addon
      ? `<li>加購 ${escapeHTML(plan.credits)} 點</li>
         <li>已有有效方案時沿用原到期日；沒有方案則自購買起 ${escapeHTML(plan.duration_days)} 天</li>`
      : `<li>共 ${escapeHTML(plan.credits)} 點</li>
         <li>點數效期 ${escapeHTML(plan.duration_days)} 天</li>`;
  return `
    <article class="card">
      <span class="badge">${escapeHTML(preset.badge)}</span>
      <h2>${escapeHTML(plan.name)}</h2>
      <div class="price">${escapeHTML(formatPrice(plan.price, plan.currency, plan))}</div>
      <p>${escapeHTML(preset.description)}</p>
      <ul>
        ${pointsLi}
        ${featuresLi}
      </ul>
      <button class="${btnClass}" data-plan-code="${escapeHTML(plan.code)}">${plan.is_addon ? "單次加購" : "立即購買"}</button>
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

        <label id="invoiceDeliveryRow" style="display:grid;gap:6px;font-size:13px;">
          個人發票方式
          <select id="invoiceDeliveryType">
            <option value="email">雲端發票寄 Email</option>
            <option value="cellphone">手機條碼載具</option>
            <option value="donation">捐贈碼</option>
          </select>
        </label>

        <label id="invoiceCarrierRow" style="display:none;grid-template-columns:1fr;gap:6px;font-size:13px;">
          手機條碼載具
          <input id="invoiceCarrierNum" type="text" maxlength="8" placeholder="/ABC1234" />
        </label>

        <label id="invoiceDonationRow" style="display:none;grid-template-columns:1fr;gap:6px;font-size:13px;">
          捐贈碼（4-7 碼數字）
          <input id="invoiceDonationCode" type="text" inputmode="numeric" maxlength="7" />
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

  function syncInvoiceFields() {
    const isCompany = modal.querySelector('input[name="invoiceBuyerType"]:checked').value === "company";
    const delivery = modal.querySelector("#invoiceDeliveryType").value;
    modal.querySelector("#invoiceBuyerIdRow").style.display = isCompany ? "grid" : "none";
    modal.querySelector("#invoiceDeliveryRow").style.display = isCompany ? "none" : "grid";
    modal.querySelector("#invoiceCarrierRow").style.display = !isCompany && delivery === "cellphone" ? "grid" : "none";
    modal.querySelector("#invoiceDonationRow").style.display = !isCompany && delivery === "donation" ? "grid" : "none";
  }

  modal.querySelectorAll('input[name="invoiceBuyerType"]').forEach((radio) => {
    radio.addEventListener("change", syncInvoiceFields);
  });
  modal.querySelector("#invoiceDeliveryType").addEventListener("change", syncInvoiceFields);

  return modal;
}

function getBuyerFromModal(modal) {
  const type = modal.querySelector('input[name="invoiceBuyerType"]:checked').value;
  const name = modal.querySelector("#invoiceBuyerName").value.trim();
  const id = modal.querySelector("#invoiceBuyerId").value.trim();
  const email = modal.querySelector("#invoiceBuyerEmail").value.trim();
  const delivery = modal.querySelector("#invoiceDeliveryType").value;
  const carrierNum = modal.querySelector("#invoiceCarrierNum").value.trim().toUpperCase();
  const donationCode = modal.querySelector("#invoiceDonationCode").value.trim();

  if (!name) return { error: "請填寫抬頭" };
  if (type === "company" && !/^\d{8}$/.test(id)) return { error: "公司發票必須填 8 碼統一編號" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email 格式錯誤" };
  if (type === "personal" && delivery === "cellphone" && !/^\/[0-9A-Z.+-]{7}$/.test(carrierNum)) {
    return { error: "手機條碼需為 / 開頭加 7 碼英數符號" };
  }
  if (type === "personal" && delivery === "donation" && !/^\d{4,7}$/.test(donationCode)) {
    return { error: "捐贈碼需為 4-7 碼數字" };
  }

  return {
    buyer: {
      buyer_type: type,
      buyer_name: name,
      buyer_id: type === "company" ? id : null,
      buyer_email: email || null,
      carrier_type: type === "personal" && delivery === "cellphone" ? "cellphone" : "none",
      carrier_num: type === "personal" && delivery === "cellphone" ? carrierNum : null,
      donation_code: type === "personal" && delivery === "donation" ? donationCode : null
    }
  };
}

async function openInvoiceModal() {
  const modal = ensureInvoiceModal();
  const member = await getMember();
  modal.querySelector("#invoiceBuyerName").value = member.name || "";
  modal.querySelector("#invoiceBuyerEmail").value = member.email || "";
  modal.querySelector("#invoiceBuyerId").value = "";
  modal.querySelector("#invoiceCarrierNum").value = "";
  modal.querySelector("#invoiceDonationCode").value = "";
  modal.querySelector("#invoiceDeliveryType").value = "email";
  modal.querySelector('input[name="invoiceBuyerType"][value="personal"]').checked = true;
  modal.querySelector("#invoiceBuyerIdRow").style.display = "none";
  modal.querySelector("#invoiceDeliveryRow").style.display = "grid";
  modal.querySelector("#invoiceCarrierRow").style.display = "none";
  modal.querySelector("#invoiceDonationRow").style.display = "none";
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
  const status = document.getElementById("pricingStatus");
  const originalText = button.textContent;
  if (status) {
    status.className = "status";
    status.textContent = "";
  }

  // 先確認 session 真的還有效（必要時自動換發），再讓使用者去填發票資料。
  // 舊版只檢查 localStorage 有沒有 token，過期的 token 也算「已登入」，
  // 結果是填完表單、按下結帳才 401，訂單直接死在那裡。
  const s = session();
  // 從沒登入過的訪客不該看到「登入已過期」，那只會讓人一頭霧水，所以兩種情況用不同網址。
  const guestHref = "/login?next=" + encodeURIComponent("/member-pricing");
  const loginHref = guestHref + "&reason=expired";

  if (!token()) {
    location.href = guestHref;
    return;
  }

  if (s) {
    button.disabled = true;
    button.textContent = "確認登入狀態…";
    const member = await s.ensure();
    button.disabled = false;
    button.textContent = originalText;
    if (!member) {
      location.href = loginHref;
      return;
    }
    // ensure() 已經拿到最新的會員資料，直接餵進快取，發票抬頭與 Email 才會自動帶入；
    // 否則剛換發完的這一刻 cachedMember 可能還是先前失敗留下的空物件。
    cachedMember = member;
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
    // 換發也救不回來（refresh token 也過期）才會走到這裡：直接帶去登入頁，
    // 不要只丟一句錯誤訊息讓使用者卡住。
    if (e && e.status === 401) {
      setTimeout(() => { location.href = loginHref; }, 1200);
    }
  }
}

async function loadPlans() {
  const container = document.getElementById("planList");
  if (!container) return;
  container.innerHTML = '<div class="status">讀取方案…</div>';
  try {
    // 一般訪客只會看到 PLAN_PRESETS 裡列出的正式方案。
    // 網址帶 ?plan=CODE 時才把該方案要出來並顯示，供內部做刷卡實測用（例如 1 元測試方案）；
    // 沒帶這個參數時，內部方案連 /api/plans 的回傳裡都不會出現。
    const forcedPlanCode = new URLSearchParams(location.search).get("plan");
    const data = await api("/api/plans" + (forcedPlanCode ? "?include=" + encodeURIComponent(forcedPlanCode) : ""));
    const plans = (data.plans || []).filter(
      (p) => PLAN_PRESETS[p.code] || (forcedPlanCode && p.code === forcedPlanCode)
    );
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
