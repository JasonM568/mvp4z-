/**
 * 巽風前台會員 session 共用層。
 *
 * 背景：Supabase 的 access token 只有 1 小時，前台原本只把它存在 localStorage，
 * refresh token 直接丟掉。結果是登入超過一小時後畫面仍顯示「已登入」，
 * 使用者一路填完發票資料、按下結帳才收到「登入已過期，請重新登入」，等於買不到東西。
 *
 * 這一層負責：存兩顆 token、碰到 401 自動用 refresh token 換一張新的再重送一次、
 * 換不到才真的要求重新登入。所有前台頁面共用，避免每個檔案各寫一套 fetch。
 */
(function () {
  if (window.XFSession) return;

  var TOKEN_KEY = "xunfeng_member_token";
  var REFRESH_KEY = "xunfeng_member_refresh";
  var CFG = window.XUNFENG_MEMBER_CONFIG || {};
  var API_BASE = CFG.API_BASE || "";
  var refreshing = null;

  function read(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (e) {
      return "";
    }
  }

  function write(key, value) {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch (e) {
      // 無痕模式等情況存不了，就退化成「這一次瀏覽有效」，不要讓整頁壞掉。
    }
  }

  function token() { return read(TOKEN_KEY); }
  function refreshToken() { return read(REFRESH_KEY); }

  /** 登入／註冊／換發成功後統一由這裡寫入，避免有人只存了 access token。 */
  function save(data) {
    if (!data || !data.token) return null;
    write(TOKEN_KEY, data.token);
    write(REFRESH_KEY, data.refresh_token || "");
    return data.token;
  }

  function clear() {
    write(TOKEN_KEY, "");
    write(REFRESH_KEY, "");
  }

  /**
   * 用 refresh token 換新的 access token。
   * 同時間只會有一個換發請求在跑，避免頁面同時發三支 API 就打三次 refresh。
   */
  function refresh() {
    if (refreshing) return refreshing;
    var rt = refreshToken();
    if (!rt) return Promise.resolve(null);

    refreshing = fetch(API_BASE + "/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt })
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) { return data && data.token ? save(data) : null; })
      .catch(function () { return null; })
      .then(function (result) {
        // 換不到就把舊憑證清掉，讓畫面誠實地回到「未登入」，不要再假裝還登著。
        if (!result) clear();
        refreshing = null;
        return result;
      });

    return refreshing;
  }

  function withAuth(options, bearer) {
    var next = Object.assign({}, options);
    var isFormData = typeof FormData !== "undefined" && next.body instanceof FormData;
    next.headers = Object.assign(
      isFormData ? {} : { "Content-Type": "application/json" },
      options.headers || {}
    );
    if (bearer) next.headers.Authorization = "Bearer " + bearer;
    return next;
  }

  /** 帶授權的 fetch：401 時自動換一次 token 再重送，仍失敗才丟錯。 */
  async function request(path, options) {
    options = options || {};
    var res = await fetch(API_BASE + path, withAuth(options, token()));

    if (res.status === 401 && refreshToken()) {
      var fresh = await refresh();
      if (fresh) res = await fetch(API_BASE + path, withAuth(options, fresh));
    }

    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      var error = new Error(data.error || "API 錯誤：" + res.status);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  /**
   * 確認目前真的還登著（必要時先換發）。回傳 member 物件，沒登入或換不回來就回 null。
   * 用在「按下去會走很長流程」的動作之前，例如結帳 —— 讓使用者在填表前就知道要重新登入，
   * 而不是填完才失敗。
   */
  async function ensure() {
    if (!token() && !refreshToken()) return null;
    try {
      var data = await request("/api/member/me", { method: "GET" });
      return data && data.member ? data.member : null;
    } catch (e) {
      // 伺服器明確說這組憑證不認，就清掉，別讓後面每一頁都繼續拿著壞 token 打 401。
      if (e && e.status === 401) clear();
      return null;
    }
  }

  function loginUrl(next) {
    var target = next || location.pathname + location.search;
    return "/login?next=" + encodeURIComponent(target);
  }

  window.XFSession = {
    TOKEN_KEY: TOKEN_KEY,
    REFRESH_KEY: REFRESH_KEY,
    token: token,
    refreshToken: refreshToken,
    save: save,
    clear: clear,
    refresh: refresh,
    fetch: request,
    ensure: ensure,
    loginUrl: loginUrl
  };
})();
