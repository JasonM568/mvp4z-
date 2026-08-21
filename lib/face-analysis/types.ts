export type FaceAnalysisMode = "self" | "other";

export type FaceAnalysisStatus =
  | "created"
  | "uploaded"
  | "quality_rejected"
  | "analyzing"
  | "completed"
  | "failed"
  | "expired"
  | "deleted";

export type FaceQualityReason =
  | "NO_FACE"
  | "MULTIPLE_FACES"
  | "FACE_TOO_SMALL"
  | "TOO_BLURRY"
  | "TOO_DARK"
  | "TOO_BRIGHT"
  | "POSE_NOT_FRONT"
  | "FACE_OCCLUDED"
  | "UNSUPPORTED_IMAGE"
  | "FILE_TOO_LARGE";

export type FaceQualityResult = {
  faceCount: number;
  faceCoverage: number;
  blurScore: number;
  brightnessScore: number;
  pose: { yaw: number; pitch: number; roll: number };
  occlusion: { eyes: boolean; nose: boolean; mouth: boolean };
  passed: boolean;
  reasons: FaceQualityReason[];
};

export type FaceAnalysisRun = {
  id: string;
  request_id: string;
  user_id: string;
  entitlement_id: string | null;
  mode: FaceAnalysisMode;
  subject_age: number | null;
  consent_version: string;
  third_party_consent: boolean;
  collaboration_assessment: boolean;
  collaboration_project: string | null;
  status: FaceAnalysisStatus;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  quality_result: FaceQualityResult | null;
  vision_result: unknown;
  report_structured: unknown;
  report_text: string | null;
  model_trace: Record<string, unknown>;
  analysis_attempts: number;
  upload_attempts: number;
  deletion_pending: boolean;
  usage_log_id: string | null;
  credits_charged: number;
  error_code: string | null;
  image_expires_at: string;
  image_deleted_at: string | null;
  completed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FaceRunPublicSummary = Pick<
  FaceAnalysisRun,
  | "id"
  | "request_id"
  | "mode"
  | "subject_age"
  | "status"
  | "quality_result"
  | "report_structured"
  | "report_text"
  | "credits_charged"
  | "image_deleted_at"
  | "completed_at"
  | "created_at"
  | "updated_at"
>;
