-- 面相報告 PDF 的儲存桶。
--
-- 與 face-analysis-uploads 分開：照片有 24 小時刪除的排程，PDF 要跟著報告長期保存。
-- 放同一個桶，遲早會有人把清照片的排程套到 PDF 上，會員的報告就沒了。
--
-- 同樣設為 private 且不建立 storage.objects 的 client policy，
-- 代表瀏覽器一律不可直讀直寫；下載一律經過 /api/face-analysis/runs/[id]/pdf，
-- 由該路由驗證 bearer token 與擁有權後才回傳位元組。
--
-- 上限 5MB：實測一份完整報告約 120KB，含中文子集字型。給到 5MB 是為了
-- 日後加圖表仍有餘裕，同時擋掉異常大的寫入。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'face-analysis-reports',
  'face-analysis-reports',
  false,
  5242880,
  array['application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
