-- 0005_vip_plan.sql
-- 巽風會員等級擴充｜新增 VIP plan + entitlement tier features

-- 1. 在 member_entitlements 加 tier_features，存等級專屬規則
--    例如：{ "council_cost": 5, "council_free_quota_monthly": 3 }
alter table public.member_entitlements
  add column if not exists tier_features jsonb not null default '{}'::jsonb;

create index if not exists idx_entitlements_tier_features
  on public.member_entitlements using gin (tier_features);

-- 2. 新增 VIP plan
insert into public.plans (code, name, price, currency, credits, duration_days, sort_order)
values ('vip', 'VIP 會員', 4980, 'TWD', 300, 30, 40)
on conflict (code) do nothing;

-- 3. 註解：council 報告扣點規則（由 API 端 lib/auth/tier.ts 解讀 tier_features）
--    trial / basic / pro：tier_features = {} → 每份 10 點
--    vip：tier_features = { "council_cost": 5, "council_free_quota_monthly": 3 }
--       → 月內前 3 份免費（不扣點），第 4 份起每份 5 點
--    新增 VIP entitlement 時，建立流程需把 tier_features 寫入
