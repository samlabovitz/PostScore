-- Google Business Profile connect — security (lib/gbpSecurity.ts,
-- lib/gbpTokens.server.ts, app/api/gbp/connect + callback,
-- app/actions/gbp.ts disconnectGbp).
--
-- 1. Tokens move to a new table, public.gbp_tokens, that no browser
--    session can read or write: RLS on with no policies, and every
--    privilege revoked from anon and authenticated. Only the service role
--    (the server) touches it. Each token is stored encrypted (AES-256-GCM
--    with GBP_TOKEN_ENCRYPTION_KEY) — never plain text.
-- 2. The plain-text token columns on gbp_connections are dropped.
--    gbp_connections keeps only what the app shows (connected, since
--    when, the granted scope); owners can still read their own row.
-- 3. Owners can no longer insert, update or delete gbp_connections rows
--    themselves — only the server writes it, after a real Google token
--    exchange (so a business can't be marked "connected" by hand), and
--    disconnect goes through the server so the token is revoked at Google
--    first.
--
-- Run once in the Supabase SQL editor. Safe to run again.

create table if not exists public.gbp_tokens (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  -- The PostScore user who connected (always the business's owner).
  connected_by uuid references auth.users (id) on delete set null,
  -- "v1.<iv>.<tag>.<ciphertext>" — AES-256-GCM, bound to business_id.
  access_token_enc text not null,
  refresh_token_enc text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gbp_tokens enable row level security;
-- No policies on purpose: anon and authenticated get nothing.
revoke all on table public.gbp_tokens from anon, authenticated;
grant all on table public.gbp_tokens to service_role;

-- The old plain-text columns go away (the table has never held a real
-- owner's token; any test rows are cleared so they reconnect cleanly).
delete from public.gbp_connections;
alter table public.gbp_connections drop column if exists access_token;
alter table public.gbp_connections drop column if exists refresh_token;
alter table public.gbp_connections drop column if exists token_expires_at;

-- Owners keep read access to their own status row; writes are server-only.
drop policy if exists "Users can insert gbp connections for their own businesses" on public.gbp_connections;
drop policy if exists "Users can update gbp connections for their own businesses" on public.gbp_connections;
drop policy if exists "Users can delete gbp connections for their own businesses" on public.gbp_connections;
revoke insert, update, delete on table public.gbp_connections from anon, authenticated;

notify pgrst, 'reload schema';
