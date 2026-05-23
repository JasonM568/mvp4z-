type MemberBadge = {
  plan?: string;
  credits_remaining?: number;
} | null;

type SiteHeaderProps = {
  /** 顯示會員狀態徽章 — 通常只在會員專屬頁面（/member-ai/decision、/admin 等）使用 */
  member?: MemberBadge;
};

/**
 * 全站共用主導覽 — 結構與 legacy index.html 的 .topbar / .nav-links 完全對齊，
 * 樣式由 styles/site.css 提供。Next.js 原生頁面（decision、admin-login 等）使用，
 * legacy HTML 頁面已自帶各自的 header 不用此 component。
 */
export function SiteHeader({ member }: SiteHeaderProps) {
  return (
    <header className="topbar">
      <div className="wrap nav">
        <a className="brand" href="/" aria-label="巽風堪輿研究中心">
          <div className="brand-mark">巽</div>
          <div>
            <div className="brand-title">巽風堪輿</div>
            <div className="brand-sub">XUNFENG FIELD STRATEGY</div>
          </div>
        </a>

        <nav className="nav-links" aria-label="主選單">
          <a href="/about">關於巽風</a>
          <a href="/services">服務方案</a>
          <a href="/enterprise">企業顧問</a>
          <a href="/cases">案例實績</a>
          <a href="/courses">課程講座</a>
          <a href="/booking">預約表單</a>
          <a href="/member-ai/decision">易學決策報告</a>
          <a href="/member-pricing">會員方案</a>
          <a className="btn btn-ghost" href="/ai" target="_blank" rel="noreferrer">
            AI 初步諮詢
          </a>
          {member ? (
            <span
              className="btn btn-ghost"
              style={{ pointerEvents: "none", opacity: 0.85 }}
            >
              {(member.plan || "").toUpperCase()} ｜ 剩 {member.credits_remaining ?? 0} 點
            </span>
          ) : (
            <a className="btn btn-ghost" href="/login">登入</a>
          )}
          <a
            className="btn btn-primary"
            href="https://lin.ee/W88wwDB"
            target="_blank"
            rel="noreferrer"
          >
            LINE 預約
          </a>
        </nav>
      </div>
    </header>
  );
}
