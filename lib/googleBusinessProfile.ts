// Server-only. Google Business Profile OAuth scaffolding — Phase 1: gets
// a business from "not connected" to "we hold a real access/refresh
// token for it," nothing more. No Business Profile data (listing,
// reviews, insights, posts) is ever read here — that's the later phase,
// once Google has approved API access and the OAuth consent screen is
// verified. Mirrors lib/google/places.ts's conventions: real network
// calls, no mock/fallback data, an honest thrown error when
// configuration is missing rather than a silently broken redirect.

const GOOGLE_OAUTH_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * The Business Profile management scope. This is the one scope Phase 2
 * needs for editable listing fields, Insights, and Posts — requesting it
 * now (even though the token can't be used yet) means a business that
 * connects during Phase 1 won't need to re-consent once Phase 2 ships.
 */
export const GBP_OAUTH_SCOPE = "https://www.googleapis.com/auth/business.manage";

function readEnv(name: "GOOGLE_OAUTH_CLIENT_ID" | "GOOGLE_OAUTH_CLIENT_SECRET"): string | null {
  const value = process.env[name];
  if (!value || value.startsWith("YOUR_")) return null;
  return value;
}

/** Whether both OAuth env vars are real (not missing, not the
 * .env.example placeholder) — the UI uses this to show an honest "not
 * configured in this environment yet" state instead of sending the
 * owner into a Google redirect that can only fail. */
export function isGbpOAuthConfigured(): boolean {
  return readEnv("GOOGLE_OAUTH_CLIENT_ID") !== null && readEnv("GOOGLE_OAUTH_CLIENT_SECRET") !== null;
}

function getOAuthConfig(): { clientId: string; clientSecret: string } {
  if (typeof window !== "undefined") {
    throw new Error("Google Business Profile OAuth must run on the server.");
  }
  const clientId = readEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = readEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set. Add your real Google Cloud OAuth client credentials to .env.local."
    );
  }
  return { clientId, clientSecret };
}

/**
 * Builds the real Google OAuth consent-screen URL. `state` carries the
 * business id through the redirect round trip — see the RLS-is-the-real-
 * boundary note on the gbp_connections table in supabase/schema.sql for
 * why a plain (unsigned) state value is safe here: the callback's DB
 * write can only ever succeed for a business the logged-in user actually
 * owns, tampered state or not. `access_type=offline` + `prompt=consent`
 * ask Google for a refresh token every time, not just on first consent,
 * so reconnecting after a disconnect doesn't leave us without one.
 */
export function buildGbpAuthUrl(params: { redirectUri: string; state: string }): string {
  const { clientId } = getOAuthConfig();
  const url = new URL(GOOGLE_OAUTH_AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GBP_OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export interface GbpTokenResult {
  accessToken: string;
  refreshToken: string | null;
  /** Absolute expiry, computed from Google's real `expires_in` (seconds
   * from now) at the moment of exchange — never guessed. */
  expiresAt: string;
  /** Space-separated scopes Google actually granted — may be narrower
   * than GBP_OAUTH_SCOPE if the owner adjusted it on Google's consent
   * screen; always the real value Google returned. */
  scope: string;
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * Exchanges a real OAuth authorization code for real tokens. Whether
 * this actually succeeds today depends on Google having approved
 * Business Profile API access for this OAuth client and the consent
 * screen being configured for it — until then, Google may reject the
 * code or the scope. That failure surfaces as a thrown error, exactly
 * like any other real API failure in this app; nothing here fabricates
 * a successful connection.
 */
export async function exchangeGbpAuthCode(params: {
  code: string;
  redirectUri: string;
}): Promise<GbpTokenResult> {
  const { clientId, clientSecret } = getOAuthConfig();

  const res = await fetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  const data = (await res.json()) as RawTokenResponse;

  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ?? data.error ?? `Google token exchange failed (${res.status}).`
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
    scope: data.scope ?? GBP_OAUTH_SCOPE,
  };
}
