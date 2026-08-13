import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FACE_PALACE_NAMES, type FaceRuleProfileSettings } from "@/lib/face-analysis/rules";

const feature = z.enum(["forehead","eyebrows","eyes","nose","cheeks","mouth","jaw","ears","glabella","nasalRoot","outerEyeCorners","tearTroughs","philtrum","chin"]);
const schema = z.object({ schemaVersion:z.literal("1.0"), palaces:z.array(z.object({name:z.enum(FACE_PALACE_NAMES),primary:z.array(feature).min(1),auxiliary:z.array(feature)}).strict()).length(12) }).strict().superRefine((value, context) => { if (new Set(value.palaces.map((item) => item.name)).size !== FACE_PALACE_NAMES.length) context.addIssue({ code:z.ZodIssueCode.custom, path:["palaces"], message:"palaces must be complete and unique" }); });
let cached: { value: { id:string; version:string; settings:FaceRuleProfileSettings } | null; expires:number } | null = null;
export async function loadPublishedFaceRuleProfile() {
  if (cached && cached.expires > Date.now()) return cached.value;
  const {data,error}=await createSupabaseAdminClient().from("face_rule_profiles").select("id,version_label,settings").eq("status","published").maybeSingle();
  if (error?.code === "42P01") return null;
  if (error) throw error;
  const parsed=schema.safeParse(data?.settings); const value=parsed.success&&data ? {id:data.id,version:data.version_label,settings:parsed.data as FaceRuleProfileSettings}:null;
  cached={value,expires:Date.now()+30_000}; return value;
}
export function invalidateFaceRuleProfileCache(){cached=null;}
