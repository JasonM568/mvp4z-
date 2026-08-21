-- 記錄「老師核對的是哪一版內容」。
-- 沒有這個欄位的話，老師確認過的規則被編輯後仍會顯示為已確認，
-- 審核狀態就失去意義；有了它，內容一改（trigger 會 bump version）即自動回到未確認。
alter table public.face_teaching_rules
  add column if not exists reviewed_version int;

comment on column public.face_teaching_rules.reviewed_version is
  'Version the teacher signed off on. Review is stale when it differs from version.';
