// 舊 Worker 相容層。站內前端 logout() 只清 token、不打 API，此路徑已無呼叫者；
// 僅為使用者瀏覽器可能快取的舊版 JS 保留，確認無流量後整組移除。
export { POST } from "../auth/logout/route";
