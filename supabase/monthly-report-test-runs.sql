-- Testing mode for the monthly report job (MONTHLY_REPORTS_LIVE not "true"):
-- one row per month with the 3 businesses whose reports went to
-- REPORT_TEST_EMAIL. The job reads last month's row to avoid picking the
-- same business two months in a row, and inserts this month's row BEFORE
-- sending, so a retry or double trigger sends nothing more. Until this is
-- run, testing mode still works but can repeat a business and logs a warning.
-- Written only by the server (service role); owners never read it.
--
-- Run once in the Supabase SQL editor. Safe to run again.

create table if not exists public.monthly_report_test_runs (
  run_month text primary key check (run_month ~ '^\d{4}-\d{2}$'),
  business_ids uuid[] not null,
  created_at timestamptz not null default now()
);

alter table public.monthly_report_test_runs enable row level security;
-- No policies: only the service role (which bypasses RLS) reads and writes it.
