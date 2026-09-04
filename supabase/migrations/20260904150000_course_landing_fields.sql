-- 課程上架：/courses 改成完整 Landing Page，主打課程資料表補齊說服區段欄位。
-- 全部給預設值，既有那一列不用搬資料；後台空白的區段前台整區隱藏。
alter table public.site_course_promo
  add column if not exists hero_stats text not null default '' check (char_length(hero_stats) <= 300),
  add column if not exists pain_title text not null default '' check (char_length(pain_title) <= 120),
  add column if not exists pain_points text not null default '' check (char_length(pain_points) <= 2000),
  add column if not exists outcome_title text not null default '' check (char_length(outcome_title) <= 120),
  add column if not exists outcomes text not null default '' check (char_length(outcomes) <= 2000),
  add column if not exists curriculum_title text not null default '' check (char_length(curriculum_title) <= 120),
  add column if not exists curriculum jsonb not null default '[]'::jsonb,
  add column if not exists instructor_name text not null default '' check (char_length(instructor_name) <= 60),
  add column if not exists instructor_title text not null default '' check (char_length(instructor_title) <= 120),
  add column if not exists instructor_bio text not null default '' check (char_length(instructor_bio) <= 2000),
  add column if not exists instructor_image text not null default '' check (char_length(instructor_image) <= 500),
  add column if not exists instructor_credentials text not null default '' check (char_length(instructor_credentials) <= 2000),
  add column if not exists info_note text not null default '' check (char_length(info_note) <= 300),
  add column if not exists faqs jsonb not null default '[]'::jsonb,
  add column if not exists testimonials jsonb not null default '[]'::jsonb,
  add column if not exists guarantee_text text not null default '' check (char_length(guarantee_text) <= 1000),
  add column if not exists seats_text text not null default '' check (char_length(seats_text) <= 120),
  add column if not exists sticky_cta_hint text not null default '' check (char_length(sticky_cta_hint) <= 120);

-- jsonb 清單只允許陣列，避免後台送錯型別。
alter table public.site_course_promo
  drop constraint if exists site_course_promo_curriculum_is_array,
  add constraint site_course_promo_curriculum_is_array check (jsonb_typeof(curriculum) = 'array'),
  drop constraint if exists site_course_promo_faqs_is_array,
  add constraint site_course_promo_faqs_is_array check (jsonb_typeof(faqs) = 'array'),
  drop constraint if exists site_course_promo_testimonials_is_array,
  add constraint site_course_promo_testimonials_is_array check (jsonb_typeof(testimonials) = 'array');

comment on column public.site_course_promo.curriculum is '課程大綱 [{title, description, duration}]';
comment on column public.site_course_promo.faqs is '常見問題 [{q, a}]';
comment on column public.site_course_promo.testimonials is '學員見證 [{name, role, quote}]；空陣列則前台不顯示';

-- ── 預設文案（只填空白欄位，不覆蓋老師之後在後台改過的內容）────────────────
update public.site_course_promo set
  hero_stats = case when hero_stats = '' then E'一日密集班\n零基礎可上\n現場實作' else hero_stats end,
  pain_title = case when pain_title = '' then '這些困擾，你也遇過嗎？' else pain_title end,
  pain_points = case when pain_points = '' then E'記不住干支五行｜看了很多命理書，一離開書本就忘光\n不知從哪開始｜想學風水擇日，卻找不到打基礎的入口\n決策缺工具｜遇到人生重要選擇，希望有方法輔助判斷方向\n怕理論太深｜對傳統五術有興趣，卻擔心學不會' else pain_points end,
  outcome_title = case when outcome_title = '' then '一天學會，帶走一輩子的工具' else outcome_title end,
  outcomes = case when outcomes = '' then E'掌握干支排列口訣，隨時可在掌中推算\n理解五行生剋原理，判斷運勢趨勢\n學會基礎命理、風水、擇日判讀邏輯\n現場演練實際案例，課後能獨立運用\n建立五術學習正確觀念與進階方向' else outcomes end,
  curriculum_title = case when curriculum_title = '' then '一日 7 小時，這樣安排' else curriculum_title end,
  curriculum = case when curriculum = '[]'::jsonb then '[
    {"title":"干支解析基礎","description":"天干地支排列口訣與掌訣記憶法","duration":"2 小時"},
    {"title":"五行陰陽原理","description":"五行生剋判斷與實務應用邏輯","duration":"1.5 小時"},
    {"title":"運程趨勢判讀","description":"個人運勢與時機判斷的掌訣推算","duration":"1.5 小時"},
    {"title":"實戰應用整合","description":"命理、風水、擇日、卜卦基礎應用","duration":"1.5 小時"},
    {"title":"總複習與實作","description":"現場案例演練與學員提問","duration":"0.5 小時"}
  ]'::jsonb else curriculum end,
  instructor_name = case when instructor_name = '' then '風羿老師' else instructor_name end,
  instructor_title = case when instructor_title = '' then '巽風堪輿研究中心創辦人' else instructor_title end,
  instructor_bio = case when instructor_bio = '' then E'專精乾坤國寶、龍門八局、形家、八宅等傳統理法，並以現代頻率思維與場域風險管理角度詮釋傳統五術，協助企業與個人做出更精準的決策。\n擅長將複雜理論轉化為實用工具，讓學員能快速上手並應用於生活。' else instructor_bio end,
  instructor_image = case when instructor_image = '' then 'assets/fengyi-hero.jpg' else instructor_image end,
  instructor_credentials = case when instructor_credentials = '' then E'台中西區扶輪社專題演講講師\n台灣省地理師協會國際交流受邀講者\n亞洲大學國際研討會分享講師' else instructor_credentials end,
  info_note = case when info_note = '' then '建議攜帶筆記本與筆；課程含午休時段，現場提供茶水。' else info_note end,
  faqs = case when faqs = '[]'::jsonb then '[
    {"q":"我完全沒有基礎，能聽得懂嗎？","a":"課程專為零基礎設計，從干支五行基礎開始教起，風羿老師會用現代語言講解傳統理論，現場也會帶實作練習。"},
    {"q":"複訓學員的資格是什麼？","a":"曾經上過本課程任一期次的學員，即可用複訓價報名，複習鞏固所學內容。"},
    {"q":"付款後會收到什麼證明？","a":"綠界付款完成後即保留名額；電子發票會依你在報名表填寫的發票資訊開立，課程當日現場報到。"},
    {"q":"如果臨時有事無法出席，可以退費或改期嗎？","a":"退費與改期規定請以主辦單位公告為準，如有需求可透過 LINE 聯繫巽風堪輿研究中心詢問。"},
    {"q":"上課需要帶什麼？","a":"建議攜帶筆記本與筆即可，課程會提供講義，不需要事先準備任何教材或工具。"},
    {"q":"上完這堂課後，有進階課程嗎？","a":"本課程是五術學習的基礎班，進階專題會依學員需求另行規劃，開課資訊會在本站與 LINE 公告。"}
  ]'::jsonb else faqs end,
  guarantee_text = case when guarantee_text = '' then '本課程為傳統五術基礎教學，著重工具方法傳授，不保證任何命運改變或具體效果；學習成效因個人理解與練習而異。' else guarantee_text end,
  sticky_cta_hint = case when sticky_cta_hint = '' then '綠界付款後即保留名額' else sticky_cta_hint end,
  register_url = case when register_url in ('', '#courseCheckout') then '#register' else register_url end
where id = 'default';
