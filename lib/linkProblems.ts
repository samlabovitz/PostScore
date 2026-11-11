// Scoring 1.15.0 "No broken links or dead pages": the problem types, and
// the social-icon problems read from the scan's own social results. Pure,
// with no runtime imports — lib/scoring.ts reads it (lib/linkCheck.ts does
// the fetching).

import type { BrokenSocialLink, SocialProfile } from "@/lib/scoring";

/** What a link is for — order / book / contact are where a broken link is a dead end (Urgent). */
export type LinkKind = "order" | "book" | "contact" | "menu" | "directions" | "nav" | "social";
export const URGENT_LINK_KINDS: readonly LinkKind[] = ["order", "book", "contact"];

export type LinkProblemKind =
  | "not_found" // 404 / 410
  | "server_error" // 5xx
  | "page_not_found" // a "page not found" page answering 200
  | "parked" // a domain company's parking page
  | "coming_soon"
  | "loops_home" // lands on the business's own homepage instead
  | "dead_profile" // the social profile doesn't exist
  | "wrong_page" // the social link goes somewhere unrelated
  | "platform_home" // a social icon to the platform's front page, not a profile
  | "empty_link"; // a social icon with no link ("#", empty)

export interface LinkProblem {
  kind: LinkKind;
  /** The link's own words ("Order online"), or the platform for an icon ("YouTube"). */
  label: string;
  /** Where it points (as on the page). */
  url: string;
  problem: LinkProblemKind;
  status?: number;
  /** Social icons: the platform. */
  platform?: string;
}

/** Saved with the analysis: the homepage links this scan opened. */
export interface LinkCheckResult {
  checkedAt: string;
  /** Links opened (not counting social icons, whose results come from the social check). */
  checked: number;
  problems: LinkProblem[];
}

/** Social icon problems from the scan's own social results (no fetch). */
export function socialLinkProblems(profiles: SocialProfile[] | undefined, broken: BrokenSocialLink[] | undefined): LinkProblem[] {
  const out: LinkProblem[] = [];
  for (const p of profiles ?? []) {
    const r = p.check?.result;
    const problem: LinkProblemKind | null = r === "own_site" ? "loops_home" : r === "not_found" ? "dead_profile" : r === "elsewhere" ? "wrong_page" : null;
    if (problem) out.push({ kind: "social", label: p.platform, url: p.url, problem, platform: p.platform });
  }
  for (const b of broken ?? []) {
    const problem: LinkProblemKind = b.reason === "own_site" ? "loops_home" : b.reason === "no_link" ? "empty_link" : "platform_home";
    if (!out.some((o) => o.platform === b.platform)) out.push({ kind: "social", label: b.platform, url: b.href, problem, platform: b.platform });
  }
  return out;
}

/** Social icons on the page (each one a checked link). */
export function socialIconCount(profiles: SocialProfile[] | undefined, broken: BrokenSocialLink[] | undefined): number {
  return new Set([...(profiles ?? []).map((p) => p.platform), ...(broken ?? []).map((b) => b.platform)]).size;
}

/** A public http(s) web address: a real host name, never an IP address,
 * localhost or an internal name, never a user/password. */
export function isPublicWebUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".")) return false;
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith("[")) return false;
  if (/(^|\.)(localhost|local|internal|lan|home|corp|test|invalid|example|arpa)$/.test(host)) return false;
  return true;
}
