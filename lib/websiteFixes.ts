// Day 4 Step 3: every losing website check, turned into the fix(es) an
// owner actually faces — one honest label each, with a time range when
// they can do it themselves:
//   "postscore_does" — PostScore produces the finished thing (today: the
//                      starter site, for a business with no website);
//   "guided"         — the owner can do it with our steps, ~X–Y minutes;
//   "web_person"     — realistically a developer/host job.
// One fix per missing item (CheckResult.gaps), so "N fixes" counts real
// work, not checks. A minor speed gap (90+/100 or "fast") is no fix at
// all (isMinorSpeedGap). Pure — see ~/Desktop/website-fixes-inventory.md.

import { isMinorSpeedGap, type CheckResult } from "@/lib/scoring";
import { HOSTED_BUILDERS, type WebsiteBuilderId } from "@/lib/websiteBuilder";

export type WebsiteFixKind = "postscore_does" | "guided" | "web_person";

export interface WebsiteFix {
  checkId: string;
  /** The missing item this fix is for (a CheckResult.gaps code), or null. */
  gap: string | null;
  kind: WebsiteFixKind;
  /** Minutes for an owner doing it themselves; null for a web person. */
  minutes: { min: number; max: number } | null;
}

const guided = (min: number, max: number) => ({ kind: "guided" as const, minutes: { min, max } });
const webPerson = { kind: "web_person" as const, minutes: null };

function isLosing(check: CheckResult): boolean {
  return (
    (check.confidence === "VERIFIED" || check.confidence === "LIKELY") &&
    check.earnedPoints !== null &&
    check.earnedPoints < check.maxPoints &&
    !isMinorSpeedGap(check)
  );
}

/** The fixes for one check (empty when it isn't losing points). */
export function websiteFixesFor(check: CheckResult, builder: WebsiteBuilderId | null): WebsiteFix[] {
  // Google's speed test can't find the page's main content: not scored,
  // but a real site problem — always a web person's job.
  if (check.id === "website.performance_mobile" && check.gaps?.includes("no_main_content")) {
    return [{ checkId: check.id, gap: "no_main_content", ...webPerson }];
  }
  if (!check.id.startsWith("website.") || !isLosing(check)) return [];
  const hosted = builder !== null && HOSTED_BUILDERS.has(builder);
  const partial = (check.earnedPoints ?? 0) > 0;
  const one = (gap: string | null, rule: { kind: WebsiteFixKind; minutes: { min: number; max: number } | null }): WebsiteFix => ({
    checkId: check.id,
    gap,
    ...rule,
  });
  const gaps = check.gaps ?? [];

  switch (check.id) {
    case "website.has_website":
      // No website (or only a social page): the starter site.
      if (gaps.includes("missing") || gaps.includes("social_page")) {
        return [one(gaps.includes("missing") ? "missing" : "social_page", { kind: "postscore_does", minutes: { min: 15, max: 30 } })];
      }
      return [one(gaps[0] ?? null, guided(5, 10))];
    case "website.https":
      return [one(null, hosted ? guided(5, 10) : webPerson)];
    case "website.performance_mobile":
      return [one(null, hosted ? guided(20, 40) : webPerson)];
    case "website.content_depth": {
      const perGap: Record<string, ReturnType<typeof guided> | typeof webPerson> = {
        title: guided(5, 10),
        meta: guided(5, 10),
        headings: guided(20, 40),
        thin: guided(20, 40),
        viewport: hosted ? guided(15, 30) : webPerson,
      };
      const known = gaps.filter((g) => perGap[g]);
      return known.length > 0 ? known.map((g) => one(g, perGap[g])) : [one(null, guided(10, 20))];
    }
    case "website.contact_conversion": {
      const perGap: Record<string, ReturnType<typeof guided>> = { contact: guided(10, 15), cta: guided(5, 10) };
      const known = gaps.filter((g) => perGap[g]);
      return known.length > 0 ? known.map((g) => one(g, perGap[g])) : [one(null, guided(10, 15))];
    }
    case "website.about_presence":
      return [one(null, partial ? guided(10, 20) : guided(15, 30))];
    case "website.services_presence":
      return [one(null, partial ? guided(15, 30) : guided(20, 40))];
    case "website.social_links":
      return [one(null, guided(5, 10))];
    case "website.security":
      return [one(null, webPerson)];
    case "website.info_consistency":
      return [one(null, guided(5, 10))];
    case "website.notice_freshness":
      return [one(null, guided(2, 5))];
    case "website.site_freshness":
      return [one(null, guided(5, 15))];
    default:
      return [one(null, guided(10, 20))];
  }
}

export interface WebsiteFixPlan {
  fixes: WebsiteFix[];
  /** Fixes the owner can do (guided, or done by PostScore and published by them). */
  selfCount: number;
  selfMinutes: { min: number; max: number };
  webPersonCount: number;
}

export function websiteFixPlan(checks: CheckResult[], builder: WebsiteBuilderId | null): WebsiteFixPlan {
  const fixes = checks.flatMap((c) => websiteFixesFor(c, builder));
  const self = fixes.filter((f) => f.kind !== "web_person");
  return {
    fixes,
    selfCount: self.length,
    selfMinutes: {
      min: self.reduce((sum, f) => sum + (f.minutes?.min ?? 0), 0),
      max: self.reduce((sum, f) => sum + (f.minutes?.max ?? 0), 0),
    },
    webPersonCount: fixes.length - self.length,
  };
}
