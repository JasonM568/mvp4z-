-- 0014: council_runs 加 structured jsonb（四象儀表板機讀結果；檔名與遠端歷史對齊）
-- 純增量、nullable、RLS 不變。structured 為 null = 兜底稿或 LLM 未輸出合法 JSON。
alter table public.council_runs add column if not exists structured jsonb;
