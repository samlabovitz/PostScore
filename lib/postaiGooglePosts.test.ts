import { describe, expect, test } from "vitest";
import { ASSISTANT_SYSTEM_RULES, gbpConnectionLine } from "./assistant";
import { featureMapFor, featureMapText } from "./postaiFeatureMap";
import { parseReplyLinks, resolveLinkTarget } from "./postaiLinks";
import { growthPlanHref } from "./routes";
import type { Plan } from "./plan";

// Bug (Nov 21): "take me to my Google posts" → PostAI said "Google Posts
// aren't synced yet — coming soon on Premium". Day 23E shipped them. PostAI
// must link to the posts card and never call posts (or the other 23C/23E
// features) coming soon or not built.

const BIZ = "e011e16d-9747-4608-ad1a-bd9475f004f6";
const ALL = { couponsOk: true, referralOk: true, pricingOk: true, hasWebsite: true };

/** Stale claims that posts, insights or the reviews inbox aren't live. */
const STALE = [
  /Google Posts tracking/i,
  /not built\/synced/i,
  /does NOT itself unlock anything/i,
  /posts? (aren't|are not|isn't) (synced|live|built)/i,
  /search insights are coming soon/i,
  /insights aren't live yet/i,
  /Seeing every review they haven't answered[^.]*coming soon/i,
  /photo itself is added directly on their Google listing, not inside PostScore/i,
];

describe("PostAI and Google posts", () => {
  test("a Google posts marker links to this week's post card (through the route helpers)", () => {
    expect(resolveLinkTarget("google.posts", BIZ)?.href).toBe(growthPlanHref(BIZ, { hash: "more-ways" }));
    expect(resolveLinkTarget("google.posts", BIZ)?.href).toBe(`/business/${BIZ}/growth#more-ways`);
    expect(resolveLinkTarget("google.answers", BIZ)?.href).toBe(`/business/${BIZ}/growth#more-ways`);
    const segments = parseReplyLinks("Your post for this week is ready. [[link:google.posts]]", BIZ);
    expect(segments.some((s) => s.kind === "link" && s.href.endsWith("/growth#more-ways"))).toBe(true);
  });

  test("the rules say posts and answers are live, where they are, and offer the link", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("BOTH ARE LIVE; never call them coming soon, not synced or not built");
    expect(ASSISTANT_SYSTEM_RULES).toContain('"More ways to bring people in" → "This week\'s Google post"');
    expect(ASSISTANT_SYSTEM_RULES).toContain("This week's Google post: [[link:google.posts]]");
  });

  test("no stale 'coming soon / not synced' claim anywhere in the rules, the connection line or any plan's feature map", () => {
    const texts = [
      ASSISTANT_SYSTEM_RULES,
      gbpConnectionLine({ connected: true, writesToGoogle: false }),
      gbpConnectionLine({ connected: true, writesToGoogle: true }),
      gbpConnectionLine({ connected: false, canConnect: true }),
      ...(["free", "grow", "premium", "multi"] as Plan[]).map((plan) => featureMapText(plan, featureMapFor(plan, ALL))),
    ];
    for (const text of texts) for (const re of STALE) expect(text).not.toMatch(re);
  });

  test("the feature map: posts are usable on Grow (drafts) and Premium (one click), locked on Free — never 'soon'", () => {
    const entry = (plan: Plan) => featureMapFor(plan, ALL).find((e) => e.id === "weeklyPost")!;
    expect(entry("free")).toMatchObject({ status: "locked", unlocks: "grow" });
    expect(entry("grow")).toMatchObject({ status: "usable", unlocks: "premium" });
    expect(entry("grow").note).toContain("drafts to copy");
    for (const plan of ["premium", "multi"] as Plan[]) {
      expect(entry(plan)).toMatchObject({ status: "usable", unlocks: null });
      expect(entry(plan).where).toContain("Approve all");
    }
  });

  test("Beta, not switched on for this listing: honest, but never 'not yet' / 'coming soon'", () => {
    const line = gbpConnectionLine({ connected: true, writesToGoogle: false });
    expect(line).toContain("a Premium feature in Beta, switched on listing by listing, and this listing isn't on yet");
    expect(line).toContain('never call it "coming soon"');
  });

  // Bug (Nov 21, localhost): "can PostScore post for me?" → "Not yet — coming soon on Premium".
  for (const question of ["can PostScore post for me?", "can you post on Google for me"]) {
    test(`"${question}": the rules answer it per plan — yes on Premium (Approve, Beta, Waiting for Google), drafts + steps on Grow, locked on Free`, () => {
      const rule = ASSISTANT_SYSTEM_RULES.slice(ASSISTANT_SYSTEM_RULES.indexOf("7h."), ASSISTANT_SYSTEM_RULES.indexOf("7g."));
      expect(rule).toContain('"CAN POSTSCORE POST FOR ME?" / "CAN YOU POST ON GOOGLE FOR ME?"');
      expect(rule).toContain("Premium / Multi: yes — PostScore writes this week's Google post");
      expect(rule).toContain('they tap Approve (or "Approve all"');
      expect(rule).toContain('"Waiting for Google"');
      expect(rule).toContain("Grow: PostScore writes the draft and shows the steps to post it themselves");
      expect(rule).toContain('"Premium does this for you in one click"');
      expect(rule).toContain("Free: it's a locked preview");
      expect(rule).toContain('never answer "not yet" or "coming soon" to the question itself');
      expect(rule).toContain("[[link:google.posts]]");
      // What made it say "coming soon": the review-reply items, now scoped.
      expect(rule).toContain("are about REVIEW REPLIES only, never about Google posts");
    });
  }

  test("the reply-posting items can't be read as Google posts", () => {
    for (const plan of ["free", "grow", "premium", "multi"] as Plan[]) {
      const replies = featureMapFor(plan, ALL).find((e) => e.id === "repliesPosted")!;
      expect(replies.name).toContain("about review replies only, not Google posts");
    }
    expect(ASSISTANT_SYSTEM_RULES).toContain("This paste-a-review drafter never posts to Google");
  });

  test("PostAI never has its own plan prices: every price comes from PLAN FACTS (the pricing page's strings)", () => {
    expect(ASSISTANT_SYSTEM_RULES).not.toMatch(/\$(25|30|40|50|58|150)\/mo|\+\$(8|15)\b/);
    expect(ASSISTANT_SYSTEM_RULES).toContain("{Premium's price, copied exactly from PLAN FACTS}");
  });
});
