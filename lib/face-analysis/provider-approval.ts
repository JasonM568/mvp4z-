import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type FaceProviderApproval = {
  id: string;
  organization_label: string;
  project_label: string;
  retention_mode: "zero_data_retention";
  approved_at: string;
  status: "active" | "revoked";
  verified_at: string;
  verified_by: string;
};

export async function getActiveOpenAIZdrApproval(): Promise<FaceProviderApproval | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("face_provider_approvals")
    .select("id,organization_label,project_label,retention_mode,approved_at,status,verified_at,verified_by")
    .eq("provider", "openai")
    .eq("status", "active")
    .eq("attested", true)
    .maybeSingle();
  if (error?.code === "42P01") return null;
  if (error) throw error;
  return data as FaceProviderApproval | null;
}
