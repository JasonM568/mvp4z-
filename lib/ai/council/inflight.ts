// 每位會員同時只允許 1 份進行中的 council 報告（QA-B1）。
// 為什麼要有：預檢點數與扣點之間隔著 7 次 LLM，並行請求會全部通過預檢，
// 之後撞 CR002 變成「報告照送、不扣點」。slot 在 LLM 開跑前先搶。
// slot 有 TTL（> maxDuration），function 被 kill 沒釋放也會自己過期。

export const COUNCIL_SLOT_TTL_SECONDS = 330;

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: any }>;
};

export type SlotResult = { acquired: boolean; degraded: boolean };

/**
 * 搶 slot。
 * - 搶到 → acquired:true
 * - 別份進行中 → acquired:false（呼叫端回 409）
 * - migration 還沒套用（function 不存在）→ acquired:true, degraded:true。
 *   這只為了「先部署程式、後套 migration」的順序不致整站掛掉；其他錯誤一律往外丟，不放行。
 */
export async function acquireCouncilSlot(admin: RpcClient, userId: string): Promise<SlotResult> {
  const { data, error } = await admin.rpc("acquire_council_slot", {
    p_user_id: userId,
    p_ttl_seconds: COUNCIL_SLOT_TTL_SECONDS
  });
  if (error) {
    if (isMissingFunction(error)) return { acquired: true, degraded: true };
    throw error;
  }
  return { acquired: data === true, degraded: false };
}

/** 釋放 slot。失敗只記錄，不可蓋掉原本的結果；TTL 會兜底。 */
export async function releaseCouncilSlot(admin: RpcClient, userId: string): Promise<void> {
  try {
    const { error } = await admin.rpc("release_council_slot", { p_user_id: userId });
    if (error && !isMissingFunction(error)) {
      console.warn("[council] release slot failed (TTL 會自動過期)", { userId, error });
    }
  } catch (e) {
    console.warn("[council] release slot threw (TTL 會自動過期)", { userId, error: e });
  }
}

function isMissingFunction(error: { code?: string; message?: string }) {
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message || "");
}
