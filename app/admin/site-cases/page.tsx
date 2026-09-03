"use client";

import { useState } from "react";
import { ContentListEditor } from "../_content-editor";
import { CoursePromoEditor } from "../_promo-editor";
import { CourseProductEditor } from "../_course-product-editor";

type Tab = "cases" | "courses" | "promo";

const TABS: { key: Tab; label: string }[] = [
  { key: "cases", label: "案例實績" },
  { key: "courses", label: "課程講座" },
  { key: "promo", label: "主打課程推廣" }
];

export default function SiteCasesPage() {
  const [tab, setTab] = useState<Tab>("cases");

  return (
    <>
      <h1>案例課程</h1>
      <p className="lead">
        這裡維護前台「案例實績」（<code>/cases</code>）與「課程講座」（<code>/courses</code>）兩頁的內容。
        改完按上架，前台最多 30 秒內生效，不需要重新部署。
      </p>

      <div className="admin-tab-row">
        {TABS.map((item) => (
          <button
            key={item.key}
            className={`admin-action-btn ${tab === item.key ? "" : "ghost"}`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "cases" && (
        <ContentListEditor
          type="cases"
          heading="案例實績"
          intro="每一筆就是 /cases 頁上的一張案例卡。圖片可以直接上傳，也可以貼現成的網址。"
          uploadFolder="cases"
          columns={[{ key: "category", label: "分類" }]}
          fields={[
            { key: "title", label: "案例標題", placeholder: "⚔️386【堪輿 × 設計⋯】" },
            { key: "category", label: "分類", placeholder: "陽宅場域／企業顧問／課程講座／命名品牌" },
            { key: "image", label: "案例照片", kind: "image" },
            { key: "summary", label: "一句話摘要", kind: "textarea" },
            { key: "body", label: "案例內文", kind: "textarea" }
          ]}
        />
      )}

      {tab === "courses" && (
        <ContentListEditor
          type="courses"
          heading="課程講座"
          intro="每一筆就是 /courses 頁下方課程列表的一張卡。開課時間、地點、費用、報名連結留空就不顯示。"
          uploadFolder="courses"
          columns={[
            { key: "audience", label: "適合對象" },
            { key: "schedule", label: "開課時間" }
          ]}
          fields={[
            { key: "title", label: "課程名稱", placeholder: "打造陽宅好風水" },
            { key: "audience", label: "適合對象", placeholder: "一般民眾、扶輪社、社團" },
            { key: "image", label: "課程圖片", kind: "image" },
            { key: "schedule", label: "開課時間（選填）", placeholder: "2026/06/21（日）10:00-17:00" },
            { key: "location", label: "上課地點（選填）", placeholder: "台中市南屯區黎明路二段530號" },
            { key: "price_text", label: "費用（選填）", placeholder: "NT$6,000（複訓 NT$500）" },
            { key: "href", label: "報名連結（選填）", placeholder: "/courses#courseCheckout 或完整網址" },
            { key: "description", label: "課程說明", kind: "textarea" }
          ]}
        />
      )}

      {tab === "promo" && <><CourseProductEditor /><CoursePromoEditor /></>}
    </>
  );
}
