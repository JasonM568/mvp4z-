-- 網站內容 CMS：把「老師服務」與「案例課程」從 content/*.json 搬進 DB，讓管理者在後台自行編輯／上架。
--
-- 為什麼要進 DB：Vercel 的檔案系統在 runtime 是唯讀的，後台不可能寫回 content/*.json。
-- 前台仍保留 JSON 當 fallback（見 lib/site/content.ts）：DB 掛掉或資料表還沒建時，網站照舊顯示舊內容，不會開天窗。
--
-- 一律 service_role 專用：前台讀取走 /api/site-content（server-side），後台走 /api/admin/site-content。
-- 瀏覽器端沒有任何 policy，所以不可能直讀直寫。

create or replace function public.touch_site_content_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;

-- ── 老師服務（/services 價格卡、首頁服務卡）──────────────────────────────
create table if not exists public.site_services (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  category text not null default '' check (char_length(category) <= 60),
  price text not null default '' check (char_length(price) <= 120),
  note text not null default '' check (char_length(note) <= 800),
  description text not null default '' check (char_length(description) <= 3000),
  href text not null default '' check (char_length(href) <= 500),
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 案例實績（/cases）────────────────────────────────────────────────────
create table if not exists public.site_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  category text not null default '' check (char_length(category) <= 60),
  summary text not null default '' check (char_length(summary) <= 1000),
  body text not null default '' check (char_length(body) <= 5000),
  image text not null default '' check (char_length(image) <= 500),
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 課程講座（/courses 課程卡）───────────────────────────────────────────
-- schedule / location / price_text / href 是本次新增：讓後台「上架課程」時能寫出開課時間、地點、費用與報名連結。
create table if not exists public.site_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  audience text not null default '' check (char_length(audience) <= 300),
  description text not null default '' check (char_length(description) <= 3000),
  image text not null default '' check (char_length(image) <= 500),
  schedule text not null default '' check (char_length(schedule) <= 200),
  location text not null default '' check (char_length(location) <= 200),
  price_text text not null default '' check (char_length(price_text) <= 120),
  href text not null default '' check (char_length(href) <= 500),
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 主打課程推廣區（/courses 最上方那張大卡）─────────────────────────────
-- 單列表：id 鎖死 'default'，永遠只有一筆，避免後台不小心生出第二個主打課程。
create table if not exists public.site_course_promo (
  id text primary key default 'default' check (id = 'default'),
  active boolean not null default false,
  publish_start date,
  publish_end date,
  label text not null default '' check (char_length(label) <= 120),
  title text not null default '' check (char_length(title) <= 120),
  title_suffix text not null default '' check (char_length(title_suffix) <= 60),
  headline text not null default '' check (char_length(headline) <= 300),
  subheadline text not null default '' check (char_length(subheadline) <= 300),
  body text not null default '' check (char_length(body) <= 5000),
  highlights text not null default '' check (char_length(highlights) <= 2000),
  limited_text text not null default '' check (char_length(limited_text) <= 200),
  cta_text text not null default '' check (char_length(cta_text) <= 60),
  register_url text not null default '' check (char_length(register_url) <= 500),
  line_cta_text text not null default '' check (char_length(line_cta_text) <= 60),
  poster_main text not null default '' check (char_length(poster_main) <= 500),
  poster_second text not null default '' check (char_length(poster_second) <= 500),
  poster_third text not null default '' check (char_length(poster_third) <= 500),
  video_cover text not null default '' check (char_length(video_cover) <= 500),
  video_one text not null default '' check (char_length(video_one) <= 500),
  video_one_title text not null default '' check (char_length(video_one_title) <= 120),
  video_two text not null default '' check (char_length(video_two) <= 500),
  video_two_title text not null default '' check (char_length(video_two_title) <= 120),
  notice text not null default '' check (char_length(notice) <= 1000),
  updated_at timestamptz not null default now()
);

create index if not exists idx_site_services_order on public.site_services (sort_order, created_at);
create index if not exists idx_site_cases_order on public.site_cases (sort_order, created_at);
create index if not exists idx_site_courses_order on public.site_courses (sort_order, created_at);

do $$
declare t text;
begin
  foreach t in array array['site_services', 'site_cases', 'site_courses', 'site_course_promo'] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s
       for each row execute function public.touch_site_content_updated_at()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('revoke all on public.%1$s from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%1$s to service_role', t);
  end loop;
end $$;

comment on table public.site_services is '老師服務（/services）；後台 /admin/site-services 維護，service_role 專用。';
comment on table public.site_cases is '案例實績（/cases）；後台 /admin/site-cases 維護，service_role 專用。';
comment on table public.site_courses is '課程講座（/courses）；後台 /admin/site-cases 維護，service_role 專用。';
comment on table public.site_course_promo is '主打課程推廣區單列設定；id 固定為 default。';

-- 後台上傳的課程海報／案例照片。public = true 讓前台能直接用網址顯示，
-- 但沒有建立任何 storage.objects policy，所以寫入只可能來自 service_role。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-media',
  'site-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── 首次建表時的內容搬遷 ─────────────────────────────────────────────────
-- 只在資料表是空的時候寫入，重跑 migration 不會覆蓋管理者後來在後台改過的內容。
-- 來源是本次搬遷當下的 content/services.json、cases.json、courses.json、course_promo.json。

insert into public.site_services (title, category, price, note, description, href, sort_order)
select * from (values
  ('四象問天機', '數位顧問', '20 點 / 份', '命、局、卦、象，四術合參，一事定向。', '以八字、奇門、卜卦／六爻、梅花易數合參，生成《巽風四象天機書》與 3／7／30 日行動方案。', '/member-ai/decision', 10),
  ('AI 即時問答', '數位顧問', '每 1,000 中文字 1 點', '融合乾坤國寶、龍門八局、形家風水體系；回應約 5 秒。', '風水、命理、堪輿、場域管理的即時諮詢，以風羿老師專業語氣回應。', '/member-ai', 20),
  ('陰陽宅堪驗', '場域顧問', 'NT$22,000 – 28,000', '超過 300 坪，另以坪數計算；以實地勘驗與現場判讀為主。', '住宅、別墅、店面、辦公室、墓園、塔位與土地現場勘驗，以方位、形勢、明堂、動線與周邊壓力做判讀。', '', 30),
  ('年度企業顧問', '企業方案', 'NT$50,000 – 300,000', '依企業規模、場域數量、服務頻率與顧問深度報價。', '企業總部、分店、主管座位、營運節奏、人力檢視、季報與年度策略，形成長期合作模型。', '', 40),
  ('新生兒取名', '命名服務', 'NT$3,600 – 6,000', '依生肖姓名學、三才五格、音節記憶與長期使用情境整合。', '從命格條件、家族期待、字義、音韻與長期使用性進行命名建議。', '', 50),
  ('公司命名', '品牌命名', 'NT$3,600 – 6,000', '結合產業語境、品牌延伸、口述辨識與長期品牌結構。', '不是只取好聽的名字，而是建立可被記住、可被傳播、可長期承載的品牌名稱。', '', 60),
  ('成人改名', '命名服務', 'NT$3,600 – 6,000', '結合個人條件、發音、使用情境與長期身份定位。', '針對個人職涯、人際、品牌識別與命理結構進行名稱重整。', '', 70),
  ('擇日選時', '輕顧問', 'NT$3,600', '開工、搬遷、印章、簽約與重要事項擇日。', '協助重大行動在時間節點上降低風險、提高順勢啟動的可能。', '', 80),
  ('八字流年', '命理顧問', 'NT$3,600', '年度節奏、行動排序與風險提醒。', '盤點年度趨勢、適合推進的方向與應避免的決策盲點。', '', 90)
) as seed(title, category, price, note, description, href, sort_order)
where not exists (select 1 from public.site_services);

insert into public.site_cases (title, category, summary, body, image, sort_order)
select * from (values
  ('⚔️386【堪輿 × 設計：把房子，真正住成對你有利的空間】', '陽宅場域', '於南投社區型別墅進行實地勘輿，把人、建築、環境磁場放在同一張策略圖重新對齊。', '重點在買屋與設計前端介入，用低成本方式降低未來干擾。調整方向包含：動線與氣場重新梳理、空間邊界柔性界定、書桌與床位配置配合作息節奏。', 'assets/uploads/1778069102950-668446105_10228432588993631_7904850135498375338_n-1-.jpg', 10),
  ('⚔️370【價格 & 價值：一年業績翻倍背後的奧秘】', '企業顧問', '車業零件集團案例：從場域、明堂、電梯對沖與主管狀態綜合判讀。', '一年內年營業額由 1.6 億提升到 3 億。價格是數字，價值是結果。企業堪輿的核心在精準洞見與有效布局。', 'assets/uploads/1778069257144-679148449_10228593136607221_2517302291487273924_n.jpg', 20),
  ('【風水物語】當傳統遇見科技', '課程講座', '台灣地理師協會與亞洲大學攜手舉辦國際研討會，傳統智慧與現代科技激盪。', '這一步，讓風水玄學科學化的願景更向前推進，也讓巽風品牌具備公開學術與協會合作背書。', 'assets/uploads/1778068752428-605526508_10227395987079231_4879121519320623491_n.jpg', 30),
  ('⚔️391【名字，是一家公司未來的命運走向】', '命名品牌', '公司名稱不只是好聽，而是品牌記憶、口述辨識、文化高度與長期承載力。', '命名整合生肖姓名學、三才五格、產業語境與品牌延伸。真正好的名字，不張揚，卻會慢慢成為市場中被記住、被信任、被傳播的選擇。', 'assets/uploads/1778069490277-605244180_10227395988519267_6397257579994294748_n.jpg', 40)
) as seed(title, category, summary, body, image, sort_order)
where not exists (select 1 from public.site_cases);

insert into public.site_courses (title, audience, description, image, sort_order)
select * from (values
  ('打造陽宅好風水', '一般民眾、扶輪社、社團', '從住得順到事業順，用一般人聽得懂的方式理解居家場域。', 'assets/service-classroom.jpg', 10),
  ('老闆必修的環境風險管理', '企業主、高階主管、店面經營者', '把風水轉成企業主可理解的空間風險與營運節奏。', 'assets/service-corporate-course.jpg', 20),
  ('風水與量子頻率', '專業人士、知識型社群', '用頻率、場域、資訊與共振語彙，連結傳統智慧與現代思維。', 'assets/proof-speaker.jpg', 30),
  ('AI 數據風水發展趨勢', '協會、學校、企業與專業組織', '建立風水數位化、AI 前台與品牌知識庫的應用想像。', 'assets/proof-hall.jpg', 40)
) as seed(title, audience, description, image, sort_order)
where not exists (select 1 from public.site_courses);

insert into public.site_course_promo (id, active, publish_start, publish_end, label, title, title_suffix, headline, subheadline, body, highlights, limited_text, cta_text, register_url, line_cta_text, poster_main, poster_second, poster_third, video_cover, video_one, video_one_title, video_two, video_two_title, notice)
values ('default', true, null, null, 'NEW COURSE｜掌訣班招生', '掌中訣', '開班授課', '別讓命運成為盲盒，風羿老師帶你親手改寫人生劇本！', '解開命運密碼・掌握人生方向', '您是否總覺得人生像在迷霧中行走？努力了很久，卻總在關鍵時刻與機會擦身而過？

其實，您的成功路徑、財富密碼、甚至避坑指南，早已刻在你的掌心之中。玄學名師風羿老師傾囊相授，將千年不外傳的「掌中訣」化繁為簡。

這不只是一門命理課，更是一套讓你「看透局勢、精準決策」的人生導航系統。', '干支解析｜洞悉先天與後天趨勢
五行陰陽｜結合五行生剋原理
運程趨勢｜掌握人生關鍵時機
實戰運用｜學以致用，快速上手', '招生名額有限，立即卡位', '立即報名', '#courseCheckout', 'LINE 詢問課程', 'assets/courses/zhangzhongjue-poster-qr.png', 'assets/courses/zhangzhongjue-poster-dark.png', 'assets/courses/zhangzhongjue-video-cover.png', 'assets/courses/zhangzhongjue-video-cover.png', '', '', '', '', '')
on conflict (id) do nothing;
