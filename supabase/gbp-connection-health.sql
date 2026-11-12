-- A Google connection is never lost silently (lib/gbpTokens.server.ts).
--
-- 1. gbp_connections.disconnected_at / disconnect_reason: when and why
--    Google stopped accepting PostScore's access — "refresh_rejected"
--    (Google refused the refresh token: revoked, or expired after 7 days
--    while the OAuth consent screen is in Testing) or "no_refresh_token".
--    Cleared on reconnect. The Overview's amber banner and the in-app
--    notification read them.
-- 2. gbp_tokens.refresh_token_expires_at: Google only sends an expiry for
--    the refresh token when it will expire (an app in Testing: 7 days).
--    Null = no expiry. Never the token itself.
--
-- Until this file is run, everything still works: the disconnect is
-- recorded as before (status "error"), without the date or reason.
--
-- Run once in the Supabase SQL editor, after gbp-tokens.sql and
-- gbp-location.sql. Safe to run again.

alter table public.gbp_connections add column if not exists disconnected_at timestamptz;
alter table public.gbp_connections add column if not exists disconnect_reason text check (disconnect_reason in ('refresh_rejected', 'no_refresh_token'));

alter table public.gbp_tokens add column if not exists refresh_token_expires_at timestamptz;

notify pgrst, 'reload schema';
