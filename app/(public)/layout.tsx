import Script from "next/script";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { FloatingActions } from "@/components/FloatingActions";

/**
 * 公開頁面共用 layout — 注入全站 header / footer / 浮動操作 + cms-render.js。
 * Legacy HTML 頁面遷移後集中放在此 route group 下，確保 nav 與 footer 同步單一來源。
 */
export default function PublicLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <FloatingActions />
      <Script src="/js/cms-render.js" strategy="afterInteractive" />
    </>
  );
}
