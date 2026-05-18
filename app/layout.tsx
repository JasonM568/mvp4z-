import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "巽風堪輿研究中心｜風羿老師｜場域策略與風水顧問",
  description:
    "巽風堪輿研究中心提供陰陽宅堪驗、企業場域顧問、命名擇日、八字流年、課程講座與 AI 初步諮詢服務。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
