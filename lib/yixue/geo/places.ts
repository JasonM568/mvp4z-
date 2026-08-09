// 巽風易學排盤引擎｜出生地經緯度
//
// 只為真太陽時校正而存在，因此經度是關鍵、緯度目前未用到（先留著，
// 未來若做日出日落或節氣相關的地方時會需要）。
//
// 不接 geocoding API：多一個外部相依、多一段延遲、且出生地屬個資，
// 沒必要送出站外。台灣縣市是封閉集合，常數表就夠。
//
// 座標取各縣市政府所在地。真太陽時每經度差 4 分鐘，即 0.1 度 ≈ 24 秒；
// 時辰以兩小時為單位，縣市級精度足夠。使用者若要更精確可手填經緯度。

export type Place = {
  label: string;
  longitude: number;
  latitude: number;
};

export const TAIWAN_PLACES: readonly Place[] = [
  { label: "臺北市", longitude: 121.5654, latitude: 25.033 },
  { label: "新北市", longitude: 121.4628, latitude: 25.0169 },
  { label: "基隆市", longitude: 121.7392, latitude: 25.1276 },
  { label: "桃園市", longitude: 121.301, latitude: 24.9937 },
  { label: "新竹市", longitude: 120.9675, latitude: 24.8138 },
  { label: "新竹縣", longitude: 121.0177, latitude: 24.8387 },
  { label: "苗栗縣", longitude: 120.8214, latitude: 24.5602 },
  { label: "臺中市", longitude: 120.6736, latitude: 24.1477 },
  { label: "彰化縣", longitude: 120.5161, latitude: 24.0518 },
  { label: "南投縣", longitude: 120.9719, latitude: 23.9609 },
  { label: "雲林縣", longitude: 120.4313, latitude: 23.7092 },
  { label: "嘉義市", longitude: 120.4491, latitude: 23.4801 },
  { label: "嘉義縣", longitude: 120.2555, latitude: 23.4518 },
  { label: "臺南市", longitude: 120.2269, latitude: 22.9999 },
  { label: "高雄市", longitude: 120.3014, latitude: 22.6273 },
  { label: "屏東縣", longitude: 120.494, latitude: 22.6761 },
  { label: "宜蘭縣", longitude: 121.7378, latitude: 24.7021 },
  { label: "花蓮縣", longitude: 121.6015, latitude: 23.9871 },
  { label: "臺東縣", longitude: 121.1444, latitude: 22.7583 },
  { label: "澎湖縣", longitude: 119.5664, latitude: 23.5655 },
  { label: "金門縣", longitude: 118.3186, latitude: 24.4321 },
  { label: "連江縣", longitude: 119.9499, latitude: 26.1608 }
];

const BY_LABEL = new Map(TAIWAN_PLACES.map((p) => [p.label, p]));

export function findPlace(label: string | null | undefined): Place | null {
  if (!label) return null;
  return BY_LABEL.get(label.trim()) ?? null;
}
