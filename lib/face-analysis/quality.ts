import { FACE_QUALITY_THRESHOLDS } from "@/lib/face-analysis/config";
import { FaceProviderObservation } from "@/lib/face-analysis/quality-provider";
import { FaceQualityReason, FaceQualityResult } from "@/lib/face-analysis/types";

export function evaluateFaceQuality(input: {
  blurScore: number;
  brightnessScore: number;
  observation: FaceProviderObservation;
}): FaceQualityResult {
  const reasons: FaceQualityReason[] = [];
  const { observation, blurScore, brightnessScore } = input;
  const thresholds = FACE_QUALITY_THRESHOLDS;

  if (observation.faceCount === 0) reasons.push("NO_FACE");
  if (observation.faceCount > 1) reasons.push("MULTIPLE_FACES");
  if (observation.faceCount === 1 && observation.faceCoverage < thresholds.minimumFaceCoverage) {
    reasons.push("FACE_TOO_SMALL");
  }
  if (blurScore < thresholds.minimumBlurScore) reasons.push("TOO_BLURRY");
  if (brightnessScore < thresholds.minimumBrightnessScore) reasons.push("TOO_DARK");
  if (brightnessScore > thresholds.maximumBrightnessScore) reasons.push("TOO_BRIGHT");
  if (
    Math.abs(observation.pose.yaw) > thresholds.maximumYawDegrees ||
    Math.abs(observation.pose.pitch) > thresholds.maximumPitchDegrees ||
    Math.abs(observation.pose.roll) > thresholds.maximumRollDegrees
  ) {
    reasons.push("POSE_NOT_FRONT");
  }
  if (observation.occlusion.eyes || observation.occlusion.nose || observation.occlusion.mouth) {
    reasons.push("FACE_OCCLUDED");
  }

  return {
    faceCount: observation.faceCount,
    faceCoverage: observation.faceCoverage,
    blurScore,
    brightnessScore,
    pose: observation.pose,
    occlusion: observation.occlusion,
    passed: reasons.length === 0,
    reasons
  };
}

