-- 課程推廣：讓後台可以直接上傳宣傳影片（mp4 / webm / mov）。
-- 上傳改走 Supabase signed upload URL，繞過 Vercel 4.5MB 的 request body 上限，
-- 所以 bucket 的單檔上限一併放大到 200MB；圖片仍由 API 端限制在 10MB。
update storage.buckets
set
  public = true,
  file_size_limit = 209715200,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
where id = 'site-media';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'site-media', 'site-media', true, 209715200,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
where not exists (select 1 from storage.buckets where id = 'site-media');
