import type { Metadata } from "next";
import { UxAnalytics } from "@/components/UxAnalytics";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.xunfeng.tw"),
  title: "四象問天機｜巽風堪輿研究中心",
  description:
    "命、局、卦、象，四術合參，一事定向。進入四象問天機、巽風面相與風羿老師專業服務。",
  openGraph: {
    title: "四象問天機｜巽風",
    description: "命、局、卦、象，四術合參，一事定向。",
    url: "https://www.xunfeng.tw",
    siteName: "巽風堪輿研究中心",
    locale: "zh_TW",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "四象問天機｜巽風" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "四象問天機｜巽風",
    description: "命、局、卦、象，四術合參，一事定向。",
    images: ["/og.png"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body id="top">{children}<UxAnalytics /></body>
    </html>
  );
}
