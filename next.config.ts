import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: false,

  // 面相報告 PDF 的中文字型是用 fs 讀的，Next.js 的檔案追蹤看不到這種相依，
  // 不明寫進來的話 Vercel 打包時不會帶上，正式站一產 PDF 就會 ENOENT。
  // pdfkit 自己也帶了 .afm 字型度量檔（標準 14 字型用），同樣要一起帶。
  outputFileTracingIncludes: {
    "/api/face-analysis/runs/[id]/pdf": [
      "./assets/fonts/NotoSansTC-Regular.otf",
      "./node_modules/pdfkit/js/data/**"
    ]
  }
};

export default nextConfig;
