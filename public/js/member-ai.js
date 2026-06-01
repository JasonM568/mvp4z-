const CFG = window.XUNFENG_MEMBER_CONFIG || {};
const API_BASE = CFG.API_BASE || "";
function token(){ return localStorage.getItem("xunfeng_member_token") || ""; }
function clearToken(){ localStorage.removeItem("xunfeng_member_token"); }
function $(id){ return document.getElementById(id); }

async function api(path, options={}){
  const headers = Object.assign({"Content-Type":"application/json"}, options.headers || {});
  if(token()) headers.Authorization = "Bearer " + token();
  const res = await fetch(API_BASE + path, Object.assign({}, options, {headers}));
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(data.error || ("API 錯誤：" + res.status));
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
    const me = await api("/api/me");
    if(me.member.status !== "active") location.href = "/member";
    $("memberLine").textContent = `${me.member.name || me.member.email}｜${me.member.plan}｜剩餘 ${me.member.credits_remaining} 次｜到期 ${me.member.expires_at}`;
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

async function sendChat(presetText){
  const input = $("message");
  const message = (presetText != null ? presetText : input.value).trim();
  if(!message) return;
  if(presetText == null) input.value = "";
  hideStarters();
  addMsg("user", message);
  $("sendBtn").disabled = true;
  $("sendBtn").textContent = "推演中…";
  try{
    const data = await api("/api/chat", {method:"POST", body: JSON.stringify({
      message,
      history: chatHistory.slice(-12)
    })});
    // 成功才寫入歷史，失敗的回合不納入上下文
    chatHistory.push({role:"user", content: message});
    chatHistory.push({role:"assistant", content: data.reply});
    addMsg("bot", data.reply);
    $("memberLine").textContent = `${data.member.name || data.member.email}｜${data.member.plan}｜剩餘 ${data.member.credits_remaining} 次｜到期 ${data.member.expires_at}`;
  }catch(e){
    addMsg("bot", "系統提示：" + e.message);
  }finally{
    $("sendBtn").disabled = false;
    $("sendBtn").textContent = "送出";
  }
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
