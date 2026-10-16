// Who (if anyone) may receive a monthly report email — the ONE decision
// every sending path goes through (app/api/cron/monthly-reports/route.ts's
// processBusiness, used by both the scheduled batch and the dev/admin
// send-one route). Pure: env values and owner facts in, a decision out,
// so every rule is testable on its own.
//
// Rules, in order:
//  1. send-one is refused in production unless ALLOW_SEND_ONE=true.
//  2. The owner's own opt-in (monthly_report_enabled) is always respected
//     — an owner who turned reports off never gets one, by any path.
//  3. MONTHLY_REPORTS_LIVE=true → the owner's real address.
//  4. Otherwise NEVER the owner: send-one may send only to the fixed test
//     address in REPORT_TEST_EMAIL (and records nothing as "sent" for the
//     owner); the scheduled batch sends nothing at all.

export type ReportSendPath = "scheduled" | "send-one";

export interface ReportSendEnv {
  NODE_ENV?: string;
  ALLOW_SEND_ONE?: string;
  MONTHLY_REPORTS_LIVE?: string;
  REPORT_TEST_EMAIL?: string;
}

export type ReportSendDecision =
  | { allowed: false; reason: string }
  | { allowed: true; mode: "live"; to: string }
  /** A test send to REPORT_TEST_EMAIL — never the owner, and never
   * recorded as the owner's report for the month. */
  | { allowed: true; mode: "test"; to: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checks that can be made before any paid work (a re-scan): rules 1 and
 * the "nowhere to send" case of rule 4. */
export function reportSendPrecheck(path: ReportSendPath, env: ReportSendEnv): { allowed: true } | { allowed: false; reason: string } {
  if (path === "send-one" && env.NODE_ENV === "production" && env.ALLOW_SEND_ONE !== "true") {
    return { allowed: false, reason: "send-one is disabled in production (set ALLOW_SEND_ONE=true to enable it)" };
  }
  if (env.MONTHLY_REPORTS_LIVE !== "true") {
    if (path === "scheduled") return { allowed: false, reason: "MONTHLY_REPORTS_LIVE is off — the scheduled run sends nothing" };
    if (!env.REPORT_TEST_EMAIL || !EMAIL_RE.test(env.REPORT_TEST_EMAIL.trim())) {
      return { allowed: false, reason: "MONTHLY_REPORTS_LIVE is off and REPORT_TEST_EMAIL isn't set — nowhere safe to send" };
    }
  }
  return { allowed: true };
}

export function decideReportRecipient(input: {
  path: ReportSendPath;
  env: ReportSendEnv;
  ownerOptedIn: boolean;
  ownerEmail: string | null;
}): ReportSendDecision {
  const pre = reportSendPrecheck(input.path, input.env);
  if (!pre.allowed) return pre;
  if (!input.ownerOptedIn) {
    return { allowed: false, reason: "the owner has monthly reports turned off (monthly_report_enabled = false)" };
  }
  if (input.env.MONTHLY_REPORTS_LIVE === "true") {
    if (!input.ownerEmail) return { allowed: false, reason: "no real email on file for this business's owner" };
    return { allowed: true, mode: "live", to: input.ownerEmail };
  }
  return { allowed: true, mode: "test", to: input.env.REPORT_TEST_EMAIL!.trim() };
}

/** The current process's env, narrowed to what the policy reads. */
export function reportSendEnv(): ReportSendEnv {
  return {
    NODE_ENV: process.env.NODE_ENV,
    ALLOW_SEND_ONE: process.env.ALLOW_SEND_ONE,
    MONTHLY_REPORTS_LIVE: process.env.MONTHLY_REPORTS_LIVE,
    REPORT_TEST_EMAIL: process.env.REPORT_TEST_EMAIL,
  };
}
