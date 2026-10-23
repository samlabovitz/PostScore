import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { LocaleProvider, type Locale } from "@/lib/i18n";
import type { Plan } from "@/lib/plan";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// ---------------------------------------------------------------------------
// A tiny in-memory stand-in for the Supabase client: records every call.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
interface Op {
  op: "select" | "upsert" | "delete";
  table: string;
  filters?: Row;
  row?: Row;
}
function fakeDb(tables: Record<string, Row[]>, user: { id: string } | null = null) {
  const log: Op[] = [];
  return {
    log,
    tables,
    auth: { getUser: async () => ({ data: { user } }) },
    from(table: string) {
      const filters: Row = {};
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        },
        maybeSingle: async () => {
          log.push({ op: "select", table, filters: { ...filters } });
          const rows = (tables[table] ?? []).filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
          return { data: rows[0] ?? null, error: null };
        },
        upsert: async (row: Row) => {
          log.push({ op: "upsert", table, row });
          tables[table] = [...(tables[table] ?? []).filter((r) => r.business_id !== row.business_id), row];
          return { error: null };
        },
        delete: () => ({
          eq: async (col: string, val: unknown) => {
            log.push({ op: "delete", table, filters: { [col]: val } });
            tables[table] = (tables[table] ?? []).filter((r) => r[col] !== val);
            return { error: null };
          },
        }),
      };
      return builder;
    },
  };
}

const OWNER = { id: "user-owner" };
const STRANGER = { id: "user-stranger" };
const BIZ = "biz-1";
const OTHER_BIZ = "biz-2";

let sessionDb: ReturnType<typeof fakeDb>;
let adminDb: ReturnType<typeof fakeDb>;
let currentPlan: Plan = "free";

vi.mock("@/lib/supabase/server", () => ({ createClient: () => sessionDb }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminDb }));
vi.mock("@/lib/premium", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/premium")>()),
  getPlan: async () => currentPlan,
}));

const ENV_KEYS = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GBP_TOKEN_ENCRYPTION_KEY", "GBP_CONNECT_PUBLIC", "SITE_URL"] as const;
const savedEnv: Record<string, string | undefined> = {};
const fetchMock = vi.fn();

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client.apps.googleusercontent.com";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret";
  process.env.GBP_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.GBP_CONNECT_PUBLIC = "true";
  process.env.SITE_URL = "http://localhost:3000";
  // Owner owns BIZ only.
  sessionDb = fakeDb({ businesses: [{ id: BIZ, owner_id: OWNER.id }, { id: OTHER_BIZ, owner_id: "someone-else" }] }, OWNER);
  adminDb = fakeDb({ gbp_tokens: [], gbp_connections: [] });
  currentPlan = "free";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Runs the connect route; returns Google's URL and the cookie it set. */
async function startConnect(businessId = BIZ) {
  const { GET } = await import("@/app/api/gbp/connect/route");
  const res = await GET(new NextRequest(`http://localhost:3000/api/gbp/connect?businessId=${businessId}`));
  return { location: res.headers.get("location") ?? "", cookie: res.cookies.get("gbp_oauth")?.value ?? null };
}

async function callback(query: string, cookie: string | null) {
  const { GET } = await import("@/app/api/gbp/callback/route");
  const req = new NextRequest(`http://localhost:3000/api/gbp/callback?${query}`, {
    headers: cookie ? { cookie: `gbp_oauth=${cookie}` } : {},
  });
  const res = await GET(req);
  return { location: res.headers.get("location") ?? "", clearedCookie: res.cookies.get("gbp_oauth")?.value === "" };
}

function tokenExchangeOk() {
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return jsonResponse({ access_token: "ya29.PLAIN-ACCESS", refresh_token: "1//PLAIN-REFRESH", expires_in: 3600, scope: "https://www.googleapis.com/auth/business.manage" });
    }
    return jsonResponse({}, 404);
  });
}

// ---------------------------------------------------------------------------

describe("plan decision: every plan connects; only Premium opens the Google Profile page", () => {
  test("canConnectGbp is the same for every plan and follows GBP_CONNECT_PUBLIC only", async () => {
    const { canConnectGbp, canUseGoogleProfilePage } = await import("@/lib/premium");
    expect(canConnectGbp({ GBP_CONNECT_PUBLIC: "true", NODE_ENV: "production" })).toBe(true);
    expect(canConnectGbp({ GBP_CONNECT_PUBLIC: "false", NODE_ENV: "production" })).toBe(false);
    expect((["free", "grow", "premium", "multi"] as Plan[]).map(canUseGoogleProfilePage)).toEqual([false, false, true, true]);
  });

  test.each(["free", "grow", "premium", "multi"] as Plan[])("%s can start a real connect", async (plan) => {
    currentPlan = plan;
    const { location, cookie } = await startConnect();
    expect(location.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")).toBe(true);
    expect(cookie).toBeTruthy();
  });

  test("switched off (GBP_CONNECT_PUBLIC unset) nobody reaches Google, whatever the plan", async () => {
    delete process.env.GBP_CONNECT_PUBLIC;
    for (const plan of ["free", "grow", "premium", "multi"] as Plan[]) {
      currentPlan = plan;
      const { location, cookie } = await startConnect();
      expect(location).not.toContain("accounts.google.com");
      expect(cookie).toBeNull();
    }
  });

  test("Reviews-area connect shows for Free and Grow only, and only when switched on", async () => {
    const { gbpReplyCheckState } = await import("@/lib/gbpReplyCheck");
    const status = { status: "ok" as const, connected: false, connectedAt: null };
    expect(gbpReplyCheckState("free", status, null)).toMatchObject({ connected: false, configured: true });
    expect(gbpReplyCheckState("grow", status, "connected")).toMatchObject({ result: "connected" });
    expect(gbpReplyCheckState("premium", status, null)).toBeNull();
    expect(gbpReplyCheckState("multi", status, null)).toBeNull();
    expect(gbpReplyCheckState("grow", status, "<script>")).toMatchObject({ result: null });
    delete process.env.GBP_CONNECT_PUBLIC;
    expect(gbpReplyCheckState("free", status, null)).toBeNull();
  });

  test("after connecting, Free lands on the Overview's reviews, Grow on the Reviews page, Premium on the Google Profile connect page", async () => {
    const { gbpLandingPath } = await import("@/lib/gbpLanding");
    expect(gbpLandingPath("b1", "free", "connected")).toBe("/business/b1?gbp=connected#reply-check");
    expect(gbpLandingPath("b1", "grow", "denied")).toBe("/business/b1/website-reviews?gbp=denied#reply-check");
    expect(gbpLandingPath("b1", "premium", "connected")).toBe("/business/b1/connect-gbp?connected=1");
    expect(gbpLandingPath("b1", "multi", "failed")).toBe("/business/b1/connect-gbp?error=failed");
  });

  test("the Google Profile page stays Premium: its connect button and connected/Disconnect card need Premium", () => {
    const page = fs.readFileSync("app/business/[id]/connect-gbp/page.tsx", "utf8");
    expect(page).toContain("const profilePage = canUseGoogleProfilePage(plan);");
    expect(page).toContain("const connected = profilePage && gbp.status === \"ok\" ? gbp.connected : false;");
    expect(page).toContain("connectOpen={canConnectGbp() && profilePage}");
    // The Growth tab keeps its Premium lock for Free and Grow.
    const growth = fs.readFileSync("app/business/[id]/growth/GrowthView.tsx", "utf8");
    expect(growth).toContain('icon: isPremiumPlan(plan) ? undefined : <IconLock size={13}');
    const growthPage = fs.readFileSync("app/business/[id]/growth/page.tsx", "utf8");
    expect(growthPage).toContain("canConnectGbp() && hasPremium(await getPlan()) && gbpConnected");
  });

  test("Reviews-area UI (EN + ES): connect link when not connected; status + Disconnect when connected", async () => {
    const { GbpReplyCheckConnect } = await import("@/components/gbp/GbpReplyCheckConnect");
    const render = (connected: boolean, locale: Locale = "en", result: "connected" | "denied" | null = null) =>
      renderToStaticMarkup(
        <LocaleProvider locale={locale} timeZone="America/New_York">
          <GbpReplyCheckConnect businessId="b1" state={{ connected, connectedAt: connected ? "2026-10-20T15:00:00Z" : null, configured: true, result }} />
        </LocaleProvider>
      );
    const off = render(false);
    expect(off).toContain('href="/api/gbp/connect?businessId=b1"');
    expect(off).toContain("Read-only");
    expect(off).not.toContain("Disconnect");
    const on = render(true);
    expect(on).toContain("Google connected");
    expect(on).toContain("Disconnect");
    expect(on).toContain("isn&#x27;t live yet");
    expect(on).not.toContain("/api/gbp/connect");
    expect(render(false, "es")).toContain("Conectar Google");
    expect(render(true, "es")).toContain("Desconectar");
    expect(render(false, "en", "denied")).toContain("You didn&#x27;t approve access");
  });
});

describe("tokens: server-only table, encrypted at rest", () => {
  const sql = fs.readFileSync("supabase/gbp-tokens.sql", "utf8");

  test("no client role can read gbp_tokens: RLS on, no policies, privileges revoked", () => {
    expect(sql).toContain("alter table public.gbp_tokens enable row level security;");
    expect(sql).toContain("revoke all on table public.gbp_tokens from anon, authenticated;");
    expect(sql).not.toMatch(/create policy[^;]*on public\.gbp_tokens/i);
    expect(sql).not.toMatch(/grant [^;]*gbp_tokens to (anon|authenticated)/i);
  });

  test("the old plain-text columns are dropped, and owners can't write the status row", () => {
    expect(sql).toContain("drop column if exists access_token;");
    expect(sql).toContain("drop column if exists refresh_token;");
    expect(sql).toContain('drop policy if exists "Users can insert gbp connections for their own businesses"');
    expect(sql).toContain("revoke insert, update, delete on table public.gbp_connections from anon, authenticated;");
    const schema = fs.readFileSync("supabase/schema.sql", "utf8");
    const gbpSection = schema.slice(schema.indexOf("create table if not exists public.gbp_connections"), schema.indexOf("Deep website analysis"));
    expect(gbpSection).not.toMatch(/access_token|refresh_token/);
    expect(gbpSection).not.toMatch(/for (insert|update|delete)/);
  });

  test("only the service-role module touches gbp_tokens; it's server-only", () => {
    const files = ["app", "components", "lib"].flatMap((dir) =>
      (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)).map((f) => `${dir}/${f}`)
    );
    const users = files.filter((f) => fs.readFileSync(f, "utf8").includes('"gbp_tokens"'));
    expect(users).toEqual(["lib/gbpTokens.server.ts"]);
    expect(fs.readFileSync("lib/gbpTokens.server.ts", "utf8")).toContain('import "server-only";');
    expect(fs.readFileSync("lib/gbpSecurity.ts", "utf8")).toContain('import "server-only";');
  });

  test("AES-256-GCM round trip; altered, moved or wrong-key ciphertext won't decrypt", async () => {
    const { encryptGbpToken, decryptGbpToken } = await import("@/lib/gbpSecurity");
    const sealed = encryptGbpToken("1//secret-refresh", BIZ);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("secret-refresh");
    expect(encryptGbpToken("1//secret-refresh", BIZ)).not.toBe(sealed); // fresh IV each time
    expect(decryptGbpToken(sealed, BIZ)).toBe("1//secret-refresh");
    expect(() => decryptGbpToken(sealed, OTHER_BIZ)).toThrow();
    const parts = sealed.split(".");
    const flipped = Buffer.from(parts[3], "base64url");
    flipped[0] ^= 1;
    expect(() => decryptGbpToken([parts[0], parts[1], parts[2], flipped.toString("base64url")].join("."), BIZ)).toThrow();
    expect(() => decryptGbpToken(sealed, BIZ, { GBP_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64") })).toThrow();
    expect(() => encryptGbpToken("x", BIZ, { GBP_TOKEN_ENCRYPTION_KEY: "too-short" })).toThrow();
  });

  test("a full connect stores only ciphertext — no plain token in any row written", async () => {
    tokenExchangeOk();
    const { location, cookie } = await startConnect();
    const state = new URL(location).searchParams.get("state")!;
    const res = await callback(`state=${encodeURIComponent(state)}&code=auth-code`, cookie);
    expect(res.location).toBe("http://localhost:3000/business/biz-1?gbp=connected#reply-check");
    const written = JSON.stringify(adminDb.log.filter((o) => o.op === "upsert"));
    expect(written).not.toContain("PLAIN-ACCESS");
    expect(written).not.toContain("PLAIN-REFRESH");
    const tokenRow = adminDb.tables.gbp_tokens[0];
    const { decryptGbpToken } = await import("@/lib/gbpSecurity");
    expect(decryptGbpToken(String(tokenRow.refresh_token_enc), BIZ)).toBe("1//PLAIN-REFRESH");
    expect(adminDb.tables.gbp_connections[0]).toMatchObject({ business_id: BIZ, status: "connected" });
    expect(Object.keys(adminDb.tables.gbp_connections[0])).not.toContain("access_token");
    // Nothing went through the owner's own (browser-equivalent) session.
    expect(sessionDb.log.every((o) => o.table === "businesses")).toBe(true);
  });
});

describe("OAuth state, nonce cookie and PKCE", () => {
  test("Google gets a signed state and an S256 challenge that matches the cookie's verifier; the exchange sends the verifier", async () => {
    tokenExchangeOk();
    const { pkceChallenge } = await import("@/lib/gbpSecurity");
    const { location, cookie } = await startConnect();
    const url = new URL(location);
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/gbp/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const verifier = cookie!.split(".")[1];
    expect(url.searchParams.get("code_challenge")).toBe(pkceChallenge(verifier));
    expect(url.searchParams.get("state")).not.toBe(BIZ);
    await callback(`state=${encodeURIComponent(url.searchParams.get("state")!)}&code=auth-code`, cookie);
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes("/token"))!;
    expect(new URLSearchParams(String(init.body)).get("code_verifier")).toBe(verifier);
  });

  test("redirect URI comes from SITE_URL, falling back to localhost:3000 only in dev", async () => {
    const { gbpRedirectUri } = await import("@/lib/googleBusinessProfile");
    expect(gbpRedirectUri({ SITE_URL: "https://postscoree.netlify.app/", NODE_ENV: "production" })).toBe("https://postscoree.netlify.app/api/gbp/callback");
    expect(gbpRedirectUri({ NODE_ENV: "development" })).toBe("http://localhost:3000/api/gbp/callback");
    expect(gbpRedirectUri({ NODE_ENV: "production" })).toBeNull();
  });

  test("rejected, with nothing exchanged or stored: no cookie, wrong nonce, tampered or expired state, a plain business id as state", async () => {
    tokenExchangeOk();
    const { location, cookie } = await startConnect();
    const state = new URL(location).searchParams.get("state")!;
    const [nonce, verifier] = cookie!.split(".");
    const [body, sig] = state.split(".");
    const tampered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), b: OTHER_BIZ })).toString("base64url");
    const cases: Array<[string, string | null]> = [
      [state, null],
      [state, `${"x".repeat(nonce.length)}.${verifier}`],
      [`${tampered}.${sig}`, cookie],
      [BIZ, cookie],
    ];
    for (const [s, c] of cases) {
      const res = await callback(`state=${encodeURIComponent(s)}&code=auth-code`, c);
      expect(res.location).toBe("http://localhost:3000/");
      expect(res.clearedCookie).toBe(true);
    }
    const { checkGbpCallback, signGbpState } = await import("@/lib/gbpSecurity");
    const old = signGbpState({ u: OWNER.id, b: BIZ, n: nonce, iat: Date.now() - 11 * 60_000 });
    expect(checkGbpCallback({ state: old, cookieValue: cookie, userId: OWNER.id })).toEqual({ ok: false, reason: "bad_state" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(adminDb.log).toEqual([]);
  });

  test("Google's raw error text is never shown — only our own codes", async () => {
    const { location, cookie } = await startConnect();
    const state = encodeURIComponent(new URL(location).searchParams.get("state")!);
    expect((await callback(`state=${state}&error=access_denied`, cookie)).location).toBe("http://localhost:3000/business/biz-1?gbp=denied#reply-check");
    expect((await callback(`state=${state}&error=%3Cb%3Eevil%3C%2Fb%3E`, cookie)).location).toBe("http://localhost:3000/business/biz-1?gbp=failed#reply-check");
    const view = fs.readFileSync("app/business/[id]/connect-gbp/page.tsx", "utf8");
    expect(view).toContain('parseGbpResult(searchParams.error) ?? "failed"');
  });
});

describe("only the owner can connect their business", () => {
  test("starting a connect for someone else's business goes nowhere near Google", async () => {
    const { location, cookie } = await startConnect(OTHER_BIZ);
    expect(location).toBe("http://localhost:3000/");
    expect(cookie).toBeNull();
  });

  test("a state started by another PostScore user is rejected (login-CSRF / swapped callback)", async () => {
    tokenExchangeOk();
    // The stranger starts a connect in their own browser...
    sessionDb = fakeDb({ businesses: [{ id: BIZ, owner_id: OWNER.id }] }, STRANGER);
    const { checkGbpCallback, startGbpConnect } = await import("@/lib/gbpSecurity");
    const theirs = startGbpConnect(STRANGER.id, BIZ);
    // ...and the owner is lured to the callback with the stranger's state + cookie.
    expect(checkGbpCallback({ state: theirs.state, cookieValue: theirs.cookieValue, userId: OWNER.id })).toEqual({ ok: false, reason: "wrong_user" });
    // Even signed in as the stranger, they don't own BIZ: rejected, nothing stored.
    const res = await callback(`state=${encodeURIComponent(theirs.state)}&code=auth-code`, theirs.cookieValue);
    expect(res.location).toBe("http://localhost:3000/");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(adminDb.log).toEqual([]);
  });
});

describe("disconnect: revoke at Google, then delete tokens and GBP data", () => {
  async function seedConnected() {
    const { encryptGbpToken } = await import("@/lib/gbpSecurity");
    adminDb.tables.gbp_tokens = [{ business_id: BIZ, access_token_enc: encryptGbpToken("ya29.A", BIZ), refresh_token_enc: encryptGbpToken("1//R", BIZ) }];
    adminDb.tables.gbp_connections = [{ business_id: BIZ, status: "connected", google_location_id: "accounts/1/locations/2" }];
  }

  test("revokes the refresh token first, then deletes both rows", async () => {
    await seedConnected();
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));
    const { disconnectGbp } = await import("@/app/actions/gbp");
    expect(await disconnectGbp(BIZ)).toEqual({ status: "ok", revoked: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/revoke");
    expect(new URLSearchParams(String(init.body)).get("token")).toBe("1//R");
    const ops = adminDb.log.map((o) => `${o.op}:${o.table}`);
    expect(ops).toEqual(["select:gbp_tokens", "delete:gbp_tokens", "delete:gbp_connections"]);
    expect(adminDb.tables.gbp_tokens).toEqual([]);
    expect(adminDb.tables.gbp_connections).toEqual([]);
  });

  test("Google already revoked (invalid_token) still counts as revoked; a failed revoke still deletes and says so", async () => {
    await seedConnected();
    fetchMock.mockResolvedValue(jsonResponse({ error: "invalid_token" }, 400));
    const { disconnectGbp } = await import("@/app/actions/gbp");
    expect(await disconnectGbp(BIZ)).toEqual({ status: "ok", revoked: true });
    await seedConnected();
    fetchMock.mockRejectedValue(new Error("network"));
    expect(await disconnectGbp(BIZ)).toEqual({ status: "ok", revoked: false });
    expect(adminDb.tables.gbp_tokens).toEqual([]);
    expect(adminDb.tables.gbp_connections).toEqual([]);
  });

  test("someone who doesn't own the business can't disconnect it", async () => {
    await seedConnected();
    sessionDb = fakeDb({ businesses: [{ id: BIZ, owner_id: OWNER.id }] }, STRANGER);
    const { disconnectGbp } = await import("@/app/actions/gbp");
    expect((await disconnectGbp(BIZ)).status).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(adminDb.log).toEqual([]);
    expect(adminDb.tables.gbp_tokens).toHaveLength(1);
  });
});
