-- 課程圖片牆：/courses 第二區塊改為圖片為主，老師可上傳多張課程圖片。
alter table public.site_course_promo
  add column if not exists gallery jsonb not null default '[]'::jsonb;
alter table public.site_course_promo
  drop constraint if exists site_course_promo_gallery_is_array,
  add constraint site_course_promo_gallery_is_array check (jsonb_typeof(gallery) = 'array');
comment on column public.site_course_promo.gallery is '課程圖片牆 [{image, caption}]，最多 12 張；海報 1～3 會自動排在最前面';
