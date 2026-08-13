export const FACE_ANALYSIS_BUCKET = "face-analysis-uploads";
export const FACE_ANALYSIS_CONSENT_VERSION = "2026-08-01";
export const FACE_IMAGE_RETENTION_HOURS = 24;
export const FACE_SIGNED_URL_TTL_SECONDS = 300;
export const FACE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const FACE_IMAGE_MAX_DIMENSION = 4096;
export const FACE_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

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
