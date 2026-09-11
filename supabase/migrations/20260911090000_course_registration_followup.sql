-- 課程報名的跟進狀態。
--
-- 起因：2026-09-11 查證發現 5 筆報名全部沒有完成付款，而後台沒有任何一頁看得到
-- 「有誰報名過」——報名資料只寄生在訂單管理底下，且因為沒付款成功，
-- 在列表上一律顯示「已取消／失敗」，看起來就像沒人報名。
--
-- 其中吳淑雯 9/06 完整填完報名表（含 LINE 與報名動機）後刷卡失敗，當天又試一次
-- 仍未完成；賴仁豪 9/02 同樣填完整份表單後沒去付款。這兩位是意願最高的名單，
-- 而老師完全不知道他們存在。
--
-- 所以這裡加的是「跟進」而不是「付款」狀態：付款狀態由 orders 與 status 表達，
-- 這三欄表達的是**人有沒有被聯繫到**。沒付款的報名才是最需要打電話的那一批。

alter table public.course_registrations
  add column if not exists contact_status text not null default 'new',
  add column if not exists contact_note text,
  add column if not exists contacted_at timestamptz;

-- 值刻意少：狀態選項一多，實務上就沒人維護了。
--   new       尚未聯繫（預設）
--   contacted 已聯繫，等對方回覆或再約時間
--   converted 已完成報名（含線下補款、改期、轉其他梯次）
--   closed    已結案（婉拒、重複報名、聯絡不上）
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'course_registrations_contact_status_check'
  ) then
    alter table public.course_registrations
      add constraint course_registrations_contact_status_check
      check (contact_status in ('new', 'contacted', 'converted', 'closed'));
  end if;
end $$;

comment on column public.course_registrations.contact_status is
  '跟進狀態，與付款狀態無關：new／contacted／converted／closed';
comment on column public.course_registrations.contact_note is
  '老師或營運的聯繫紀錄，只在後台顯示，不對報名者公開';
comment on column public.course_registrations.contacted_at is
  '最後一次把狀態改為已聯繫的時間，由後端寫入而非前端傳入';

-- 名單頁固定依報名時間倒序，且常以跟進狀態篩選。
create index if not exists course_registrations_contact_status_created_idx
  on public.course_registrations (contact_status, created_at desc);
