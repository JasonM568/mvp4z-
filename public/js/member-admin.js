const CFG = window.XUNFENG_MEMBER_CONFIG || {};
const API_BASE = CFG.API_BASE || "";
function $(id){ return document.getElementById(id); }

async function adminApi(path, options={}){
  const headers = Object.assign({"Content-Type":"application/json","X-Admin-Key":$("adminKey").value.trim()}, options.headers || {});
  const res = await fetch(API_BASE + path, Object.assign({}, options, {headers}));
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw new Error(data.error || ("API 錯誤：" + res.status));
  return data;
}

async function createCode(){
  try{
    const data = await adminApi("/api/admin/create-code", {method:"POST", body:JSON.stringify({
      plan:$("plan").value,
      days:Number($("days").value || 30),
      credits:Number($("credits").value || 100),
      note:$("note").value.trim()
    })});
    $("codeResult").className = "status ok";
    $("codeResult").textContent = "啟用碼：" + data.code;
  }catch(e){
    $("codeResult").className = "status error";
    $("codeResult").textContent = e.message;
  }
}

async function loadMembers(){
  try{
    const data = await adminApi("/api/admin/members");
    const rows = data.members.map(m => `<tr>
      <td>${escapeHtml(m.name || "")}<br><small>${escapeHtml(m.email)}</small></td>
      <td>${escapeHtml(m.phone || "")}</td>
      <td>${escapeHtml(m.plan || "")}</td>
      <td>${escapeHtml(m.status || "")}</td>
      <td>${m.credits_remaining ?? 0}</td>
      <td>${escapeHtml(m.expires_at || "")}</td>
      <td>${escapeHtml(m.created_at || "")}</td>
    </tr>`).join("");
    $("members").innerHTML = `<table class="table">
      <thead><tr><th>會員</th><th>手機</th><th>方案</th><th>狀態</th><th>次數</th><th>到期</th><th>建立</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }catch(e){
    $("members").innerHTML = `<p class="status error">${escapeHtml(e.message)}</p>`;
  }
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
}
