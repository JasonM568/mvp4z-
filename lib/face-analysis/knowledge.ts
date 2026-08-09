import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type FaceKnowledgeSource = { id: string; cardId: string; title: string; category: string; observation: string; editorSummary: string | null; sourceFile: string | null; sourcePages: number[] };

export async function getPublishedFaceKnowledge() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("face_knowledge_cards").select("id,card_id,title,category,observation,editor_summary,source_file,source_pages").eq("status", "published").eq("auto_report", true).eq("safety_level", "standard").order("updated_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data || []).map((row) => ({ id: row.id, cardId: row.card_id, title: row.title, category: row.category, observation: row.observation, editorSummary: row.editor_summary, sourceFile: row.source_file, sourcePages: row.source_pages || [] }));
}
