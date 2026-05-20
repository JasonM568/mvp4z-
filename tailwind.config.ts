import type { Config } from "tailwindcss";

// 巽風 v2 Tailwind 設定
// 為避免污染既有 legacy 頁面（用 site.css/member.css），預設 corePlugins.preflight = false
// 只啟用 utilities（class 名稱式樣式），不對 html/body/button/input 等做 reset

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {}
  },
  plugins: []
};

export default config;
