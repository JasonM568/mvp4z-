export const FACE_ANALYSIS_CREDIT_COST = 20;

export function canUseFaceAnalysis(planCode: string) {
  return ["trial", "basic", "pro", "vip", "single_report"].includes(planCode.toLowerCase());
}

