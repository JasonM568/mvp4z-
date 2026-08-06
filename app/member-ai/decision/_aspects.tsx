// 四象映射常數＋共鳴度圓環（SPEC：天機四象 · 順轉人生）
// 前端呈現用「定錨／觀風／測浪／感應」，術語只在進階設定區出現。
// 圓環用 SVG stroke-dasharray（不用 conic-gradient：html2canvas 不支援，儀表板與分享圖卡共用）。

import type { CouncilModules } from "./_form-config";

export type AspectKey = "bazi" | "qimen" | "liuyao" | "meihua";

export const ASPECT_CONFIG: Record<
  AspectKey,
  { name: string; sub: string; term: string; scanLabel: string; color: string }
> = {
  bazi: { name: "定錨", sub: "你的本質", term: "八字命理", scanLabel: "定錨：讀取八字本質", color: "#5ea8ff" },
  qimen: { name: "觀風", sub: "當前局勢", term: "奇門遁甲", scanLabel: "觀風：掃描奇門時局", color: "#6ff0b4" },
  liuyao: { name: "測浪", sub: "節點信號", term: "卜卦／六爻", scanLabel: "測浪：推演六爻節點", color: "#ffd166" },
  meihua: { name: "感應", sub: "環境訊息", term: "梅花易數", scanLabel: "感應：捕捉梅花信號", color: "#ff8d7a" }
};

export const ASPECT_ORDER: AspectKey[] = ["bazi", "qimen", "liuyao", "meihua"];

// 與後端 enabledAspectKeys 同步：全空保底八字
export function enabledAspects(modules: CouncilModules): AspectKey[] {
  const keys = ASPECT_ORDER.filter((k) => modules[k]);
  return keys.length ? keys : ["bazi"];
}

// 共鳴度標籤：「四象共鳴度」依啟用數變化
const CJK_COUNT = ["零", "一", "二", "三", "四"];
export function resonanceLabel(aspectCount: number) {
  return `${CJK_COUNT[aspectCount] || aspectCount}象共鳴度`;
}

export const SIGNAL_COLORS: Record<string, string> = {
  green: "#4ade80",
  yellow: "#facc15",
  red: "#f87171"
};

export function ResonanceRing({
  value,
  size = 132,
  stroke = 10,
  color = "#6ff0b4"
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}%`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,.12)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill="#fff"
        fontSize={size * 0.24}
        fontWeight={900}
      >
        {pct}%
      </text>
    </svg>
  );
}
