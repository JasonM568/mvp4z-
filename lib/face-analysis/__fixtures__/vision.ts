/** 測試用的 Vision 結果樣本。只在測試檔匯入，不供 app 端使用。 */

export const clearRegion = {
  visibility: "clear" as const,
  symmetry: "balanced" as const,
  relativeWidth: "medium" as const,
  relativeHeight: "medium" as const,
  contour: "rounded" as const,
  illumination: "even" as const,
  confidence: 0.9
};

/** 全部部位清楚可判讀、無表面特徵的基準樣本。 */
export const baselineVision = {
  schemaVersion: "3.0" as const,
  faceCount: 1 as const,
  orientation: { yaw: 0, pitch: 0, roll: 0, confidence: 0.95 },
  landmarks: { detected: true, coverage: 0.9, confidence: 0.95 },
  regions: {
    forehead: clearRegion,
    eyebrows: clearRegion,
    eyes: clearRegion,
    nose: clearRegion,
    cheeks: clearRegion,
    mouth: clearRegion,
    jaw: clearRegion,
    ears: clearRegion
  },
  details: {
    glabella: clearRegion,
    nasalRoot: clearRegion,
    outerEyeCorners: clearRegion,
    tearTroughs: clearRegion,
    philtrum: clearRegion,
    chin: clearRegion
  },
  distinctiveFeatures: [
    { feature: "eyebrowShape" as const, region: "eyebrows" as const, side: "bilateral" as const, observation: "眉線平直且眉尾略向外延伸", salience: 0.9, confidence: 0.9 },
    { feature: "eyeShape" as const, region: "eyes" as const, side: "bilateral" as const, observation: "眼裂橫向比例較長且上緣弧度平緩", salience: 0.85, confidence: 0.9 },
    { feature: "nasalBridge" as const, region: "nose" as const, side: "center" as const, observation: "鼻樑中央線條平直且寬度均勻", salience: 0.8, confidence: 0.88 },
    { feature: "lipShape" as const, region: "mouth" as const, side: "center" as const, observation: "上唇弓線明顯且下唇中央較飽滿", salience: 0.75, confidence: 0.86 },
    { feature: "chinShape" as const, region: "chin" as const, side: "center" as const, observation: "下巴末端呈圓弧且縱向長度適中", salience: 0.7, confidence: 0.85 }
  ],
  surfaceFeatures: [],
  complexion: { assessable: true, evenness: "even" as const, brightness: "moderate" as const, colorCast: "neutral" as const, possibleBeautyFilter: false, confidence: 0.9, limitation: "" },
  overallConfidence: 0.92,
  limitations: []
};

/**
 * E2E 用樣本：帶明顯形態差異與兩處表面特徵，
 * 用來實際觸發教材條文比對、流年併看法與斑痣宮位對應。
 */
export const e2eVision = {
  ...baselineVision,
  regions: {
    ...baselineVision.regions,
    forehead: { ...clearRegion, relativeWidth: "wide" as const, relativeHeight: "long" as const },
    cheeks: { ...clearRegion, contour: "rounded" as const },
    eyes: { ...clearRegion, relativeHeight: "short" as const }
  },
  details: {
    ...baselineVision.details,
    nasalRoot: { ...clearRegion, relativeHeight: "short" as const },
    glabella: { ...clearRegion, relativeWidth: "wide" as const }
  },
  surfaceFeatures: [
    { type: "mole" as const, region: "nose" as const, side: "left" as const, prominence: "visible" as const, description: "鼻樑左側一處深色小點", confidence: 0.82 },
    { type: "scar" as const, region: "eyebrows" as const, side: "right" as const, prominence: "subtle" as const, description: "右眉中段一道淺色細痕", confidence: 0.71 }
  ]
};
