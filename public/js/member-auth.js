const CFG = window.XUNFENG_MEMBER_CONFIG || {};
const API_BASE = CFG.API_BASE || "";

function token(){ return localStorage.getItem("xunfeng_member_token") || ""; }
function setToken(t){ localStorage.setItem("xunfeng_member_token", t); }
function clearToken(){ localStorage.removeItem("xunfeng_member_token"); }

async function api(path, options={}){
  const headers = Object.assign({"Content-Type":"application/json"}, options.headers || {});
  if(token()) headers.Authorization = "Bearer " + token();
  const res = await fetch(API_BASE + path, Object.assign({}, options, {headers}));
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(data.error || ("API 錯誤：" + res.status));
  return data;
}

function $(id){ return document.getElementById(id); }

async function registerMember(){
  const payload = {
    name: $("name").value.trim(),
    email: $("email").value.trim(),
    phone: $("phone").value.trim(),
    password: $("password").value
  };
  try{
    const data = await api("/api/register",{method:"POST",body:JSON.stringify(payload)});
    setToken(data.token);
    $("status").className = "status ok";
    $("status").textContent = "註冊成功，請輸入付款後取得的會員啟用碼。";
    location.href = "/member";
  }catch(e){
    $("status").className = "status error";
    $("status").textContent = e.message;
  }
}

async function loginMember(){
  try{
    const data = await api("/api/login",{method:"POST",body:JSON.stringify({
      email:$("loginEmail").value.trim(),
      password:$("loginPassword").value
    })});
    setToken(data.token);
    location.href = "/member";
  }catch(e){
    $("loginStatus").className = "status error";
    $("loginStatus").textContent = e.message;
  }
}

async function forgotPasswordMember(){
  const email = ($("forgotEmail").value || "").trim();
  if(!email){
    $("forgotStatus").className = "status error";
    $("forgotStatus").textContent = "請填寫 Email";
    return;
  }
  try{
    await api("/api/auth/forgot-password",{method:"POST",body:JSON.stringify({email})});
    $("forgotStatus").className = "status ok";
    $("forgotStatus").textContent = "若此 Email 有註冊，重設密碼信已寄出，請查收信箱（含垃圾信件夾）。";
  }catch(e){
    $("forgotStatus").className = "status error";
    $("forgotStatus").textContent = e.message;
  }
}

function showPaymentResult(){
  const banner = $("paymentBanner");
  if(!banner) return;
  const params = new URLSearchParams(location.search);
  const payment = params.get("payment");
  if(!payment) return;
  if(payment === "paid"){
    banner.className = "status ok";
    banner.textContent = "付款完成，方案已自動開通。";
  }else if(payment === "pending"){
    banner.className = "status";
    banner.textContent = "綠界已收到付款請求，系統會在收到正式確認後自動開通。";
  }else{
    banner.className = "status error";
    banner.textContent = "付款未完成或被取消，請重新嘗試。";
  }
  banner.style.display = "block";
}

async function loadMember(){
  showPaymentResult();
  try{
    const me = await api("/api/me");
    const m = me.member;
    $("memberName").textContent = m.name || m.email;
    $("memberPlan").textContent = m.plan || "尚未啟用";
    $("memberStatus").textContent = m.status || "pending";
    $("memberCredits").textContent = m.credits_remaining ?? 0;
    $("memberExpires").textContent = m.expires_at || "尚未啟用";

    const active = m.status === "active";
    if($("enterAi")) $("enterAi").style.display = active ? "inline-flex" : "none";
    if($("buyPlanCta")) $("buyPlanCta").style.display = active ? "none" : "inline-flex";
    if($("activePanel")) $("activePanel").style.display = active ? "block" : "none";
    if($("pendingPanel")) $("pendingPanel").style.display = active ? "none" : "block";
    if($("inactiveHint")) $("inactiveHint").style.display = active ? "none" : "block";
  }catch(e){
    location.href = "/login";
  }
}

function toggleRedeem(){
  const panel = $("redeemPanel");
  if(!panel) return;
  panel.style.display = panel.style.display === "block" ? "none" : "block";
}

// legacy <body onload="loadMember()"> 的屬性會被 Next.js RootLayout 的 <body>
// 覆蓋（dangerouslySetInnerHTML 只接收 body 內容，body tag 本身屬性丟失）。
// 改用元素判別 + readyState 自啟動。/login 也載這個 script，但沒有 memberName 元素，
// 不會被誤觸發。
function initMemberPage(){
  if(document.getElementById("memberName")) loadMember();
}
// 暴露給 Next.js client component 在 useEffect 內手動觸發
window.initMemberPage = initMemberPage;
window.loginMember = loginMember;
window.registerMember = registerMember;
window.forgotPasswordMember = forgotPasswordMember;
window.redeemCode = redeemCode;
window.toggleRedeem = toggleRedeem;
window.logout = logout;
if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", initMemberPage);
}else{
  initMemberPage();
}

async function redeemCode(){
  try{
    const data = await api("/api/redeem",{method:"POST",body:JSON.stringify({code:$("code").value.trim()})});
    $("redeemStatus").className = "status ok";
    $("redeemStatus").textContent = "啟用成功：" + data.plan + "，可用次數：" + data.credits_remaining;
    await loadMember();
  }catch(e){
    $("redeemStatus").className = "status error";
    $("redeemStatus").textContent = e.message;
  }
}

function logout(){
  clearToken();
  location.href = "/login";
}
