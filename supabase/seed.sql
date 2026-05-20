insert into public.plans (code, name, price, currency, credits, duration_days, sort_order)
values
  ('trial', '免費體驗', 0, 'TWD', 3, 7, 10),
  ('basic', '基礎會員', 980, 'TWD', 60, 30, 20),
  ('pro', '進階會員', 1980, 'TWD', 150, 30, 30),
  ('vip', 'VIP 會員', 4980, 'TWD', 300, 30, 40)
on conflict (code) do nothing;
