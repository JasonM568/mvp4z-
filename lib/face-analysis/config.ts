export const FACE_ANALYSIS_BUCKET = "face-analysis-uploads";
export const FACE_ANALYSIS_CONSENT_VERSION = "2026-08-01";
export const FACE_IMAGE_RETENTION_HOURS = 24;
export const FACE_SIGNED_URL_TTL_SECONDS = 300;
export const FACE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const FACE_IMAGE_MAX_DIMENSION = 4096;
export const FACE_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// 同一會員能同時掛著幾個「進行中」的任務，以及超過多久就不再算進行中。
// 兩者必須成對使用：只有上限沒有時間窗，中斷的任務會累加到帳號被永久擋下。
export const FACE_RUN_OPEN_LIMIT = 3;
export const FACE_RUN_OPEN_WINDOW_MINUTES = 30;
export const FACE_RUN_OPEN_WINDOW_MS = FACE_RUN_OPEN_WINDOW_MINUTES * 60 * 1000;

// 排程收尾門檻：created 是連照片都沒傳成功；uploaded / quality_rejected 留一天讓
// 會員接續；analyzing 超過 analyze function 的 maxDuration（300s）就視同被 kill。
export const FACE_RUN_STALE_CREATED_MINUTES = 30;
export const FACE_RUN_STALE_PENDING_HOURS = 24;
export const FACE_RUN_STALE_ANALYZING_MINUTES = 15;

export function isFaceAnalysisEnabled() {
  return process.env.FACE_ANALYSIS_ENABLED === "true";
}

export const FACE_QUALITY_THRESHOLDS = {
  minimumFaceCoverage: 0.18,
  maximumYawDegrees: 15,
  maximumPitchDegrees: 12,
  maximumRollDegrees: 10,
  // Laplacian variance is measured after a 640px grayscale downsample.
  // 0.55 rejected a clear, centered synthetic control portrait (0.2551),
  // so retain a conservative but achievable floor for normal mobile photos.
  minimumBlurScore: 0.2,
  minimumBrightnessScore: 0.25,
  maximumBrightnessScore: 0.92
} as const;
