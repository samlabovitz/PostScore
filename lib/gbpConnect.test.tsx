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
/** Columns the fake database doesn't have yet (e.g. before a SQL file is run). */
const missingColumns = new Set<string>();
interface Op {
  op: "select" | "upsert" | "update" | "delete";
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
          if (Object.keys(row).some((k) => missingColumns.has(k))) return { error: { code: "PGRST204", message: "column not found" } };
          log.push({ op: "upsert", table, row });
          tables[table] = [...(tables[table] ?? []).filter((r) => r.business_id !== row.business_id), row];
          return { error: null };
        },
        update: (patch: Row) => ({
          eq: async (col: string, val: unknown) => {
            log.push({ op: "update" as Op["op"], table, filters: { [col]: val }, row: patch });
            tables[table] = (tables[table] ?? []).map((r) => (r[col] === val ? { ...r, ...patch } : r));
            return { error: null };
          },
        }),
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
const PLACE = "ChIJ-our-place";

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
  sessionDb = fakeDb({ businesses: [{ id: BIZ, owner_id: OWNER.id, place_id: PLACE }, { id: OTHER_BIZ, owner_id: "someone-else", place_id: "other-place" }] }, OWNER);
  adminDb = fakeDb({ gbp_tokens: [], gbp_connections: [] });
  currentPlan = "free";
  missingColumns.clear();
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
async function startConnect(businessId = BIZ, from?: string) {
  const { GET } = await import("@/app/api/gbp/connect/route");
  const res = await GET(new NextRequest(`http://localhost:3000/api/gbp/connect?businessId=${businessId}${from ? `&from=${from}` : ""}`));
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

/** Google's side: the token endpoint, the revoke endpoint, and the
 * account / location lists (default: one account, one matching location). */
function googleApi(locationsByAccount: Record<string, Array<Array<Record<string, unknown>>>> = { "accounts/1": [[loc("locations/9", PLACE, true)]] }) {
  fetchMock.mockImplementation(async (url: string) => {
    const u = new URL(String(url));
    if (u.href.startsWith("https://oauth2.googleapis.com/token")) {
      return jsonResponse({ access_token: "ya29.PLAIN-ACCESS", refresh_token: "1//PLAIN-REFRESH", expires_in: 3600, scope: "https://www.googleapis.com/auth/business.manage" });
    }
    if (u.href.startsWith("https://oauth2.googleapis.com/revoke")) return new Response("", { status: 200 });
    if (u.host === "mybusinessaccountmanagement.googleapis.com") {
      return jsonResponse({ accounts: Object.keys(locationsByAccount).map((name) => ({ name })) });
    }
    if (u.host === "mybusinessbusinessinformation.googleapis.com") {
      const account = u.pathname.replace(/^\/v1\//, "").replace(/\/locations$/, "");
      const pages = locationsByAccount[account] ?? [[]];
      const i = Number(u.searchParams.get("pageToken") ?? 0);
      return jsonResponse({ locations: pages[i], ...(i + 1 < pages.length ? { nextPageToken: String(i + 1) } : {}) });
    }
    return jsonResponse({}, 404);
  });
}
function loc(name: string, placeId: string | null, voice = false, title = "Hair express on Broadway") {
  return {
    name,
    title,
    storefrontAddress: { addressLines: ["9 S Broadway"], locality: "Tarrytown", administrativeArea: "NY", postalCode: "10591" },
    metadata: { ...(placeId ? { placeId } : {}), hasVoiceOfMerchant: voice },
  };
}
const tokenExchangeOk = () => googleApi();

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
    const status = { status: "ok" as const, connected: false, connectedAt: null, locationTitle: null, locationAddress: null, needsReconnect: false };
    expect(gbpReplyCheckState("free", status, null)).toMatchObject({ connected: false, configured: true });
    expect(gbpReplyCheckState("grow", status, "connected")).toMatchObject({ result: "connected" });
    expect(gbpReplyCheckState("premium", status, null)).toBeNull();
    expect(gbpReplyCheckState("multi", status, null)).toBeNull();
    expect(gbpReplyCheckState("grow", status, "<script>")).toMatchObject({ result: null });
    delete process.env.GBP_CONNECT_PUBLIC;
    expect(gbpReplyCheckState("free", status, null)).toBeNull();
  });

  test("landing paths: Free → Overview reviews, Grow → Reviews page, Premium → Google Profile tab or connect page", async () => {
    const { gbpLandingPath, resolveGbpOrigin } = await import("@/lib/gbpLanding");
    expect(gbpLandingPath("b1", "overview", "connected")).toBe("/business/b1?gbp=connected#reply-check");
    expect(gbpLandingPath("b1", "reviews", "denied")).toBe("/business/b1/website-reviews?gbp=denied#reply-check");
    expect(gbpLandingPath("b1", "profile", "connected")).toBe("/business/b1/growth?tab=google-profile&gbp=connected#google-connection");
    expect(gbpLandingPath("b1", "connect", "failed")).toBe("/business/b1/connect-gbp?gbp=failed");
    // Free and Grow can never be routed to a Premium page, whatever "from" says.
    expect(resolveGbpOrigin("free", "profile")).toBe("overview");
    expect(resolveGbpOrigin("grow", "connect")).toBe("reviews");
    expect(resolveGbpOrigin("premium", "profile")).toBe("profile");
    expect(resolveGbpOrigin("multi", null)).toBe("connect");
  });

  test("the Google Profile page stays Premium: Free and Grow are redirected away from its connect page", () => {
    const page = fs.readFileSync("app/business/[id]/connect-gbp/page.tsx", "utf8");
    expect(page).toContain("if (!canUseGoogleProfilePage(plan)) {\n    redirect(gbpReplyCheckPath(params.id, plan));");
    expect(page.indexOf("redirect(gbpReplyCheckPath")).toBeLessThan(page.indexOf("<ConnectGbpView"));
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
          <GbpReplyCheckConnect
            businessId="b1"
            state={{
              connected,
              connectedAt: connected ? "2026-10-20T15:00:00Z" : null,
              locationTitle: connected ? "Hair express on Broadway" : null,
              locationAddress: connected ? "9 S Broadway, Tarrytown, NY 10591" : null,
              needsReconnect: false,
              configured: true,
              result,
              origin: "overview",
              business: { name: "Hair express on Broadway", address: "9 S Broadway, Tarrytown, NY 10591, USA" },
            }}
          />
        </LocaleProvider>
      );
    const off = render(false);
    expect(off).toContain('href="/api/gbp/connect?businessId=b1&amp;from=overview"');
    expect(off).toContain("so your score can include how you reply to reviews");
    expect(off).toContain("Premium adds your Google insights");
    expect(off).toContain('href="/business/b1/settings#compare-plans"');
    expect(off).not.toContain("connect-gbp");
    expect(off).toContain("Read-only");
    expect(off).not.toContain("Disconnect");
    const on = render(true);
    expect(on).toContain("Connected: Hair express on Broadway, 9 S Broadway, Tarrytown, NY 10591");
    expect(on).toContain("Disconnect");
    expect(on).toContain("That check isn&#x27;t in your score yet");
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
    // This user's own signed attempt with a lost cookie or another browser's
    // nonce → back to where they started, "start again"; forged → home.
    const cases: Array<[string, string | null, string]> = [
      [state, null, "http://localhost:3000/business/biz-1?gbp=state#reply-check"],
      [state, `${"x".repeat(nonce.length)}.${verifier}`, "http://localhost:3000/business/biz-1?gbp=state#reply-check"],
      [`${tampered}.${sig}`, cookie, "http://localhost:3000/"],
      [BIZ, cookie, "http://localhost:3000/"],
    ];
    for (const [s, c, expected] of cases) {
      const res = await callback(`state=${encodeURIComponent(s)}&code=auth-code`, c);
      expect(res.location).toBe(expected);
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
    expect((await callback(`state=${state}&error=%3Cb%3Eevil%3C%2Fb%3E`, cookie)).location).toBe("http://localhost:3000/business/biz-1?gbp=exchange_failed#reply-check");
    const view = fs.readFileSync("app/business/[id]/connect-gbp/page.tsx", "utf8");
    expect(view).toContain("const result = parseGbpResult(searchParams.gbp);");
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

describe("Step 1: find the location by its Maps place ID", () => {
  test("one account, one matching location → match with title and one-line address", async () => {
    googleApi();
    const { findGbpLocation } = await import("@/lib/gbpLocations");
    expect(await findGbpLocation("tok", PLACE)).toEqual({
      kind: "match",
      match: { accountName: "accounts/1", locationName: "locations/9", title: "Hair express on Broadway", address: "9 S Broadway, Tarrytown, NY 10591" },
    });
    // Every Google call carried the bearer token; one accounts call + one locations page.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) expect(init.headers.Authorization).toBe("Bearer tok");
    const locUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(locUrl.searchParams.get("readMask")).toBe("name,title,storefrontAddress,metadata");
    expect(locUrl.searchParams.get("pageSize")).toBe("100");
  });

  test("several locations across pages → picks only the one whose placeId matches", async () => {
    googleApi({
      "accounts/1": [
        [loc("locations/1", "other-1", true, "Other salon"), loc("locations/2", "other-2", true, "Another salon")],
        [loc("locations/3", "other-3", true, "Third"), loc("locations/4", PLACE, true)],
      ],
    });
    const { findGbpLocation } = await import("@/lib/gbpLocations");
    const r = await findGbpLocation("tok", PLACE);
    expect(r).toMatchObject({ kind: "match", match: { locationName: "locations/4", title: "Hair express on Broadway" } });
  });

  test("same place under two accounts → prefers the one with Voice of Merchant", async () => {
    googleApi({
      "accounts/personal": [[loc("locations/7", PLACE, false)]],
      "accounts/group": [[loc("locations/8", PLACE, true)]],
    });
    const { findGbpLocation } = await import("@/lib/gbpLocations");
    expect(await findGbpLocation("tok", PLACE)).toMatchObject({ kind: "match", match: { accountName: "accounts/group", locationName: "locations/8" } });
  });

  test("no match → no_match, never another location", async () => {
    googleApi({ "accounts/1": [[loc("locations/1", "someone-else", true, "Other salon")]] });
    const { findGbpLocation } = await import("@/lib/gbpLocations");
    expect(await findGbpLocation("tok", PLACE)).toEqual({ kind: "no_match", unverified: false });
  });

  test("no placeId (unverified location, or our business has none) → no_match with the verify hint", async () => {
    googleApi({ "accounts/1": [[loc("locations/1", null, false)]] });
    const { findGbpLocation } = await import("@/lib/gbpLocations");
    expect(await findGbpLocation("tok", PLACE)).toEqual({ kind: "no_match", unverified: true });
    fetchMock.mockClear();
    expect(await findGbpLocation("tok", null)).toEqual({ kind: "no_match", unverified: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("listing stays far inside the 300/min quota: a hard cap per connect", async () => {
    const { findGbpLocation, MAX_LIST_CALLS } = await import("@/lib/gbpLocations");
    googleApi({ "accounts/1": Array.from({ length: 200 }, (_, i) => [loc(`locations/${i}`, `p${i}`, true, "x")]) });
    expect(await findGbpLocation("tok", PLACE)).toMatchObject({ kind: "error", step: "cap" });
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(MAX_LIST_CALLS);
    expect(MAX_LIST_CALLS).toBeLessThanOrEqual(50);
  });

  test("callback with a match saves the IDs, title and address once (cached for later steps)", async () => {
    googleApi();
    const { location, cookie } = await startConnect();
    await callback(`state=${encodeURIComponent(new URL(location).searchParams.get("state")!)}&code=c`, cookie);
    expect(adminDb.tables.gbp_connections[0]).toMatchObject({
      google_account_id: "accounts/1",
      google_location_id: "locations/9",
      location_title: "Hair express on Broadway",
      location_address: "9 S Broadway, Tarrytown, NY 10591",
    });
  });

  test("callback with no match: doesn't connect — revokes, keeps no tokens, deletes any earlier connection, explains", async () => {
    const { encryptGbpToken } = await import("@/lib/gbpSecurity");
    adminDb.tables.gbp_tokens = [{ business_id: BIZ, access_token_enc: encryptGbpToken("ya29.OLD", BIZ), refresh_token_enc: null }];
    adminDb.tables.gbp_connections = [{ business_id: BIZ, status: "connected" }];
    googleApi({ "accounts/1": [[loc("locations/1", "someone-else", true, "Other salon")]] });
    const { location, cookie } = await startConnect();
    const res = await callback(`state=${encodeURIComponent(new URL(location).searchParams.get("state")!)}&code=c`, cookie);
    expect(res.location).toBe("http://localhost:3000/business/biz-1?gbp=no_match#reply-check");
    const revokes = fetchMock.mock.calls.filter(([u]) => String(u).includes("/revoke")).map(([, init]) => new URLSearchParams(String(init.body)).get("token"));
    expect(revokes).toEqual(["1//PLAIN-REFRESH", "ya29.OLD"]);
    expect(adminDb.log.some((o) => o.op === "upsert")).toBe(false);
    expect(adminDb.tables.gbp_tokens).toEqual([]);
    expect(adminDb.tables.gbp_connections).toEqual([]);
  });

  test("no-match messages name the business from PostScore's record (EN + ES), plus the verify hint", async () => {
    const { gbpResultText } = await import("@/components/gbp/GbpResultMessage");
    const biz = { name: "Hair express on Broadway", address: "9 S Broadway, Tarrytown, NY 10591, USA" };
    expect(gbpResultText("en", "no_match", biz)).toBe(
      "This Google account doesn't manage Hair express on Broadway at 9 S Broadway, Tarrytown, NY 10591, USA. Sign in with the account that manages it."
    );
    expect(gbpResultText("en", "no_match_unverified", biz)).toContain("verify your listing on Google first");
    expect(gbpResultText("es", "no_match", biz)).toBe(
      "Esta cuenta de Google no administra Hair express on Broadway en 9 S Broadway, Tarrytown, NY 10591, USA. Inicie sesión con la cuenta que la administra."
    );
  });
});

describe("return to where the owner started", () => {
  async function roundTrip(plan: Plan, from?: string) {
    currentPlan = plan;
    googleApi();
    const { location, cookie } = await startConnect(BIZ, from);
    return (await callback(`state=${encodeURIComponent(new URL(location).searchParams.get("state")!)}&code=c`, cookie)).location;
  }
  test.each([
    ["free", "overview", "http://localhost:3000/business/biz-1?gbp=connected#reply-check"],
    ["grow", "reviews", "http://localhost:3000/business/biz-1/website-reviews?gbp=connected#reply-check"],
    ["premium", "profile", "http://localhost:3000/business/biz-1/growth?tab=google-profile&gbp=connected#google-connection"],
    ["multi", "connect", "http://localhost:3000/business/biz-1/connect-gbp?gbp=connected"],
    // Free/Grow can't be routed to a Premium page even by asking.
    ["free", "profile", "http://localhost:3000/business/biz-1?gbp=connected#reply-check"],
    ["grow", "connect", "http://localhost:3000/business/biz-1/website-reviews?gbp=connected#reply-check"],
  ] as Array<[Plan, string, string]>)("%s from %s", async (plan, from, expected) => {
    expect(await roundTrip(plan, from)).toBe(expected);
  });

  test("the origin travels inside the signed state, so it can't be swapped", async () => {
    const { location } = await startConnect(BIZ, "overview");
    const { verifyGbpState } = await import("@/lib/gbpSecurity");
    expect(verifyGbpState(new URL(location).searchParams.get("state")!)).toMatchObject({ o: "overview" });
  });
});

describe("getValidAccessToken", () => {
  async function seed(expiresInMs: number, refresh: string | null = "1//R") {
    const { encryptGbpToken } = await import("@/lib/gbpSecurity");
    adminDb.tables.gbp_tokens = [
      { business_id: BIZ, access_token_enc: encryptGbpToken("ya29.STORED", BIZ), refresh_token_enc: refresh ? encryptGbpToken(refresh, BIZ) : null, token_expires_at: new Date(Date.now() + expiresInMs).toISOString() },
    ];
    adminDb.tables.gbp_connections = [{ business_id: BIZ, status: "connected" }];
  }

  test("uses the stored token while more than 2 minutes are left", async () => {
    await seed(10 * 60_000);
    const { getValidAccessTokenWithClient } = await import("@/lib/gbpTokens.server");
    expect(await getValidAccessTokenWithClient(adminDb as never, BIZ)).toEqual({ status: "ok", accessToken: "ya29.STORED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("under 2 minutes left → refreshes and stores the new token encrypted", async () => {
    await seed(60_000);
    fetchMock.mockResolvedValue(jsonResponse({ access_token: "ya29.FRESH", expires_in: 3600 }));
    const { getValidAccessTokenWithClient } = await import("@/lib/gbpTokens.server");
    expect(await getValidAccessTokenWithClient(adminDb as never, BIZ)).toEqual({ status: "ok", accessToken: "ya29.FRESH" });
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1].body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("1//R");
    const row = adminDb.tables.gbp_tokens[0];
    expect(String(row.access_token_enc)).not.toContain("FRESH");
    const { decryptGbpToken } = await import("@/lib/gbpSecurity");
    expect(decryptGbpToken(String(row.access_token_enc), BIZ)).toBe("ya29.FRESH");
  });

  test("invalid_grant → status error, asks to reconnect: tokens deleted, connection marked error", async () => {
    await seed(0);
    fetchMock.mockResolvedValue(jsonResponse({ error: "invalid_grant" }, 400));
    const { getValidAccessTokenWithClient } = await import("@/lib/gbpTokens.server");
    expect(await getValidAccessTokenWithClient(adminDb as never, BIZ)).toEqual({ status: "error", reason: "reconnect" });
    expect(adminDb.tables.gbp_tokens).toEqual([]);
    expect(adminDb.tables.gbp_connections[0]).toMatchObject({ status: "error" });
  });

  test("a status row marked error shows 'Reconnect Google' in the Reviews-area box", async () => {
    const { GbpReplyCheckConnect } = await import("@/components/gbp/GbpReplyCheckConnect");
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en" timeZone="America/New_York">
        <GbpReplyCheckConnect
          businessId="b1"
          state={{ connected: false, connectedAt: null, locationTitle: null, locationAddress: null, needsReconnect: true, configured: true, result: null, origin: "reviews", business: { name: null, address: null } }}
        />
      </LocaleProvider>
    );
    expect(html).toContain("Reconnect Google");
    expect(html).toContain('href="/api/gbp/connect?businessId=b1&amp;from=reviews"');
  });
});

describe("Free and Grow see the connect box but never the Premium pages", () => {
  test("Free: the box sits right under the Reviews card's header, before the review link", async () => {
    const { FreeReviews } = await import("@/components/overview/FreeOverview");
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en" timeZone="America/New_York">
        <FreeReviews placeId="p1" rating={4.6} reviewCount={10} goal={null} group={null} connect={<div data-testid="gbp-reply-check" />}>
          <div data-testid="drafter" />
        </FreeReviews>
      </LocaleProvider>
    );
    expect(html.indexOf('data-testid="gbp-reply-check"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="gbp-reply-check"')).toBeLessThan(html.indexOf('data-testid="free-review-link"'));
    const view = fs.readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8");
    expect(view).toContain("connect={gbpReplyCheck ? <GbpReplyCheckConnect businessId={businessId} state={gbpReplyCheck} /> : null}");
    expect(fs.readFileSync("app/business/[id]/page.tsx", "utf8")).toContain("gbpReplyCheck={free ? gbpReplyCheckState(upgrade.plan, gbpStatus, searchParams.gbp");
  });

  test("Grow: the box is on the Reviews page, and the Premium reply-assistant card (→ Premium page) is Premium-only", () => {
    const view = fs.readFileSync("app/business/[id]/website-reviews/ReviewsView.tsx", "utf8");
    expect(view).toContain("<GbpReplyCheckConnect businessId={businessId} state={gbpReplyCheck} />");
    expect(view).toContain("{!isPremiumPlan(plan) ? null : reviews.gbpConnected ? (");
  });

  test("the Google Profile tab stays locked for Free and Grow; its connection card sends them to their reviews area", async () => {
    const growth = fs.readFileSync("app/business/[id]/growth/GrowthView.tsx", "utf8");
    expect(growth).toContain('icon: isPremiumPlan(plan) ? undefined : <IconLock size={13}');
    const { gbpReplyCheckPath } = await import("@/lib/gbpLanding");
    expect(gbpReplyCheckPath("b1", "free")).toBe("/business/b1#reply-check");
    expect(gbpReplyCheckPath("b1", "grow")).toBe("/business/b1/website-reviews#reply-check");
    const panel = fs.readFileSync("components/gbp/GoogleProfilePanel.tsx", "utf8");
    expect(panel).toContain("<Link href={gbpReplyCheckPath(businessId, plan)} className={linkClass}>");
    // Premium promos for Free/Grow open Compare plans, not the connect page.
    expect(growth).toContain("premium ? `/business/${businessId}/connect-gbp` : `/business/${businessId}/settings#compare-plans`");
    expect(fs.readFileSync("components/gbp/LiveListingSection.tsx", "utf8")).toContain("premium ? `/business/${businessId}/connect-gbp` : `/business/${businessId}/settings#compare-plans`");
  });

  test("only GBP_CONNECT_PUBLIC decides, not NODE_ENV", async () => {
    const { canConnectGbp } = await import("@/lib/premium");
    expect(canConnectGbp({ GBP_CONNECT_PUBLIC: "true", NODE_ENV: "production" })).toBe(canConnectGbp({ GBP_CONNECT_PUBLIC: "true", NODE_ENV: "development" }));
    expect(canConnectGbp({ NODE_ENV: "development" })).toBe(false);
    const src = fs.readFileSync("lib/gbpReplyCheck.ts", "utf8");
    expect(src).not.toMatch(/process\.env\.NODE_ENV|NODE_ENV ===/);
  });
});

describe("Premium connect page copy", () => {
  test("every feature card is marked Coming soon (EN + ES); the honest connected copy replaces the old line", async () => {
    const { ConnectGbpView } = await import("@/app/business/[id]/connect-gbp/ConnectGbpView");
    const props = { businessId: "b1", businessName: "Shop", connected: false, connectedAt: null, justConnected: false, error: null, oauthConfigured: true, connectOpen: true };
    const render = (p: Record<string, unknown>, locale: Locale = "en") =>
      renderToStaticMarkup(
        <LocaleProvider locale={locale} timeZone="America/New_York">
          <ConnectGbpView {...props} {...p} />
        </LocaleProvider>
      );
    expect(render({}).match(/data-testid="unlock-soon"/g)?.length).toBe(9);
    expect(render({}, "es")).toContain("Próximamente");
    const just = render({ justConnected: true, connected: true, locationTitle: "Hair express on Broadway", locationAddress: "9 S Broadway, Tarrytown, NY 10591" });
    expect(just).toContain("PostScore will use it to check how you reply to reviews. More features are coming.");
    expect(just).toContain("Connected: Hair express on Broadway, 9 S Broadway, Tarrytown, NY 10591");
    expect(just).not.toContain("review process");
    expect(render({ error: "no_match", businessAddress: "9 S Broadway" })).toContain("This Google account doesn&#x27;t manage Shop at 9 S Broadway.");
    const { messages } = await import("@/lib/i18n/messages");
    for (const lang of ["en", "es"] as const) expect(JSON.stringify(messages[lang])).not.toMatch(/still finishing Google|proceso de revisión de Google/);
  });
});

describe("bug: Free connect landed on 'Couldn't connect Google'", () => {
  async function connectOnce(query = "code=c") {
    const { location, cookie } = await startConnect();
    return (await callback(`state=${encodeURIComponent(new URL(location).searchParams.get("state")!)}&${query}`, cookie)).location;
  }

  test("root cause: the save wrote location_title/location_address before supabase/gbp-location.sql was run — now it still connects", async () => {
    missingColumns.add("location_title").add("location_address");
    googleApi();
    expect(await connectOnce()).toBe("http://localhost:3000/business/biz-1?gbp=connected#reply-check");
    expect(adminDb.tables.gbp_connections[0]).toMatchObject({ status: "connected", google_account_id: "accounts/1", google_location_id: "locations/9" });
    expect(adminDb.tables.gbp_connections[0]).not.toHaveProperty("location_title");
    expect(adminDb.tables.gbp_tokens).toHaveLength(1);
  });

  test("a different save error still fails honestly, and leaves no tokens behind", async () => {
    missingColumns.add("google_account_id");
    googleApi();
    expect(await connectOnce()).toBe("http://localhost:3000/business/biz-1?gbp=failed#reply-check");
    expect(adminDb.tables.gbp_tokens).toEqual([]);
  });

  test("each failure has its own code: cancelled, state, exchange rejected, no match, Google API error", async () => {
    googleApi();
    expect(await connectOnce("error=access_denied")).toContain("?gbp=denied#");
    // Expired attempt (signed by us, this user, older than 10 minutes).
    const { signGbpState } = await import("@/lib/gbpSecurity");
    const old = signGbpState({ u: OWNER.id, b: BIZ, n: "n", iat: Date.now() - 11 * 60_000, o: "overview" });
    expect((await callback(`state=${encodeURIComponent(old)}&code=c`, "n.v")).location).toContain("?gbp=state#");
    // Google refuses the code exchange.
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/token") ? jsonResponse({ error: "invalid_grant", error_description: "Bad Request" }, 400) : jsonResponse({}, 404)
    );
    expect(await connectOnce()).toContain("?gbp=exchange_failed#");
    googleApi({ "accounts/1": [[loc("locations/1", "someone-else", true)]] });
    expect(await connectOnce()).toContain("?gbp=no_match#");
    // Business Profile API not enabled (403 SERVICE_DISABLED).
    googleApi();
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) =>
      String(url).includes("mybusinessaccountmanagement")
        ? jsonResponse({ error: { code: 403, status: "PERMISSION_DENIED", details: [{ reason: "SERVICE_DISABLED" }] } }, 403)
        : base(url, init)
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await connectOnce()).toContain("?gbp=google_api#");
    const logged = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("[gbp-connect] location listing failed");
    expect(logged).toContain('"status":403');
    expect(logged).toContain('"reason":"SERVICE_DISABLED"');
    // The log never carries tokens, codes or the state.
    expect(logged).not.toMatch(/ya29\.|1\/\/|PLAIN|code=|state=/);
    warn.mockRestore();
    // Fixed messages for every code, EN + ES.
    const { gbpResultText } = await import("@/components/gbp/GbpResultMessage");
    const { GBP_CONNECT_RESULTS } = await import("@/lib/gbpLanding");
    for (const r of GBP_CONNECT_RESULTS) for (const lang of ["en", "es"] as const) expect(gbpResultText(lang, r, { name: "X", address: null })).not.toMatch(/^dashboard\./);
  });
});
