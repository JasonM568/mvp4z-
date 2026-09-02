"use client";

import { ContentListEditor } from "../_content-editor";

export default function SiteServicesPage() {
  return (
    <>
      <h1>老師服務</h1>
      <p className="lead">
        這裡維護前台「專業服務」頁（<code>/services</code>）的服務方案卡片。改完按上架，前台最多 30 秒內生效，
        不需要重新部署。未上架的項目只留在後台，前台看不到。
      </p>

      <ContentListEditor
        type="services"
        heading="服務方案"
        intro="每一筆就是 /services 頁上的一張價格卡。「站內連結」留空的話，卡片按鈕會自動導到預約表單 /booking。"
        uploadFolder="services"
        columns={[
          { key: "category", label: "分類" },
          { key: "price", label: "價格" }
        ]}
        fields={[
          { key: "title", label: "服務名稱", placeholder: "陰陽宅堪驗" },
          { key: "category", label: "分類", placeholder: "場域顧問／命名服務／企業方案" },
          { key: "price", label: "價格", placeholder: "NT$22,000 – 28,000 或 20 點 / 份" },
          { key: "href", label: "站內連結（選填）", placeholder: "/member-ai/decision", hint: "留空＝按鈕導向 /booking 預約表單" },
          { key: "note", label: "價格備註", kind: "textarea", placeholder: "超過 300 坪，另以坪數計算⋯" },
          { key: "description", label: "服務說明", kind: "textarea", placeholder: "住宅、別墅、店面⋯" }
        ]}
      />
    </>
  );
}
