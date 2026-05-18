alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.member_entitlements enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.activation_codes enable row level security;
alter table public.usage_logs enable row level security;
alter table public.admin_audit_logs enable row level security;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid()
      and role = 'admin'
  )
$$;

create policy "profiles_select_self_or_admin"
on public.profiles for select
using (id = public.current_profile_id() or public.is_admin());

create policy "plans_select_active"
on public.plans for select
using (is_active = true or public.is_admin());

create policy "orders_select_self_or_admin"
on public.orders for select
using (user_id = public.current_profile_id() or public.is_admin());

create policy "entitlements_select_self_or_admin"
on public.member_entitlements for select
using (user_id = public.current_profile_id() or public.is_admin());

create policy "credit_transactions_select_self_or_admin"
on public.credit_transactions for select
using (user_id = public.current_profile_id() or public.is_admin());

create policy "usage_logs_select_self_or_admin"
on public.usage_logs for select
using (user_id = public.current_profile_id() or public.is_admin());

create policy "activation_codes_select_admin"
on public.activation_codes for select
using (public.is_admin());

create policy "admin_audit_logs_select_admin"
on public.admin_audit_logs for select
using (public.is_admin());
