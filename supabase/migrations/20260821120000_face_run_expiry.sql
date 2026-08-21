-- 面相分析任務的逾時收尾機制。
--
-- 問題：POST /api/face-analysis/runs 用「開放中的 run 筆數 >= 3」擋併發，但
-- created / uploaded / quality_rejected / analyzing 這四種狀態沒有任何收尾路徑
-- （cleanup-face-images 只刪圖不改 status），所以計數只會單調累加。三張照片沒過
-- 品質檢查，這個會員就永久拿到 429「尚有未完成的分析任務」。
--
-- 修法：新增 expired 終態，讓排程可以把走不下去的 run 收掉；並一次性清掉既有殘留。

alter table public.face_analysis_runs
  drop constraint if exists face_analysis_runs_status_check;

alter table public.face_analysis_runs
  add constraint face_analysis_runs_status_check check (
    status in (
      'created', 'uploaded', 'quality_rejected', 'analyzing',
      'completed', 'failed', 'expired', 'deleted'
    )
  );

comment on column public.face_analysis_runs.status is
  'created→uploaded/quality_rejected→analyzing→completed/failed。expired = 逾時未收尾，'
  '由 /api/cron/cleanup-face-images 標記，不列入會員歷史，也不佔併發額度。';

-- 一次性收尾（純 update，可重複執行）。門檻與 cron 內的常數一致。
update public.face_analysis_runs
   set status = 'expired',
       error_code = coalesce(nullif(error_code, ''), 'RUN_ABANDONED')
 where status = 'created'
   and created_at < now() - interval '30 minutes';

-- 錯誤碼要能分辨「檢查過且通過」與「連照片都沒傳」，否則後台品質通過率會失真；
-- quality_rejected 則保留原本的 QUALITY_REJECTED。
update public.face_analysis_runs
   set status = 'expired',
       error_code = coalesce(nullif(error_code, ''), 'RUN_ABANDONED_AFTER_QUALITY')
 where status = 'uploaded'
   and updated_at < now() - interval '24 hours';

update public.face_analysis_runs
   set status = 'expired'
 where status = 'quality_rejected'
   and updated_at < now() - interval '24 hours';

-- analyzing 卡住代表 function 真的被 kill（maxDuration 300s），照實記成 failed，
-- 會員在歷史裡看得到，也還能在 analysis_attempts 上限內重試。
update public.face_analysis_runs
   set status = 'failed',
       error_code = coalesce(nullif(error_code, ''), 'ANALYSIS_TIMEOUT')
 where status = 'analyzing'
   and updated_at < now() - interval '15 minutes';
