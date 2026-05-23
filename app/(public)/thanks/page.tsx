import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "預約已送出｜巽風堪輿研究中心",
  description: "巽風堪輿研究中心預約表單已送出。"
};

export default function ThanksPage() {
  return (
    <section className="hero">
      <div className="wrap">
        <div className="panel">
          <div className="tag">BOOKING RECEIVED</div>
          <h1 className="hero-title">
            <span className="title-line title-main">預約資料已送出</span>
            <span className="title-line accent">後續將安排回覆</span>
          </h1>
          <p className="lead">
            感謝填寫巽風堪輿研究中心預約表單。後續將依服務類型、地點、時間與需求內容進行確認。
          </p>
          <div className="actions">
            <a
              className="btn btn-primary"
              href="https://lin.ee/W88wwDB"
              target="_blank"
              rel="noreferrer"
            >
              加入 LINE 官方帳號
            </a>
            <a className="btn btn-ghost" href="/">
              回到首頁
            </a>
            <a
              className="btn btn-ghost"
              href="/ai"
              target="_blank"
              rel="noreferrer"
            >
              使用 AI 初步諮詢
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
