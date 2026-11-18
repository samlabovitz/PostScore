// The dev-only test login (app/dev/test-login/route.ts). Pure.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOOPBACK = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/;

/** Why the test login is refused, or null when it may run: only under
 * `next dev` (never production, never a build or a test run), only for a
 * localhost request, and only with both credentials set in .env.local. */
export function devTestLoginRefusal(env: Record<string, string | undefined>, host: string | null, forwardedFor: string | null = null): string | null {
  if (env.NODE_ENV !== "development") return "not development";
  const hostname = (host ?? "").replace(/:\d+$/, "").toLowerCase();
  if (!LOCAL_HOSTS.has(hostname)) return "not localhost";
  // `next dev` listens on every interface: a request from another machine
  // claiming Host: localhost is still refused.
  if (forwardedFor && !forwardedFor.split(",").every((a) => LOOPBACK.test(a.trim()))) return "not localhost";
  if (!env.DEV_TEST_LOGIN_EMAIL || !env.DEV_TEST_LOGIN_PASSWORD) return "not configured";
  return null;
}

/** Where to go after signing in: a path on this site, never another one. */
export function safeNextPath(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
}
