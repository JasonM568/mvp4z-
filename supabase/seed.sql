insert into public.plans (code, name, price, currency, credits, duration_days, sort_order)
values
  ('trial', '免費體驗', 0, 'TWD', 30, 30, 10),
  ('basic', '基礎會員', 980, 'TWD', 106, 30, 20),
  ('pro', '進階會員', 1980, 'TWD', 218, 30, 30),
  ('vip', 'VIP 會員', 4980, 'TWD', 534, 30, 40)
on conflict (code) do nothing;
