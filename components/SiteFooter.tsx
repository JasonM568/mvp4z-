"use client";

import { AiEntryButton } from "@/components/AiEntryButton";

/**
 * 全站共用 Footer — 結構與 legacy *.html 的 .footer 完全對齊。
 * 樣式由 styles/site.css 提供。data-site / data-link 屬性保留，
 * 由 public/js/cms-render.js 在 client 端動態填入內容。
 * AI 入口對已啟用付費會員切「進入 AI 會員版」（連 /member-ai/decision）。
 */
export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div>
          <h4 data-site="brand">巽風堪輿研究中心</h4>
          <p>
            專注於陰陽宅堪驗、企業場域、命名擇日、八字流年、課程講座與風水頻率理論建構。正式風水決策，需由風羿老師本人親至現場評估。
          </p>
        </div>
        <div>
          <h4>快速入口</h4>
          <div className="footer-list">
            <a href="/services">價格方案</a>
            <a href="/enterprise">年度企業顧問</a>
            <a href="/cases">案例實績</a>
            <AiEntryButton variant="footer" />
            <a href="/booking">預約表單</a>
          </div>
        </div>
        <div>
          <h4>聯絡資訊</h4>
          <div className="footer-list">
            <a
              data-link="line"
              href="https://lin.ee/W88wwDB"
              target="_blank"
              rel="noreferrer"
            >
              LINE 官方帳號
            </a>
            <a
              data-link="facebook"
              href="https://www.facebook.com/share/1CCqvG15fD/"
              target="_blank"
              rel="noreferrer"
            >
              Facebook 粉專
            </a>
            <a
              data-link="email"
              href="mailto:kingking0909@yahoo.com.tw"
              data-site="email"
            >
              kingking0909@yahoo.com.tw
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
