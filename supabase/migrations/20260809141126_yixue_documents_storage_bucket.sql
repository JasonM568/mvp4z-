-- 文件庫 Storage bucket；與正式資料庫 migration history 對齊。
-- 可重複執行，檔案可能含客戶案例，因此 bucket 維持 private。

insert into storage.buckets (id, name, public)
values ('yixue-documents', 'yixue-documents', false)
on conflict (id) do update set public = false;

drop policy if exists "yixue_documents_admin_select" on storage.objects;
create policy "yixue_documents_admin_select"
on storage.objects for select
using (bucket_id = 'yixue-documents' and public.is_admin());
