import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "隱私權說明｜巽風堪輿研究中心",
  description: "巽風堪輿研究中心隱私權與預約資料使用說明。",
  keywords:
    "巽風堪輿研究中心,風羿老師,陽宅風水,陰宅風水,企業風水顧問,年度企業顧問,公司命名,新生兒取名,成人改名,擇日選時,八字流年,乾坤國寶,龍門八局,風水課程,AI風水顧問",
  openGraph: {
    title: "隱私權說明｜巽風堪輿研究中心",
    description: "巽風堪輿研究中心隱私權與預約資料使用說明。",
    type: "website"
  }
};

export default function PrivacyPage() {
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="tag">PRIVACY</div>
          <h1 className="hero-title">
            <span className="title-line title-main">隱私權政策</span>
            <span className="title-line accent">資料使用</span>
            <span className="title-line accent">聯繫說明</span>
          </h1>
          <p className="lead">
            本網站收集之預約資料，僅用於服務聯繫、需求判斷與後續顧問安排，不會任意轉售或公開客戶資料。
          </p>
        </div>
      </section>
      <section>
        <div className="wrap grid-2">
          <article className="panel">
            <h2>資料用途</h2>
            <p>
              姓名、電話、Email、LINE、地點、需求說明與預約時間，僅作為聯繫與服務安排之用。
            </p>
          </article>
          <article className="panel">
            <h2>現場案例</h2>
            <p>
              若需將案例公開於網站或社群，建議採去識別化方式處理，避免揭露客戶姓名、地址與敏感格局。
            </p>
          </article>
        </div>
      </section>
      <section>
        <div className="wrap">
          <article className="panel">
            <h2>面相分析照片與 AI 處理</h2>
            <p>
              面相分析功能只在會員主動同意後處理正面照片，用於拍攝品質檢查及產生民俗文化觀察報告。照片存放於私有空間，不作公開展示、身分辨識、模型訓練或廣告用途。
            </p>
            <p>
              原始照片預設在報告完成後 24 小時內刪除，會員亦可提前刪除照片或整份報告。報告文字可保留於會員紀錄；刪除整份報告後，只保留交易稽核所必要的最少資料。
            </p>
            <p>
              照片可能傳送至經核准且符合資料保留要求的 AI／影像服務商進行處理。上傳他人照片前，會員必須先取得照片本人明確同意。系統不推論疾病、犯罪傾向、種族、宗教、政治、性傾向或其他敏感屬性。
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
