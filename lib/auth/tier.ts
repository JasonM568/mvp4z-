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

const DEFAULT_COUNCIL_COST = Number(process.env.COUNCIL_CREDIT_COST || 10);

const TIER_DEFAULTS: Record<string, Partial<TierResolution>> = {
  trial: { canUseCouncil: false, councilCost: 0, monthlyFreeQuota: 0 },
  basic: { canUseCouncil: true, councilCost: DEFAULT_COUNCIL_COST, monthlyFreeQuota: 0 },
  pro: { canUseCouncil: true, councilCost: DEFAULT_COUNCIL_COST, monthlyFreeQuota: 0 },
  vip: { canUseCouncil: true, councilCost: 5, monthlyFreeQuota: 3 }
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
