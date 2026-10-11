#!/usr/bin/env node
// Read-only financial reconciliation for one paid order. No personal data is printed.
// Usage: node --env-file=.env.local scripts/qa-paid-order-readonly.mjs [--order-no=XF...]

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Missing Supabase test environment variables");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const arg = process.argv.find((value) => value.startsWith("--order-no="));
const orderNo = arg?.slice("--order-no=".length);

let query = admin.from("orders")
  .select("id,order_no,order_type,amount,currency,status,paid_at,invoice_request,legacy_no_invoice")
  .eq("status", "paid");
query = orderNo ? query.eq("order_no", orderNo) : query.order("paid_at", { ascending: false }).limit(1);
const { data: order, error: orderError } = await query.maybeSingle();
if (orderError) throw new Error(`Order query failed: ${orderError.code || orderError.message}`);
if (!order) throw new Error("No matching paid order found");

const results = await Promise.all([
  admin.from("payments").select("status,amount,check_mac_valid").eq("order_id", order.id),
  admin.from("member_entitlements").select("id,status").eq("source_order_id", order.id),
  admin.from("credit_transactions").select("source,amount").eq("ref_id", order.order_no),
  admin.from("course_registrations").select("status,amount").eq("order_id", order.id),
  admin.from("invoices").select("status,total_amount,error_code").eq("order_id", order.id)
]);
for (const [index, result] of results.entries()) {
  if (result.error) throw new Error(`Related query ${index + 1} failed: ${result.error.code || result.error.message}`);
}
const [payments, entitlements, transactions, registrations, invoices] = results.map((result) => result.data || []);
const isCourse = order.order_type === "course";
const paymentMatched = payments.some((row) => row.status === "paid" && Number(row.amount) === Number(order.amount) && row.check_mac_valid === true);
const provisioned = isCourse
  ? registrations.length === 1 && registrations[0].status === "paid" && Number(registrations[0].amount) === Number(order.amount)
  : entitlements.length === 1 && transactions.filter((row) => row.source === "ecpay_payment").length === 1;
const invoiceRequired = !order.legacy_no_invoice && Boolean(order.invoice_request);
const invoiceIssued = invoices.some((row) => row.status === "issued" && Number(row.total_amount) === Number(order.amount));

console.log(JSON.stringify({
  sample: orderNo ? "specified_paid_order" : "latest_paid_order",
  order_suffix: String(order.order_no).slice(-4),
  paid_at: order.paid_at,
  order_type: order.order_type || "membership",
  amount: Number(order.amount),
  currency: order.currency,
  order_status: order.status,
  payment_count: payments.length,
  payment_statuses: payments.map((row) => row.status),
  payment_matched: paymentMatched,
  entitlement_count: entitlements.length,
  credit_transaction_count: transactions.length,
  registration_statuses: registrations.map((row) => row.status),
  provisioned,
  invoice_required: invoiceRequired,
  invoice_statuses: invoices.map((row) => row.status),
  invoice_issued: invoiceIssued
}, null, 2));

if (!paymentMatched || !provisioned || (invoiceRequired && !invoiceIssued)) process.exitCode = 1;
