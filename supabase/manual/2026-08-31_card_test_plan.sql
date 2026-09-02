-- 信用卡真實刷卡 E2E 用的 1 元方案。
-- 刻意不放進 migrations：這是臨時測試資料，驗完就停用，不該跟著 schema 一起重跑。
--
-- 為什麼不會被客人看到：
--   member-pricing.js 只渲染 PLAN_PRESETS 有列的方案（basic / pro / vip），
--   這組 code 不在裡面，只有網址明確帶 ?plan=e2e_card_test 時才會出現一張卡片。
--
-- 驗完請務必執行本檔最下方的停用語句。

insert into public.plans (code, name, price, currency, credits, duration_days, is_active)
values ('e2e_card_test', '刷卡測試方案（內部）', 1, 'TWD', 1, 1, true)
on conflict (code) do update
  set price = excluded.price,
      credits = excluded.credits,
      duration_days = excluded.duration_days,
      is_active = true;

-- 測試結束後停用：
-- update public.plans set is_active = false where code = 'e2e_card_test';
