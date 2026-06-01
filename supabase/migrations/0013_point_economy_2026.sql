-- 0013_point_economy_2026.sql
-- 2026-06-01 點數經濟重新設計
--
-- 重點：
--   1. 免費體驗漏斗：註冊自動發 trial entitlement 30 點（30 天），程式端（lib/auth/member.ts
--      grantTrialEntitlementIfNew）以常數 30 發放，與此處 plans.credits 無耦合，這裡的 trial.credits
--      只是讓後台 / 顯示一致。
--   2. 付費方案點數（含加贈）：basic 980→106、pro 1980→218、vip 4980→534。
--   3. 易學報告固定 20 點 / chat 每 1000 中文字 1 點，扣點規則在程式端（tier.ts / chat route），
--      此檔不處理扣點，只調整方案點數與價格。
--
-- 套用方式：Supabase SQL Editor 直接執行。可重複執行（純 update）。

update public.plans set credits = 30,  duration_days = 30, price = 0,    name = '免費體驗' where code = 'trial';
update public.plans set credits = 106, duration_days = 30, price = 980,  name = '基礎會員' where code = 'basic';
update public.plans set credits = 218, duration_days = 30, price = 1980, name = '進階會員' where code = 'pro';
update public.plans set credits = 534, duration_days = 30, price = 4980, name = 'VIP 會員'  where code = 'vip';
