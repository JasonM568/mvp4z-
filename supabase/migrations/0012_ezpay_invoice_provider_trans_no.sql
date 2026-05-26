-- 0012_ezpay_invoice_provider_trans_no.sql
-- EZPay 發票切換：invoices 表加 provider_trans_no 欄位（EZPay 的 InvoiceTransNo）。
--
-- EZPay 作廢發票時必須帶 InvoiceTransNo（樂點端的交易序號），不像 invoice_number
-- 是給買受人查詢用的字軌號。先存起來避免之後作廢時要去 raw_response 撈。
--
-- Provider 切換策略：
-- - 既有 invoices.provider 預設仍是 'ecpay'，未來新開的發票 provider='ezpay'
-- - 不 backfill 既有 row（歷史只有沙箱測試，無 production 真實發票）

alter table public.invoices
  add column provider_trans_no text;

comment on column public.invoices.provider_trans_no is
  '發票供應商的交易序號（EZPay = InvoiceTransNo, 20 chars），作廢/查詢時必要。綠界發票不會用到。';

-- 同一個 provider 內 provider_trans_no 不會重複；建 partial unique index
create unique index if not exists idx_invoices_provider_trans_no_unique
  on public.invoices(provider, provider_trans_no)
  where provider_trans_no is not null;
