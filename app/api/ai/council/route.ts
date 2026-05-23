// 巽風易學決策系統｜council 報告 API
// 流程：會員驗證 → 等級檢查 → 月免額度判定 → 7 次 LLM 校核 → 寫 usage_logs + council_runs → 原子扣點
// 不預扣點：LLM 跑完才扣，function 被 kill 也不會造成 credits 黑洞
// Race case：報告已寫但 RPC 衝突時送這一份（記錄 credits_charged=0）

import { NextRequest } from "next/server";
import { apiJson } from "../../_helpers";
import {
  errorMessage,
  errorStatus,
  getPublicMember,
  readJson,
  requireBearerProfile,
  statusError
} from "@/lib/auth/member";
import { resolveTierFeatures, TierFeatures } from "@/lib/auth/tier";
import { getMonthlyCouncilUsage } from "@/lib/auth/council-quota";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { councilSchema, CouncilRequest } from "@/lib/ai/council/schema";
import {
  CouncilInput,
  debatePrompt,
  deepseekAttackSystem,
  fengYiFinalSystem,
  finalSummaryPrompt,
  firstRoundPrompt,
  geminiFengYiSystem,
  openaiFengYiSystem
} from "@/lib/ai/council/personas";
import {
  callDeepSeek,
  callGemini,
  callOpenAI,
  ModelResult,
  stringifyRound,
  sumTokens
} from "@/lib/ai/council/providers";
import {
  buildFinalFormatPrompt,
  buildQualityGate,
  buildSafeFallbackReport,
  cleanReportText,
  hasUsableFinal
} from "@/lib/ai/council/quality";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireBearerProfile(request);
    const input = (await readJson(request, councilSchema)) as CouncilRequest;
    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // 1. 取得 active entitlement（含 tier_features）
    const { data: entitlement, error: entitlementError } = await admin
      .from("member_entitlements")
      .select("id, user_id, plan_id, status, credits_remaining, expires_at, tier_features, plans(code, name)")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .gte("expires_at", now)
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (entitlementError) throw entitlementError;
    if (!entitlement) throw statusError("會員尚未啟用或已到期", 403);

    // 2. 解析等級權限
    const planCode = getPlanCode(entitlement.plans);
    const tier = resolveTierFeatures({
      planCode,
      tierFeatures: (entitlement.tier_features || {}) as TierFeatures
    });
    if (!tier.canUseCouncil) {
      throw statusError("目前方案不含易學決策報告，請升級至基礎會員以上", 403);
    }

    // 3. 計算本月免費額度使用量
    let freeQuotaUsed = false;
    let creditsToCharge = tier.councilCost;

    if (tier.monthlyFreeQuota > 0) {
      const usage = await getMonthlyCouncilUsage({ userId: profile.id });
      if (usage.freeQuotaUsedThisMonth < tier.monthlyFreeQuota) {
        freeQuotaUsed = true;
        creditsToCharge = 0;
      }
    }

    // 4. 點數預檢（不扣點，僅驗證足額；正式扣點在 LLM 跑完才執行）
    const previousCredits = Number(entitlement.credits_remaining || 0);
    if (creditsToCharge > 0 && previousCredits < creditsToCharge) {
      throw statusError("點數不足，請先儲值或升級方案", 403);
    }

    // 5. 組 council input
    const qualityGate = buildQualityGate(input as CouncilInput);
    const councilInput: CouncilInput = {
      ...input,
      question: input.question.trim(),
      context: `${(input.context || "").trim()}\n\n${qualityGate}`,
      clientProfile: input.clientProfile?.trim() || "",
      topic: input.topic || "未指定",
      deliverableMode: input.deliverableMode || "商業決策顧問報告"
    };

    // 6. 第一輪：三模型平行
    const firstPrompt = buildFirstRoundPrompt(councilInput, qualityGate);
    const firstRound = await Promise.all([
      callOpenAI("openaiFengYi", "巽風主判讀分身", openaiFengYiSystem(), firstPrompt),
      callGemini("geminiFengYi", "巽風策略推演分身", geminiFengYiSystem(), firstPrompt),
      callDeepSeek("deepseekAttack", "巽風攻防反證分身", deepseekAttackSystem(), firstPrompt)
    ]);
    const firstRoundText = stringifyRound("第一輪：巽風多維初判", firstRound);
    const firstTokens = sumTokens(firstRound);

    // 7. 第二輪：攻防修正（可由 env 關閉）
    let debateRound: ModelResult[] = [];
    let debateRoundText = "第二輪攻防未啟用。";
    let debateTokens = { in: 0, out: 0 };
    const enableDebate = (process.env.ENABLE_DEBATE_ROUND || "true").toLowerCase() === "true";
    if (enableDebate) {
      const secondPrompt = buildDebatePrompt(councilInput, firstRoundText, qualityGate);
      debateRound = await Promise.all([
        callOpenAI("openaiFengYi", "巽風主判讀分身｜修正", openaiFengYiSystem(), secondPrompt),
        callGemini("geminiFengYi", "巽風策略推演分身｜修正", geminiFengYiSystem(), secondPrompt),
        callDeepSeek("deepseekAttack", "巽風攻防反證分身｜修正", deepseekAttackSystem(), secondPrompt)
      ]);
      debateRoundText = stringifyRound("第二輪：巽風多維攻防修正", debateRound);
      debateTokens = sumTokens(debateRound);
    }

    // 8. 終稿
    const finalPrompt = buildFinalPrompt(councilInput, firstRoundText, debateRoundText, qualityGate);
    const final = await callOpenAI(
      "finalChatGPT",
      "風羿老師最終定稿分身",
      fengYiFinalSystem(),
      finalPrompt
    );

    const finalOk = hasUsableFinal(final);
    const fallbackUsed = !finalOk;
    const finalLabel = finalOk ? final.label : "風羿老師備援交付稿";
    const finalText = finalOk
      ? cleanReportText(final.text)
      : cleanReportText(buildSafeFallbackReport(councilInput));

    const totalTokensIn = firstTokens.in + debateTokens.in + (final.tokensIn || 0);
    const totalTokensOut = firstTokens.out + debateTokens.out + (final.tokensOut || 0);

    // 9. 兜底報告 → 不扣點（也不消耗免額度）
    const plannedCharge = fallbackUsed ? 0 : creditsToCharge;
    const plannedFreeQuotaUsed = fallbackUsed ? false : freeQuotaUsed;

    // 10. 寫 usage_logs（必須先有 id 才能寫 council_runs.usage_log_id）
    const { data: usageLog, error: usageError } = await admin
      .from("usage_logs")
      .insert({
        user_id: profile.id,
        entitlement_id: entitlement.id,
        type: "council",
        prompt: input.question.slice(0, 4000),
        reply: finalText.slice(0, 8000),
        tokens_input: totalTokensIn,
        tokens_output: totalTokensOut
      })
      .select("id")
      .single();
    if (usageError) throw usageError;

    // 11. 原子扣點（debit + insert credit_transactions 綁在 commit_council_credit SQL function 裡）
    let actualCharge = 0;
    let creditWarning: string | null = null;

    if (plannedCharge > 0) {
      const { error: rpcError } = await admin.rpc("commit_council_credit", {
        p_user_id: profile.id,
        p_entitlement_id: entitlement.id,
        p_previous_credits: previousCredits,
        p_charge: plannedCharge,
        p_ref_id: usageLog?.id || null
      });

      if (rpcError) {
        // CR001 insufficient / CR002 race（LLM 跑期間其他流程動了點數）
        // → 報告已生成，送這一份，council_runs 記 credits_charged=0、log warn
        creditWarning = `commit_council_credit failed: ${rpcError.code || ""} ${rpcError.message}`.trim();
        console.warn("[council] credit commit failed, gifting run", {
          userId: profile.id,
          entitlementId: entitlement.id,
          plannedCharge,
          previousCredits,
          error: rpcError
        });
      } else {
        actualCharge = plannedCharge;
      }
    }

    const actualFreeQuotaUsed = actualCharge === 0 && !fallbackUsed && plannedFreeQuotaUsed;

    // 12. 寫 council_runs（含實際扣點結果）
    const { error: runError } = await admin.from("council_runs").insert({
      user_id: profile.id,
      entitlement_id: entitlement.id,
      usage_log_id: usageLog?.id || null,
      request: councilInput,
      first_round: firstRound,
      debate_round: enableDebate ? debateRound : null,
      final_label: finalLabel,
      final_text: finalText,
      final_ok: finalOk,
      fallback_used: fallbackUsed,
      total_tokens_in: totalTokensIn,
      total_tokens_out: totalTokensOut,
      credits_charged: actualCharge,
      free_quota_used: actualFreeQuotaUsed
    });
    if (runError) throw runError;

    const member = await getPublicMember(profile.id);
    return apiJson({
      ok: true,
      final: { ok: finalOk, label: finalLabel, text: finalText },
      fallback_used: fallbackUsed,
      credits_charged: actualCharge,
      free_quota_used: actualFreeQuotaUsed,
      credit_warning: creditWarning,
      member,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    return apiJson({ error: errorMessage(error) }, errorStatus(error));
  }
}

function buildFirstRoundPrompt(input: CouncilInput, qualityGate: string) {
  return `${firstRoundPrompt(input)}

${qualityGate}

請用「巽風多維校核」身份進行內部判讀，不要在內容中提及任何底層模型名稱。

第一輪請分別完成：
一、八字命理初判
二、奇門遁甲初判
三、卜卦／六爻初判
四、梅花易數初判
五、本輪初步風險與機會

每一術都要寫出：
1. 採用資料
2. 推理過程
3. 初步判斷
4. 風險
5. 可執行建議`;
}

function buildDebatePrompt(input: CouncilInput, firstRoundText: string, qualityGate: string) {
  return `${debatePrompt(input, firstRoundText)}

${qualityGate}

請嚴格挑出空話、矛盾、不足與不可交付的句子，改成具體可執行建議。

第二輪請特別檢查：
一、各術數是否只有結論、沒有推理。
二、是否把四術混在一起，沒有各自論述。
三、是否出現星號、Markdown 粗體符號。
四、是否出現底層工具名稱。
五、是否缺乏具體行動與停損條件。

請輸出修正後的四術判斷方向。`;
}

function buildFinalPrompt(
  input: CouncilInput,
  firstRoundText: string,
  debateRoundText: string,
  qualityGate: string
) {
  return `${finalSummaryPrompt(input, firstRoundText, debateRoundText)}

${qualityGate}

${buildFinalFormatPrompt()}

請整合第一輪與第二輪內容，但不要只摘要。正式報告必須把八字、奇門、卜卦／六爻、梅花易數各自拆開寫，每一術都要有完整討論過程與結果。

最後輸出前請自行檢查：
1. 是否還有星號。
2. 是否還有 Markdown 粗體。
3. 是否還有底層工具名稱。
4. 是否每一術都有「資料輸入、推理過程、初步判斷、風險點、可行策略、小結」。
5. 是否有 3日、7日、30日行動方案。
6. 是否有停損條件。

若有任何一項不符合，請自行重寫到符合為止。`;
}

function getPlanCode(value: unknown) {
  const plan = Array.isArray(value) ? value[0] : value;
  if (typeof plan === "object" && plan && "code" in plan && typeof (plan as any).code === "string") {
    return (plan as any).code as string;
  }
  return "free";
}
