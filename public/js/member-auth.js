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
    location.href = "member.html";
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
    location.href = "member.html";
  }catch(e){
    $("loginStatus").className = "status error";
    $("loginStatus").textContent = e.message;
  }
}

async function loadMember(){
  try{
    const me = await api("/api/me");
    $("memberName").textContent = me.member.name || me.member.email;
    $("memberPlan").textContent = me.member.plan || "尚未啟用";
    $("memberStatus").textContent = me.member.status || "pending";
    $("memberCredits").textContent = me.member.credits_remaining ?? 0;
    $("memberExpires").textContent = me.member.expires_at || "尚未啟用";
    const active = me.member.status === "active";
    $("enterAi").style.display = active ? "inline-flex" : "none";
    $("inactiveHint").style.display = active ? "none" : "block";
  }catch(e){
    location.href = "login.html";
  }
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
  location.href = "login.html";
}
