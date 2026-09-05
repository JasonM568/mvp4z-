// 巽風會員等級規則解析
// 由 entitlement.tier_features 與 plan.code 共同決定每個等級的權限與扣點規則

export type TierFeatures = {
  council_cost?: number;
  council_free_quota_monthly?: number;
};

export type TierResolution = {
  plan: string;
  canUseCouncil: boolean;
  councilCost: number;
  monthlyFreeQuota: number;
};

// 2026-06-01 點數經濟：易學報告統一 20 點/份，免費體驗(trial)也能用，VIP 特規取消。
// 直接寫死 20，不再讀 COUNCIL_CREDIT_COST env（prod 舊值 10 會被忽略，該 env 已廢棄可移除）。
const DEFAULT_COUNCIL_COST = 20;

const TIER_DEFAULTS: Record<string, Partial<TierResolution>> = {
  trial: { canUseCouncil: true, councilCost: DEFAULT_COUNCIL_COST, monthlyFreeQuota: 0 },
  basic: { canUseCouncil: true, councilCost: DEFAULT_COUNCIL_COST, monthlyFreeQuota: 0 },
  pro: { canUseCouncil: true, councilCost: DEFAULT_COUNCIL_COST, monthlyFreeQuota: 0 },
  vip: { canUseCouncil: true, councilCost: DEFAULT_COUNCIL_COST, monthlyFreeQuota: 0 },
  // 單次報告加購（199 元 / 20 點）。權限與 basic 相同，差別只在點數與效期。
  single_report: { canUseCouncil: true, councilCost: DEFAULT_COUNCIL_COST, monthlyFreeQuota: 0 }
};

export function resolveTierFeatures(input: {
  planCode: string | null | undefined;
  tierFeatures?: TierFeatures | null;
}): TierResolution {
  const plan = (input.planCode || "free").toLowerCase();
  const defaults = TIER_DEFAULTS[plan] || {
    canUseCouncil: false,
    councilCost: DEFAULT_COUNCIL_COST,
    monthlyFreeQuota: 0
  };
  const overrides = input.tierFeatures || {};

  const councilCost =
    typeof overrides.council_cost === "number"
      ? overrides.council_cost
      : (defaults.councilCost ?? DEFAULT_COUNCIL_COST);

  const monthlyFreeQuota =
    typeof overrides.council_free_quota_monthly === "number"
      ? overrides.council_free_quota_monthly
      : (defaults.monthlyFreeQuota ?? 0);

  return {
    plan,
    canUseCouncil: defaults.canUseCouncil ?? false,
    councilCost,
    monthlyFreeQuota
  };
}
