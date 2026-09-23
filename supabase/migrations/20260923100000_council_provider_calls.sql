-- council_provider_calls：把每份報告的 provider 呼叫結果攤平成一列一次呼叫。
--
-- 起因：2026-09-23 查 provider 失敗狀況時，只能整份 council_runs 撈出來再在
-- 應用層拆 jsonb——那等於為了數幾次失敗，把每份報告的完整判讀文字都拉一遍。
-- 報告量會一直長，這個查法遲早變成問題。
--
-- 失敗紀錄本來就存在 first_round / debate_round 的 ModelResult 陣列裡，
-- 這個 view 只是把它們攤平，不新增任何資料、不改寫任何東西。
--
-- status 與 attempts 是 2026-09-23 才加進 ModelResult 的，舊資料沒有：
--   status  → null（分不出是逾時還是 5xx，只能看 error 文字）
--   attempts → 預設 1
-- 統計時要記得舊資料的 status 一律是 null，不要把它當成「沒有 HTTP 回應」。

create or replace view public.council_provider_calls
with (security_invoker = true) as
  select
    r.id                                as run_id,
    r.user_id,
    r.created_at,
    'first'::text                       as round,
    m->>'role'                          as role,
    coalesce((m->>'ok')::boolean, false) as ok,
    nullif(m->>'error', '')             as error,
    nullif(m->>'status', '')::int       as status,
    coalesce((m->>'attempts')::int, 1)  as attempts
  from public.council_runs r,
       lateral jsonb_array_elements(coalesce(r.first_round, '[]'::jsonb)) as m
  union all
  select
    r.id,
    r.user_id,
    r.created_at,
    'debate'::text,
    m->>'role',
    coalesce((m->>'ok')::boolean, false),
    nullif(m->>'error', ''),
    nullif(m->>'status', '')::int,
    coalesce((m->>'attempts')::int, 1)
  from public.council_runs r,
       lateral jsonb_array_elements(coalesce(r.debate_round, '[]'::jsonb)) as m;

-- security_invoker = true：讓底層 council_runs 的 RLS 照常生效。
-- 預設的 security definer view 會用 view 擁有者的權限讀，等於繞過 RLS——
-- 這裡存的是會員的付費報告內容，不能開這種後門。

-- 只有 server-side 的 service_role 會讀它（後台 provider 健康狀態與排程告警）。
revoke all on public.council_provider_calls from anon, authenticated;
grant select on public.council_provider_calls to service_role;

comment on view public.council_provider_calls is
  'council_runs 的 provider 呼叫攤平檢視，供後台 provider 健康狀態與失敗告警統計使用。唯讀、不含報告正文。';
