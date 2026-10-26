// Who (if anyone) may receive a monthly report email — the ONE decision
// every sending path goes through (app/api/cron/monthly-reports/route.ts's
// processBusiness, used by both the scheduled batch and the dev/admin
// send-one route). Pure: env values and owner facts in, a decision out,
// so every rule is testable on its own.
//
// Two modes, set by MONTHLY_REPORTS_LIVE:
//  - TESTING (anything but exactly "true" — the pre-launch state): NO
//    report ever goes to an owner or any account email in PostScore. The
//    scheduled run instead picks 3 random scored businesses
//    (pickTestBusinesses) and sends each report ONLY to REPORT_TEST_EMAIL
//    ("scheduled-test"). No REPORT_TEST_EMAIL → nothing is sent.
//  - LIVE ("true", at launch): opted-in owners on Grow, Premium and Multi
//    get their report ("scheduled"); Free gets none; no test emails.
//
// Rules, in order:
//  1. send-one is refused in production unless ALLOW_SEND_ONE=true.
//  2. Owner sends ("scheduled", and send-one when live) respect the
//     owner's opt-in (monthly_report_enabled) and skip Free
//     (reportPlanCheck). Outside a request the plan is backgroundPlan
//     (lib/plan.ts), which is Free for everyone until subscriptions ship.
//  3. LIVE → the owner's real address; "scheduled-test" is refused.
//  4. TESTING → no normal owner report, ever: "scheduled" (the owner path)
//     sends nothing, and test sends go only to REPORT_TEST_EMAIL as
//     "[TEST]" reports. REPORT_TEST_EMAIL may also be an account's email
//     (the owner's own address is fine) — it still receives only the
//     "[TEST]" reports, never a normal one for its own businesses. Nothing
//     is recorded as the owner's report for the month.

import { planIncludesMonthlyReports, type Plan } from "./plan";

/** "scheduled" = the live owner run; "scheduled-test" = testing mode's 3
 * picked businesses; "send-one" = the dev/admin single-business route. */
export type ReportSendPath = "scheduled" | "scheduled-test" | "send-one";

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

/** Rule 2b: the plan check, made before any paid work. */
export function reportPlanCheck(plan: Plan): { allowed: true } | { allowed: false; reason: string } {
  return planIncludesMonthlyReports(plan)
    ? { allowed: true }
    : { allowed: false, reason: "Free plan — monthly report emails are included with Grow, Premium and Multi" };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Is this a testing-mode run (MONTHLY_REPORTS_LIVE not exactly "true")? */
export function isTestingMode(env: ReportSendEnv): boolean {
  return env.MONTHLY_REPORTS_LIVE !== "true";
}

/** REPORT_TEST_EMAIL, trimmed, when it's a real address — else null. */
export function reportTestEmail(env: ReportSendEnv): string | null {
  const to = env.REPORT_TEST_EMAIL?.trim();
  return to && EMAIL_RE.test(to) ? to : null;
}

/** Checks that can be made before any paid work (a re-scan): rules 1, 3
 * and the "nowhere to send" case of rule 4. */
export function reportSendPrecheck(path: ReportSendPath, env: ReportSendEnv): { allowed: true } | { allowed: false; reason: string } {
  if (path === "send-one" && env.NODE_ENV === "production" && env.ALLOW_SEND_ONE !== "true") {
    return { allowed: false, reason: "send-one is disabled in production (set ALLOW_SEND_ONE=true to enable it)" };
  }
  if (!isTestingMode(env)) {
    if (path === "scheduled-test") return { allowed: false, reason: "MONTHLY_REPORTS_LIVE is on — live mode sends no test emails" };
    return { allowed: true };
  }
  if (path === "scheduled") return { allowed: false, reason: "testing mode (MONTHLY_REPORTS_LIVE is off) — no report goes to any owner" };
  if (!reportTestEmail(env)) {
    return { allowed: false, reason: "testing mode and REPORT_TEST_EMAIL isn't set — nowhere safe to send" };
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
  if (isTestingMode(input.env)) {
    // A "[TEST]" report to REPORT_TEST_EMAIL whatever the owner chose —
    // never the owner's address (unless it IS the test address, which
    // then still gets only the "[TEST]" report).
    return { allowed: true, mode: "test", to: reportTestEmail(input.env)! };
  }
  if (!input.ownerOptedIn) {
    return { allowed: false, reason: "the owner has monthly reports turned off (monthly_report_enabled = false)" };
  }
  if (!input.ownerEmail) return { allowed: false, reason: "no real email on file for this business's owner" };
  return { allowed: true, mode: "live", to: input.ownerEmail };
}

/** Testing mode's pick: `count` random businesses from `candidates`,
 * avoiding last month's picks when there are enough others. Pure
 * (`random` is injectable for tests). */
export function pickTestBusinesses(candidates: string[], lastMonth: string[], count = 3, random: () => number = Math.random): string[] {
  const shuffle = (ids: string[]) => {
    const a = Array.from(new Set(ids));
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const recent = new Set(lastMonth);
  const fresh = shuffle(candidates.filter((id) => !recent.has(id)));
  const repeats = shuffle(candidates.filter((id) => recent.has(id)));
  return [...fresh, ...repeats].slice(0, count);
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
