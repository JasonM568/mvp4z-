-- 0009_invoices_rls.sql
-- invoices RLS：member 只能 select 自己的；admin 可 select 全部
-- insert/update/delete 一律不開放 client，全部走 service_role（admin API）

alter table public.invoices enable row level security;

create policy "invoices_select_self_or_admin"
on public.invoices for select
using (user_id = public.current_profile_id() or public.is_admin());
