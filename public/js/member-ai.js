const CFG = window.XUNFENG_MEMBER_CONFIG || {};
const API_BASE = CFG.API_BASE || "";
function session(){ return window.XFSession || null; }
function token(){ const s = session(); return s ? s.token() : (localStorage.getItem("xunfeng_member_token") || ""); }
function clearToken(){ const s = session(); if(s) s.clear(); else localStorage.removeItem("xunfeng_member_token"); }
function $(id){ return document.getElementById(id); }

async function api(path, options={}){
  const s = session();
  if(s) return s.fetch(path, options);
  const headers = Object.assign({"Content-Type":"application/json"}, options.headers || {});
  if(token()) headers.Authorization = "Bearer " + token();
  const res = await fetch(API_BASE + path, Object.assign({}, options, {headers}));
  const data = await res.json().catch(() => ({}));
  if(!res.ok){
    // 錯誤碼與細節要一起帶上來，前端才判斷得出「這是點數不足」而不必比對中文字串。
    const err = new Error(data.error || ("API 錯誤：" + res.status));
    err.code = data.code || null;
    err.details = data.details || null;
    throw err;
  }
  return data;
}

function addMsg(role, text){
  const div = document.createElement("div");
  div.className = "msg " + (role === "user" ? "user" : "bot");
  div.textContent = text;
  $("messages").appendChild(div);
  $("messages").scrollTop = $("messages").scrollHeight;
}

async function loadMe(){
  try{
    const me = await api("/api/member/me");
    if(me.member.status !== "active") location.href = "/member";
    $("memberLine").textContent = `${me.member.name || me.member.email}｜${me.member.plan}｜剩餘 ${me.member.credits_remaining} 點｜到期 ${me.member.expires_at}`;
  }catch(e){
    location.href = "/login";
  }
}

// 對話歷史（不含開場白）。僅存在頁面記憶體，重整即清空。
const chatHistory = [];

function hideStarters(){
  const el = $("starters");
  if(el) el.style.display = "none";
}

function chatAgreed(){
  const cb = $("chatAgree");
  return !cb || cb.checked; // 無同意框（理論上不會）時不阻擋
}

async function sendChat(presetText){
  const input = $("message");
  const message = (presetText != null ? presetText : input.value).trim();
  if(!message) return;
  if(!chatAgreed()){
    addMsg("bot", "請先勾選下方「已閱讀並同意扣點規則」再送出。");
    return;
  }
  if(presetText == null) input.value = "";
  hideStarters();
  addMsg("user", message);
  $("sendBtn").disabled = true;
  $("sendBtn").textContent = "推演中…";
  try{
    const data = await api("/api/ai/chat", {method:"POST", body: JSON.stringify({
      message,
      history: chatHistory.slice(-12)
    })});
    // 成功才寫入歷史，失敗的回合不納入上下文
    chatHistory.push({role:"user", content: message});
    chatHistory.push({role:"assistant", content: data.reply});
    addMsg("bot", data.reply);
    $("memberLine").textContent = `${data.member.name || data.member.email}｜${data.member.plan}｜剩餘 ${data.member.credits_remaining} 點｜到期 ${data.member.expires_at}`;
  }catch(e){
    if(e.code === "INSUFFICIENT_CREDITS"){
      // 點數不足不是「系統提示」，是一個要有出口的狀態。
      // 只丟一句紅字，剛用完免費點數的會員就在這裡離開了。
      addCreditsNotice(e.details || {}, e.message);
    }else{
      addMsg("bot", "系統提示：" + e.message);
    }
  }finally{
    $("sendBtn").disabled = false;
    $("sendBtn").textContent = "送出";
  }
}
/**
 * 點數不足的氣泡：講清楚差多少，並直接給加購入口。
 * 用 textContent 逐段塞而不是 innerHTML——details 來自 API 回應，
 * 拼字串進 innerHTML 等於把它當成可信來源。
 */
function addCreditsNotice(details, message){
  const wrap = document.createElement("div");
  wrap.className = "msg bot credits-notice";

  const title = document.createElement("strong");
  title.textContent = "點數不足";
  wrap.appendChild(title);

  const body = document.createElement("p");
  const required = Number(details.required);
  const remaining = Number(details.remaining);
  body.textContent = Number.isFinite(required) && Number.isFinite(remaining)
    ? "本次需要 " + required + " 點，您目前剩 " + remaining + " 點。加購點數或升級方案後即可繼續，本次未扣點。"
    : (message || "點數已用完。加購點數或升級方案後即可繼續，本次未扣點。");
  wrap.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "credits-actions";

  const buy = document.createElement("a");
  buy.href = "/member-pricing";
  buy.className = "btn primary";
  buy.textContent = "前往加購點數";
  buy.setAttribute("data-xf-event", "credits_upgrade_from_chat");
  actions.appendChild(buy);

  const mine = document.createElement("a");
  mine.href = "/member";
  mine.className = "btn ghost";
  mine.textContent = "查看我的點數";
  actions.appendChild(mine);

  wrap.appendChild(actions);
  $("messages").appendChild(wrap);
  $("messages").scrollTop = $("messages").scrollHeight;
}

function logout(){ clearToken(); location.href = "/login"; }
function initMemberAi(){
  if(!$("sendBtn") || !$("message")) return; // DOM not ready
  loadMe();
  $("sendBtn").onclick = () => sendChat();
  $("message").addEventListener("keydown", e => {
    if(e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendChat();
  });
  // 建議問句：點擊直接送出對應問題
  document.querySelectorAll(".starter").forEach(btn => {
    btn.onclick = () => sendChat(btn.dataset.q || btn.textContent.trim());
  });
  // 同意扣點規則前，送出鈕保持停用，避免使用者沒看到規則就送出
  const agree = $("chatAgree");
  if(agree){
    const sync = () => { $("sendBtn").disabled = !agree.checked; };
    agree.addEventListener("change", sync);
    sync();
  }
}
// 暴露到 window，讓 Next.js client component 可在 useEffect 內手動呼叫
window.initMemberAi = initMemberAi;
window.logout = logout;
// Legacy 路徑（直接 <script src> 載入時）也能自啟動
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMemberAi);
} else {
  initMemberAi();
}
