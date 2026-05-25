(function () {
  const COURSE_CODE = "zhangzhongjue-115-01";
  const $ = (id) => document.getElementById(id);

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

  async function api(path, options) {
    const res = await fetch(path, Object.assign({
      headers: { "Content-Type": "application/json" }
    }, options || {}));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "系統忙碌中，請稍後再試");
    return data;
  }

  function status(message, type) {
    const el = $("courseCheckoutStatus");
    if (!el) return;
    el.className = "booking-preview course-checkout-status" + (type ? " " + type : "");
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  function syncInvoiceFields() {
    const buyerType = document.querySelector('input[name="courseInvoiceBuyerType"]:checked')?.value || "personal";
    const delivery = $("courseInvoiceDelivery")?.value || "email";
    const isCompany = buyerType === "company";
    $("courseInvoiceCompanyRow").style.display = isCompany ? "grid" : "none";
    $("courseInvoiceDeliveryRow").style.display = isCompany ? "none" : "grid";
    $("courseInvoiceCarrierRow").style.display = !isCompany && delivery === "cellphone" ? "grid" : "none";
    $("courseInvoiceDonationRow").style.display = !isCompany && delivery === "donation" ? "grid" : "none";
  }

  function selectedInterests() {
    return Array.from(document.querySelectorAll('input[name="courseInterests"]:checked')).map((x) => x.value);
  }

  function selectedRegistrationType() {
    return document.querySelector('input[name="courseRegistrationType"]:checked')?.value || "new";
  }

  function syncPrice(course) {
    const price = selectedRegistrationType() === "returning" ? course.price_returning : course.price_new;
    const label = selectedRegistrationType() === "returning" ? "複訓學員" : "新生報名";
    const el = $("courseSelectedPrice");
    if (el) el.textContent = `${label}｜NT$ ${Number(price).toLocaleString("zh-TW")}`;
  }

  function invoiceRequest() {
    const buyerType = document.querySelector('input[name="courseInvoiceBuyerType"]:checked')?.value || "personal";
    const buyerName = $("courseInvoiceBuyerName").value.trim() || $("courseName").value.trim();
    const buyerEmail = $("courseInvoiceBuyerEmail").value.trim() || $("courseEmail").value.trim();
    const buyerId = $("courseInvoiceBuyerId").value.trim();
    const delivery = $("courseInvoiceDelivery").value;
    const carrierNum = $("courseInvoiceCarrierNum").value.trim().toUpperCase();
    const donationCode = $("courseInvoiceDonationCode").value.trim();

    if (!buyerName) throw new Error("請填寫發票抬頭");
    if (buyerType === "company" && !/^\d{8}$/.test(buyerId)) throw new Error("公司發票必須填 8 碼統一編號");
    if (buyerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) throw new Error("發票 Email 格式錯誤");
    if (buyerType === "personal" && delivery === "cellphone" && !/^\/[0-9A-Z.+-]{7}$/.test(carrierNum)) {
      throw new Error("手機條碼需為 / 開頭加 7 碼英數符號");
    }
    if (buyerType === "personal" && delivery === "donation" && !/^\d{4,7}$/.test(donationCode)) {
      throw new Error("捐贈碼需為 4-7 碼數字");
    }

    return {
      buyer_type: buyerType,
      buyer_name: buyerName,
      buyer_id: buyerType === "company" ? buyerId : null,
      buyer_email: buyerEmail || null,
      carrier_type: buyerType === "personal" && delivery === "cellphone" ? "cellphone" : "none",
      carrier_num: buyerType === "personal" && delivery === "cellphone" ? carrierNum : null,
      donation_code: buyerType === "personal" && delivery === "donation" ? donationCode : null
    };
  }

  function payload() {
    const name = $("courseName").value.trim();
    const phone = $("coursePhone").value.trim();
    const email = $("courseEmail").value.trim();
    if (!name) throw new Error("請填寫姓名");
    if (!phone) throw new Error("請填寫聯絡電話");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("請填寫正確 Email");

    return {
      course_code: COURSE_CODE,
      registration_type: selectedRegistrationType(),
      name,
      gender: $("courseGender").value,
      phone,
      line_id: $("courseLineId").value.trim(),
      email,
      learning_background: $("courseLearningBackground").value,
      interests: selectedInterests(),
      motivation: $("courseMotivation").value.trim(),
      note: $("courseNote").value.trim(),
      invoice_request: invoiceRequest()
    };
  }

  async function init() {
    const form = $("courseCheckoutForm");
    if (!form) return;

    const params = new URLSearchParams(location.search);
    if (params.get("course_payment") === "paid") {
      status(`付款完成，訂單 ${params.get("order") || ""} 已送出。後台會同步看到這筆課程報名。`, "ok");
    } else if (params.get("course_payment")) {
      status("綠界已收到付款請求，系統會以綠界正式通知為準更新報名狀態。", "");
    }

    let course = null;
    try {
      const data = await api("/api/courses/checkout");
      course = data.course;
      syncPrice(course);
    } catch (error) {
      status(error.message, "error");
    }

    document.querySelectorAll('input[name="courseRegistrationType"]').forEach((el) => {
      el.addEventListener("change", () => course && syncPrice(course));
    });
    document.querySelectorAll('input[name="courseInvoiceBuyerType"]').forEach((el) => {
      el.addEventListener("change", syncInvoiceFields);
    });
    $("courseInvoiceDelivery").addEventListener("change", syncInvoiceFields);
    syncInvoiceFields();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = $("courseCheckoutSubmit");
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "建立訂單中...";
      status("", "");
      try {
        const data = await api("/api/courses/checkout", {
          method: "POST",
          body: JSON.stringify(payload())
        });
        if (!data.checkout) throw new Error("付款資訊建立失敗");
        button.textContent = "前往綠界結帳...";
        submitEcpayForm(data.checkout);
      } catch (error) {
        button.disabled = false;
        button.textContent = original;
        status(error.message, "error");
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
