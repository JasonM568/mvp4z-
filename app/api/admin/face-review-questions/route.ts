import { NextRequest } from "next/server";
import { z } from "zod";
import { apiJson } from "../../_helpers";
import { requireAdmin, writeAdminAudit } from "@/lib/auth/admin";
import { errorMessage, errorStatus, statusError } from "@/lib/auth/member";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const SELECT =
  "id,question_id,topic,title,body,source_ref,related_rule_ids,status,answer,answered_by_name,answered_at,sort_order,updated_at";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { data, error } = await createSupabaseAdminClient()
      .from("face_review_questions")
      .select(SELECT)
      .order("sort_order", { ascending: true });
    if (error?.code === "42P01") return apiJson({ ok: true, questions: [], tableMissing: true });
    if (error) throw error;
    return apiJson({ ok: true, questions: data || [] });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

const answerSchema = z.object({
  id: z.string().uuid(),
  answer: z.string().trim().max(4000),
  answeredByName: z.string().trim().max(80),
  status: z.enum(["open", "answered", "deferred"])
}).strict().superRefine((value, context) => {
  // 標為已回覆卻沒有內容或沒有具名，事後就無法追溯是誰決定的。
  if (value.status !== "answered") return;
  if (value.answer.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["answer"], message: "標為已回覆時必須填寫回覆內容" });
  }
  if (value.answeredByName.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["answeredByName"], message: "標為已回覆時必須填寫回覆人姓名" });
  }
});

export async function PATCH(request: NextRequest) {
  try {
    const { profile } = await requireAdmin(request);
    const parsed = answerSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw statusError(parsed.error.issues[0]?.message || "回覆內容不正確", 400);
    const input = parsed.data;

    const admin = createSupabaseAdminClient();
    const { data: existing, error: readError } = await admin
      .from("face_review_questions")
      .select("question_id")
      .eq("id", input.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) throw statusError("找不到這個確認事項", 404);

    const { error } = await admin
      .from("face_review_questions")
      .update({
        answer: input.answer,
        answered_by_name: input.answeredByName,
        status: input.status,
        answered_by: input.status === "answered" ? profile?.id || null : null,
        answered_at: input.status === "answered" ? new Date().toISOString() : null
      })
      .eq("id", input.id);
    if (error) throw error;

    await writeAdminAudit({
      adminUserId: profile?.id || null,
      action: "face_review_question_answer",
      targetType: "face_review_question",
      targetId: existing.question_id,
      metadata: { status: input.status, answeredBy: input.answeredByName }
    });
    return apiJson({ ok: true });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}
