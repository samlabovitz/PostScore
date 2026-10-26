// Server-only. The security pieces of the Google Business Profile connect:
// tokens encrypted at rest (AES-256-GCM), and a signed OAuth state with a
// cookie nonce and PKCE so a callback only completes for the PostScore
// user who started it, for the business they started it for.
//
// One secret, GBP_TOKEN_ENCRYPTION_KEY (32 random bytes, base64). Two
// separate subkeys are derived from it (HKDF): one encrypts tokens, one
// signs the state — so neither use can leak into the other.
import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "crypto";

type Env = { GBP_TOKEN_ENCRYPTION_KEY?: string; NODE_ENV?: string };

/** The raw key, or null when it's missing or not exactly 32 bytes. */
export function readGbpKey(env: Env = process.env): Buffer | null {
  const raw = env.GBP_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

function subkey(purpose: "tokens" | "state", env: Env): Buffer {
  const key = readGbpKey(env);
  if (!key) throw new Error("GBP_TOKEN_ENCRYPTION_KEY is missing or isn't 32 bytes (base64).");
  return Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), `postscore-gbp-${purpose}`, 32));
}

const TOKEN_FORMAT = "v1";

/**
 * Encrypts one token. The business id is bound in as associated data, so
 * a ciphertext copied onto another business's row won't decrypt.
 * Output: "v1.<iv>.<tag>.<ciphertext>" (base64url parts).
 */
export function encryptGbpToken(plain: string, businessId: string, env: Env = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", subkey("tokens", env), iv);
  cipher.setAAD(Buffer.from(businessId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [TOKEN_FORMAT, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Decrypts a token sealed by encryptGbpToken; throws if it was altered,
 * belongs to another business, or the key is wrong. */
export function decryptGbpToken(sealed: string, businessId: string, env: Env = process.env): string {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== TOKEN_FORMAT || !iv || !tag || ciphertext === undefined) {
    throw new Error("Unrecognized encrypted token format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", subkey("tokens", env), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(businessId, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// OAuth state, nonce cookie and PKCE
// ---------------------------------------------------------------------------

/** httpOnly cookie holding "<nonce>.<PKCE verifier>" for one connect attempt. */
export const GBP_OAUTH_COOKIE = "gbp_oauth";
/** A connect attempt must finish within this long. */
export const GBP_STATE_MAX_AGE_SECONDS = 600;

export interface GbpStatePayload {
  /** The PostScore user who started the connect. */
  u: string;
  /** The business it's for. */
  b: string;
  /** Matches the nonce in the cookie. */
  n: string;
  /** Issued at (ms). */
  iat: number;
  /** Where the owner started (lib/gbpLanding.ts GbpOrigin) — they return there. */
  o?: string;
}

function stateSignature(body: string, env: Env): Buffer {
  return createHmac("sha256", subkey("state", env)).update(body).digest();
}

export function signGbpState(payload: GbpStatePayload, env: Env = process.env): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${stateSignature(body, env).toString("base64url")}`;
}

/** The payload, or null when the signature is wrong, it's malformed, or it's expired. */
export function verifyGbpState(state: string, env: Env = process.env, now: number = Date.now()): GbpStatePayload | null {
  const payload = readSignedGbpState(state, env);
  if (!payload) return null;
  if (now - payload.iat > GBP_STATE_MAX_AGE_SECONDS * 1000 || payload.iat - now > 60_000) return null;
  return payload;
}

/** The payload when the signature is ours, even if expired — used only to
 * send the owner back to where they started with a "try again" message,
 * never to complete a connect. */
export function readSignedGbpState(state: string, env: Env = process.env): GbpStatePayload | null {
  const [body, sig, extra] = state.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = stateSignature(body, env);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: GbpStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload?.u !== "string" || typeof payload.b !== "string" || typeof payload.n !== "string" || typeof payload.iat !== "number") return null;
  return payload;
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** RFC 7636 S256 challenge for a verifier. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Everything one connect attempt needs: the signed state for Google, the
 * PKCE challenge for Google, and the cookie value that stays with the browser. */
export function startGbpConnect(userId: string, businessId: string, env: Env = process.env, now: number = Date.now(), origin?: string) {
  const nonce = randomToken();
  const verifier = randomToken();
  return {
    state: signGbpState({ u: userId, b: businessId, n: nonce, iat: now, ...(origin ? { o: origin } : {}) }, env),
    codeChallenge: pkceChallenge(verifier),
    cookieValue: `${nonce}.${verifier}`,
  };
}

export type GbpCallbackCheck =
  | { ok: true; businessId: string; codeVerifier: string; origin: string | null }
  | { ok: false; reason: "missing" | "bad_state" | "nonce_mismatch" | "wrong_user" };

/**
 * The callback's gate: the state must carry a valid signature, be fresh,
 * name the signed-in user, and match the nonce in this browser's cookie.
 * Any mismatch rejects — nothing is exchanged or stored.
 */
export function checkGbpCallback(params: {
  state: string | null;
  cookieValue: string | null;
  userId: string;
  env?: Env;
  now?: number;
}): GbpCallbackCheck {
  const { state, cookieValue, userId, env = process.env, now = Date.now() } = params;
  if (!state || !cookieValue) return { ok: false, reason: "missing" };
  const payload = verifyGbpState(state, env, now);
  if (!payload) return { ok: false, reason: "bad_state" };
  const [nonce, verifier, extra] = cookieValue.split(".");
  if (!nonce || !verifier || extra !== undefined) return { ok: false, reason: "nonce_mismatch" };
  const a = Buffer.from(nonce);
  const b = Buffer.from(payload.n);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "nonce_mismatch" };
  if (payload.u !== userId) return { ok: false, reason: "wrong_user" };
  return { ok: true, businessId: payload.b, codeVerifier: verifier, origin: typeof payload.o === "string" ? payload.o : null };
}
