// 舊 Worker 相容層。2026-08-09 起站內前端已改呼叫 /api/member/redeem，
// 僅為使用者瀏覽器可能快取的舊版 member-auth.js 保留；確認無流量後整組移除。
export { POST } from "../member/redeem/route";
