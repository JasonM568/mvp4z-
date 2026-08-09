-- council_runs_chart_and_school（檔名與遠端 migration history 對齊）
-- council_runs 記錄系統排盤結果與採用的流派
--
-- 重點：
-- 1. chart：lib/yixue 排出的 YixueChart（四柱、真太陽時修正、完整度）。
-- 2. school_version：當時採用的流派 id。老師日後改流派，舊報告仍能對回當時的算法。
-- 3. 兩欄皆 nullable。排盤上線前的歷史報告為 null，後台顯示時要處理。
--
-- 套用方式：Supabase SQL Editor 直接執行。純增量，可重複執行。
-- 註：本檔已於 2026-08-09 套用至正式專案 pvasgmmjrodukudbzuhp。

alter table public.council_runs
  add column if not exists chart jsonb,
  add column if not exists school_version text;

comment on column public.council_runs.chart is
  '系統排盤結果（lib/yixue 的 YixueChart）。null 代表該份報告未經程式排盤';
comment on column public.council_runs.school_version is
  '排盤採用的流派版本 id。老師改流派後，舊報告仍能對回當時的算法';
