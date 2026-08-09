"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useMemberSession } from "@/hooks/use-member-session";

const SERVICE_LINKS = [
  { href: "/services", label: "專業服務" },
  { href: "/enterprise", label: "企業顧問" },
  { href: "/booking", label: "預約諮詢" },
  { href: "/about", label: "關於風羿老師" }
];

const STORY_LINKS = [
  { href: "/cases", label: "案例實績" },
  { href: "/courses", label: "課程講座" }
];

export function SiteHeader({ showMobileDock = true }: { showMobileDock?: boolean }) {
  const pathname = usePathname();
  const { member } = useMemberSession();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  const accountHref = member ? "/member" : "/login?next=" + encodeURIComponent(pathname || "/member");
  const accountLabel = member ? "我的巽風" : "會員登入";
  const dock = mobileDock(pathname);

  return (
    <>
      <header className="topbar xf-site-header">
        <div className="wrap nav">
          <a className="brand" href="/" aria-label="巽風首頁">
            <div className="brand-mark">巽</div>
            <div>
              <div className="brand-title">巽風堪輿</div>
              <div className="brand-sub">XUNFENG FIELD STRATEGY</div>
            </div>
          </a>

          <button
            className="xf-menu-toggle"
            type="button"
            aria-expanded={open}
            aria-controls="xf-main-menu"
            aria-label={open ? "關閉主選單" : "開啟主選單"}
            onClick={() => setOpen((value) => !value)}
          >
            <span /><span /><span />
          </button>

          <nav id="xf-main-menu" className={"xf-main-menu" + (open ? " is-open" : "")} aria-label="主選單">
            <a className={active(pathname, "/member-ai/decision")} href="/member-ai/decision" data-xf-event="nav_four_aspects">四象問天機</a>
            <a className={active(pathname, "/member-ai/face")} href="/member-ai/face" data-xf-event="nav_face">面相系統</a>
            <NavGroup label="老師服務" links={SERVICE_LINKS} pathname={pathname} />
            <NavGroup label="案例與課程" links={STORY_LINKS} pathname={pathname} />
            <a className={active(pathname, "/member-pricing")} href="/member-pricing">會員方案</a>
            <a className="xf-account-link" href={accountHref} data-xf-event="nav_account">
              <span>{accountLabel}</span>
              {member && <small>{String(member.plan || "free").toUpperCase()}・{member.credits_remaining ?? 0} 點</small>}
            </a>
          </nav>
        </div>
      </header>
      {showMobileDock && (
        <nav className="xf-mobile-cta" aria-label="本頁快速操作">
          <a href={dock.href} data-xf-event="mobile_primary_cta">{dock.label}</a>
        </nav>
      )}
    </>
  );
}

function NavGroup({
  label,
  links,
  pathname
}: {
  label: string;
  links: { href: string; label: string }[];
  pathname: string;
}) {
  const selected = links.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
  return (
    <details className="xf-nav-group">
      <summary className={selected ? "active" : ""}>{label}<span aria-hidden>⌄</span></summary>
      <div className="xf-nav-popover">
        {links.map((item) => <a className={active(pathname, item.href)} href={item.href} key={item.href}>{item.label}</a>)}
      </div>
    </details>
  );
}

function active(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/") ? "active" : "";
}

function mobileDock(pathname: string) {
  if (pathname.startsWith("/member-ai/face")) return { href: "/member-ai/face", label: "開始品質檢查" };
  if (pathname.startsWith("/member-ai/decision")) return { href: "/member-ai/decision", label: "生成天機書" };
  if (pathname.startsWith("/services") || pathname.startsWith("/enterprise") || pathname.startsWith("/cases")) {
    return { href: "/booking", label: "預約風羿老師" };
  }
  if (pathname.startsWith("/member")) return { href: "/member", label: "回到我的巽風" };
  return { href: "/member-ai/decision", label: "開始問天機" };
}
