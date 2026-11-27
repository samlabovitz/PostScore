// Day 25B polish, round 2: the Fix plan score card (Option A, zoomed to the gap), the reply checks for every
// draft (batch and inline alike), what the background batch drafts per plan, "Skip for now", Grow's inbox, the
// Beta label's switch, the Overview breakdown's compact rows and header, "I did this" expiring after 14 days,
// room for the floating "Ask PostAI" button, and no "Ready" pill beside the replies line.
import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1", useParams: () => ({ id: "b1" }) }));
vi.mock("@/app/actions/googleReviews", () => ({ changeGoogleReviewReply: vi.fn(), checkGoogleReview: vi.fn(), listGoogleReviews: vi.fn() }));
vi.mock("@/app/actions/reviewReplies", () => ({ draftReviewReply: vi.fn() }));
vi.mock("@/app/actions/approveAll", () => ({ getSavedReplies: vi.fn(), redraftWeekReply: vi.fn(), saveReplyDraft: vi.fn() }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { TopCard } from "@/components/fixPlan/FixPlanView";
import type { FixPlan } from "@/lib/fixPlan";
import { replyAcceptable, replyRejection, replyOpensWithHello, sharedPhrases, starOnlyReply, replyOpening, nameNotFirst } from "@/lib/reviewReplies";
import { draftTargets, draftingPlan, PLAN_BASED_DRAFTING } from "@/lib/replyBatch.server";
import { toInboxReview, type InboxReview } from "@/lib/gbpReviewInbox";
import { InboxBody, InboxPlanContext } from "@/components/reviews/GoogleReviewsInbox";
import { CategoryCard } from "@/components/scoring/CategoryCard";
import { ScoreBreakdownPanel } from "@/components/overview/ScoreBreakdownPanel";
import { markExpired, MARK_EXPIRES_DAYS, type TaskRow } from "@/lib/actionPlan";
import { GOOGLE_WRITES_FOR_EVERYONE } from "@/lib/googleWritesLaunch";

const wrap = (node: ReactNode, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

describe("1. Fix plan score card: Option A, the track zoomed from today's score to 100 · A", () => {
  const row = (when: "this_week" | "weeks" | "months", points: number, key: string) => ({ kind: "task", key, when, points, upTo: when === "months", priority: "high", running: 0, task: {} }) as never;
  // Hair Express: 78 now, +8.5 this week → 87, +4.7 a few weeks → 91, up to +8.5 months → 100.
  const plan: FixPlan = { rows: [row("this_week", 8.5, "a"), row("weeks", 4.7, "b"), row("months", 8.5, "c")], today: 78, thisWeek: 87, thisWeekCount: 3, thisWeekDone: false, next: null, speed: null };
  const card = (locale: Locale = "en") => wrap(<TopCard plan={plan} every={{ score: 100, grade: "A" }} lastScanAt="2026-11-23T15:00:00Z" />, locale);

  test("'78 → 87' big on top; one track whose segments fill the gap (78 → 100), in the groups' colors", () => {
    const html = card();
    expect(html).toContain('data-testid="fix-plan-this-week"');
    const left = (seg: string) => new RegExp(`data-segment="${seg}"[^>]*style="left:([^;]+);width:([^;]+);`).exec(html)?.slice(1);
    // The first segment starts at the track's left edge (today), the last one ends at its right edge (100).
    expect(left("this_week")?.[0]).toBe("0%");
    expect(left("weeks")?.[0]).toMatch(/^40\.9/); // (87 − 78) / 22
    expect(left("months")?.[0]).toMatch(/^59\.0/); // (91 − 78) / 22
    expect(left("months")?.[1]).toMatch(/^calc\(100% - 59\.0/);
    expect(html).toContain("#d9a443");
    // The same colors on the group headings below.
    expect(readFileSync("components/fixPlan/FixPlanView.tsx", "utf8")).toContain("data-dot={g.when}");
  });
  test("'78 now', '87 this week' at its stop, '100 · A every fix' at the track's end; no separate box (EN + ES)", () => {
    const en = text(card());
    expect(en).toContain("78 now");
    expect(en).toContain("87 this week");
    expect(en).toContain("100 · A every fix");
    expect(card()).not.toContain("rounded-xl border");
    const es = text(card("es"));
    expect(es).toContain("78 ahora");
    expect(es).toContain("87 esta semana");
    expect(es).toContain("100 · A todas las correcciones");
  });
});

describe("2. reply drafts: the same code checks for the batch and the inline drafter", () => {
  test("banned phrases, in any tense: never in a draft", () => {
    for (const bad of [
      "Thank you, Bo! Your trust means everything to me.",
      "Thank you, Bo! It means a lot to me.",
      "Thank you, Bo! Your words mean the world.",
      "Thank you, Bo! It meant a lot to me.",
      "Thank you, Bo! Your note means so much.",
      "Thank you, Bo! Your kind words mean more than you know.",
      "Thank you, Bo, for trusting me with your hair all these years.",
      "Thank you, Bo! I appreciate your trust with your curly hair.",
    ])
      expect(replyAcceptable(bad, "Bo"), bad).toBe(false);
    expect(replyAcceptable("¡Gracias, Ana! Significa mucho para mí.", "Ana", { locale: "es" })).toBe(false);
    expect(replyRejection("Thank you, Bo! It means everything.", "Bo")).toBe('it used "means everything"');
    expect(replyAcceptable("Thank you, Bo! I'm glad the color came out the way you wanted.", "Bo")).toBe(true);
  });
  test("no 'Hi Name,' (or Hello / Hola) as the opening", () => {
    for (const hello of ["Hi Margie, I'm so glad you love your cut.", "Hello Margie! Your cut looks great.", "Hola Ana, me alegra mucho."]) {
      expect(replyOpensWithHello(hello)).toBe(true);
      expect(replyAcceptable(hello, hello.includes("Ana") ? "Ana" : "Margie"), hello).toBe(false);
    }
    expect(replyOpensWithHello("Margie, hi to you too!")).toBe(false);
  });
  test("no shared 4-word phrase or opening with the replies around it", () => {
    const batch = [{ text: "Thank you, Ana! I look forward to seeing you again soon.", firstName: "Ana" }];
    expect(replyRejection("Bo, I look forward to seeing you again.", "Bo", { batch })).toBe('it repeats "i look forward to" from another reply');
    expect(replyRejection("Thank you, Bo! Your color is lovely.", "Bo", { batch })).toBe('another reply already opens with "thank you"');
    // "honored" and "made my day" once per 10 replies.
    expect(sharedPhrases("Bo, I'm honored.", [{ text: "Ana, what an honor.", firstName: "Ana" }], "Bo")).toEqual(["honored"]);
  });
  test("the name-only fallback is checked WITH the name (the gap that let 'Yadira, thank you' repeat 'Thank you, Christine')", () => {
    const batch = [{ text: "Thank you, Christine! Your cut held up.", firstName: "Christine" }];
    const reply = "Yadira, thank you for those kind words.";
    expect(replyOpening(reply, "Yadira")).toBe("thank you");
    expect(replyRejection(reply, "Yadira", { batch })).not.toBe(nameNotFirst("Yadira"));
    const draft = readFileSync("lib/reviewReplyDraft.server.ts", "utf8");
    expect(draft).toContain("problem === nameNotFirst(style.firstName)");
    expect(draft).not.toContain("replyAcceptable(reply, null");
  });
  test("star-only replies: several in a row never repeat a phrase, an opening or a word", () => {
    const kept: Array<{ text: string; firstName: string | null }> = [];
    for (const name of ["Katie", "Melissa", "Bari", "Ivannette", "Juno"]) {
      const r = starOnlyReply(name, 5, "en", kept);
      expect(sharedPhrases(r, kept, name), r).toEqual([]);
      expect(kept.some((k) => replyOpening(k.text, k.firstName) === replyOpening(r, name)), r).toBe(false);
      expect(replyAcceptable(r, name, { review: "[The reviewer left a star rating with no text.]", locale: "en", voice: "me" }), r).toBe(true);
      kept.push({ text: r, firstName: name });
    }
    expect(kept.map((k) => k.text).join(" ")).not.toMatch(/appreciated.*appreciate it/);
    expect(starOnlyReply("Ana", 5, "es")).toBe("¡Gracias por las 5 estrellas, Ana! Me alegró el día.");
    expect(readFileSync("lib/reviewReplies.ts", "utf8")).not.toContain("agradecida");
  });
  test("the batch: no draft rather than one that breaks a check; neighbours checked both ways; retries told the problem", () => {
    const batch = readFileSync("lib/replyBatch.server.ts", "utf8");
    expect(batch).not.toContain("repeats aside");
    expect(batch).toContain("reply = (await retry(0)) ?? (await retry(3)) ?? (await retry(6));");
    expect(batch).toContain("...list.slice(i + 1, i + WINDOW)");
    expect(batch).toContain('previous: n === 0 ? { text: first0, mode: "fix", problem } : null');
    expect(readFileSync("lib/reviewReplies.ts", "utf8")).toContain("Your last draft (between <current_draft> tags) broke a rule:");
  });
});

describe("2b. what the background batch drafts, per plan", () => {
  const day = (n: number) => new Date(Date.parse("2026-11-20T12:00:00Z") - n * 86_400_000).toISOString();
  const reviews = Array.from({ length: 29 }, (_, i) => toInboxReview({ reviewId: `r${i}`, reviewer: { displayName: `Person ${i}` }, starRating: "FIVE", comment: "Great", createTime: day(i) })!);
  const answered = toInboxReview({ reviewId: "done", reviewer: { displayName: "Z" }, starRating: "FIVE", comment: "Great", createTime: day(0), reviewReply: { comment: "Thanks" } })!;
  const all = [answered, ...reviews];
  test("Premium: every unanswered review, newest first", () => {
    const list = draftTargets(all, new Set(), "premium", new Set(), 0);
    expect(list).toHaveLength(29);
    expect(list[0].reviewId).toBe("r0");
    expect(draftTargets(all, new Set(["r0"]), "multi", new Set(), 0)).toHaveLength(28);
  });
  test("Grow: up to the week's allowance (newest first); already-drafted ones stay; never more than 10 pre-drafted", () => {
    expect(draftTargets(all, new Set(), "grow", new Set(), 10).map((r) => r.reviewId)).toEqual(Array.from({ length: 10 }, (_, i) => `r${i}`));
    expect(draftTargets(all, new Set(), "grow", new Set(), 3)).toHaveLength(3);
    // 4 drafted earlier this week, 2 left: those 4 plus the 2 newest without one.
    expect(draftTargets(all, new Set(), "grow", new Set(["r0", "r1", "r2", "r3"]), 2).map((r) => r.reviewId)).toEqual(["r0", "r1", "r2", "r3", "r4", "r5"]);
    // Premium's 29 drafts after a switch to Grow: the newest 10 stay.
    expect(draftTargets(all, new Set(), "grow", new Set(reviews.map((r) => r.reviewId)), 0)).toHaveLength(10);
  });
  test("Free: none (its own 3 a week, by hand)", () => {
    expect(draftTargets(all, new Set(), "free", new Set(), 10)).toEqual([]);
  });
  test("Grow's pre-drafts count against the week, like drafting by hand; Approve all and the Growth plan stay the newest 10", () => {
    const batch = readFileSync("lib/replyBatch.server.ts", "utf8");
    expect(batch).toContain('await admin.from("review_reply_drafts").insert(newGrow.map(');
    expect(batch).toContain("return { list: unanswered.slice(0, MAX_REPLIES)");
    expect(readFileSync("app/api/cron/reply-drafts/route.ts", "utf8")).toContain("const plan = draftingPlan(resolvePlan(process.env, null));");
  });
  test("until checkout exists: production drafts every connected business as Premium; locally the dev plan picks", () => {
    expect(PLAN_BASED_DRAFTING).toBe(false);
    expect(draftingPlan("free", { NODE_ENV: "production" })).toBe("premium");
    expect(draftingPlan("grow", { NODE_ENV: "production" })).toBe("premium");
    expect(draftingPlan("grow", { NODE_ENV: "development" })).toBe("grow");
    expect(readFileSync("CLAUDE.md", "utf8")).toContain("set `PLAN_BASED_DRAFTING = true` in `lib/replyBatch.server.ts`");
    expect(readFileSync("scripts/draft-replies.ts", "utf8")).toContain("--plan=grow|premium");
  });
});

describe("3. Reviews: 'Skip for now' on a pre-drafted reply; Grow's inbox; the Beta label's switch", () => {
  const review = (id: string): InboxReview => toInboxReview({ reviewId: id, reviewer: { displayName: `Ana ${id}` }, starRating: "FIVE", comment: "Great cut", createTime: "2026-11-20T12:00:00Z" })!;
  const saved = (id: string) => new Map([[id, { reviewId: id, reviewUpdated: null, reply: "Ana, thank you!", include: true, length: "medium" as const, failed: false }]]);
  const inbox = (opts: { grow?: boolean; drafted?: boolean; locale?: Locale } = {}) =>
    wrap(
      <InboxPlanContext.Provider value={{ grow: !!opts.grow, googleHref: "https://search.google.com/local/reviews?placeid=p1" }}>
        <InboxBody businessId="b1" reviews={[review("a")]} practice={false} canPost={!opts.grow} hasMore={false} saved={opts.drafted === false ? new Map() : saved("a")} onLoadAll={() => {}} onChanged={() => {}} />
      </InboxPlanContext.Provider>,
      opts.locale
    );
  test("pre-drafted: 'Skip for now' (EN + ES), never 'Cancel'; nothing drafted: the reply box with what happened", () => {
    expect(text(inbox())).toContain("Skip for now");
    expect(text(inbox())).not.toContain("Cancel");
    expect(text(inbox({ locale: "es" }))).toContain("Omitir por ahora");
    // Premium with no draft (failed or not written yet): the same reply box, never the old buttons.
    const none = inbox({ drafted: false });
    expect(none).toContain('data-testid="no-draft-box"');
    expect(none).not.toContain('data-testid="draft-google-reply"');
    expect(text(none)).toContain("No draft for this review yet. Draft it now or write your own.");
  });
  test("a draft that failed the checks: the same reply box, 'Couldn't write a draft that meets the rules' + Try again + Write my own (EN + ES)", () => {
    const failed = new Map([["a", { reviewId: "a", reviewUpdated: null, reply: null, include: false, length: "medium" as const, failed: true }]]);
    const html = (locale: Locale) =>
      wrap(
        <InboxPlanContext.Provider value={{ grow: false, googleHref: null }}>
          <InboxBody businessId="b1" reviews={[review("a")]} practice={false} canPost hasMore={false} saved={failed} onLoadAll={() => {}} onChanged={() => {}} />
        </InboxPlanContext.Provider>,
        locale
      );
    const en = html("en");
    expect(en).toContain('data-failed="true"');
    expect(text(en)).toContain("Couldn't write a draft that meets the rules. Try again or write your own.");
    expect(text(en)).toContain("Try again");
    expect(text(en)).toContain("Write my own");
    expect(en).not.toContain('data-testid="draft-google-reply"');
    expect(text(html("es"))).toContain("No se pudo escribir un borrador que cumpla las reglas.");
  });
  test("Grow: the draft to copy and post on Google, its steps, and the Premium lines; no Approve all", () => {
    const html = inbox({ grow: true });
    expect(html).toContain('data-testid="copy-reply"');
    expect(html).toContain('data-testid="reply-on-google"');
    expect(text(html)).toContain("1. Copy the reply. 2. Open your reviews on Google. 3. Paste it under this review and post.");
    expect(text(html)).toContain("Premium posts it for you in one click →");
    expect(html).not.toContain('data-testid="reply-include"');
    expect(html).not.toContain('data-testid="approve-reply"');
    // Not "changes to Google are off for this business": on Grow, posting is Premium.
    expect(html).not.toContain('data-testid="read-only-note"');
    expect(inbox()).not.toContain("Editing and deleting replies from PostScore is Premium");
    const none = text(inbox({ grow: true, drafted: false }));
    expect(none).toContain("Draft a reply");
    expect(none).toContain("Premium drafts all of them for you →");
    expect(text(inbox({ grow: true, drafted: false, locale: "es" }))).toContain("Premium las redacta todas por usted →");
  });
  test("Grow reads its reviews; posting stays Premium on the server", () => {
    const actions = readFileSync("app/actions/googleReviews.ts", "utf8");
    expect(actions).toContain("const t = await inboxTarget(businessId, { read: true });");
    expect(actions).toContain("canPost: isPremiumPlan(plan) && googleWritesAllowed(");
    expect(actions).toContain("const gate = await gbpEditGate(businessId, { requirePremium: !opts.read });");
  });
  test("'Beta' stays while GOOGLE_WRITES_FOR_EVERYONE is false, and every Beta label on a Google write follows it", () => {
    expect(GOOGLE_WRITES_FOR_EVERYONE).toBe(false);
    expect(inbox()).toContain('data-testid="beta-label"');
    for (const file of ["components/reviews/GoogleReviewsInbox.tsx", "components/gbp/googleEditBits.tsx", "components/gbp/PlatformLinkCard.tsx"]) {
      const src = readFileSync(file, "utf8");
      const labels = src.split('data-testid="beta-label"').length - 1;
      expect(labels, file).toBeGreaterThan(0);
      expect(src.split("{!GOOGLE_WRITES_FOR_EVERYONE && (").length - 1, file).toBe(labels);
    }
  });
});

describe("4. Overview breakdown: the header agrees with the counts; compact rows; 'not scored yet' on one line", () => {
  const SAME = "Your website says Thursday 9:30 AM–6:00 PM; Google says Thursday 9:30 AM–6:00 PM.";
  const c = (id: string, earned: number | null, max: number, explanation = `${id} explained`) => ({ id, label: id, earnedPoints: earned, maxPoints: max, confidence: "VERIFIED", explanation });
  test("a row losing points: title, points and one button on one line; it starts open with its description (Nov 27)", () => {
    const category = { id: "visibility", label: "Reviews", earnedPoints: 1, possiblePoints: 6, relativeScore: 20, weight: 40, checks: [c("visibility.review_replies", 0, 5), c("visibility.rating", 1, 1)] };
    const html = wrap(<CategoryCard category={category as never} embedded businessId="b1" />);
    const row = html.slice(html.indexOf('id="check-review_replies"'), html.indexOf('data-testid="passed-checks"'));
    expect(row).toContain('data-compact="true"');
    expect(row.match(/data-testid="fix-button"/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(row).toMatch(/data-testid="row-detail" data-open="true" class="flex-col gap-1.5 flex"/);
    expect(text(row)).toContain("visibility.review_replies explained");
  });
  test("'Not scored yet' rows: one muted line with their points", () => {
    const speed = { ...c("website.speed", null, 3, "We need one more speed test to be sure."), meta: { noScoreCause: "one_test" } };
    const category = { id: "website", label: "Website", earnedPoints: 1, possiblePoints: 4, relativeScore: 30, weight: 30, checks: [speed, c("website.https", 1, 1)] };
    const html = wrap(<CategoryCard category={category as never} embedded businessId="b1" />);
    expect(html).toContain('data-testid="not-scored-line"');
    expect(text(html)).toContain("Not scored yet: website.speed · — / 3");
    expect(html).not.toContain('data-compact="true"');
  });
  test("the header follows the hours row: waiting on Google or a re-scan, never 'Nothing left to fix here' beside '1 needs work'", () => {
    const category = { id: "website", label: "Website", weight: 30, possiblePoints: 1, earnedPoints: 0.5, relativeScore: 50, checks: [c("website.info_consistency", 0.5, 1, SAME)] };
    const panel = (state: unknown) => text(wrap(<ScoreBreakdownPanel businessId="b1" categories={[category] as never} hasWebsite scoreBasis={100} websiteFixCount={1} hoursCheck={state as never} />));
    const waiting = panel({ kind: "differs", days: [], profileAhead: true });
    expect(waiting).toContain("Waiting for Google: website.info_consistency");
    expect(waiting).not.toContain("Nothing left to fix here");
    expect(waiting).not.toMatch(/1 fix\b/);
    expect(panel({ kind: "stale" })).toContain("Changed since your last scan · re-scan to update");
    // Maps shows other hours: a real fix — the top issue and "1 fix".
    const differs = panel({ kind: "differs", days: [{ day: 4, website: { mode: "open", ranges: [{ open: 570, close: 1080 }] }, google: { mode: "open", ranges: [{ open: 600, close: 1020 }] } }], profileAhead: false });
    expect(differs).toContain("Top issue: website.info_consistency");
    expect(differs).toContain("1 fix");
    expect(panel(null)).toContain("Top issue: website.info_consistency");
  });
});

describe("5. 'I did this' expires after 14 days with no change on a scan (test rows and real owners alike)", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  const row = (extra: Partial<TaskRow> = {}): TaskRow => ({ id: "t", check_id: "completeness.photos", status: "pending_verification", promised_points: 2, marked_done_at: ago(20), verified_at: null, marked_metric_value: null, ...extra });
  test("marked 20 days ago, scanned since, still short: back to normal", () => {
    expect(MARK_EXPIRES_DAYS).toBe(14);
    expect(markExpired(row(), ago(1), now)).toBe(true);
  });
  test("kept: under 14 days, no scan since the mark, confirmed, or a review goal with new reviews (or unknown progress)", () => {
    expect(markExpired(row({ marked_done_at: ago(10) }), ago(1), now)).toBe(false);
    expect(markExpired(row(), ago(25), now)).toBe(false);
    expect(markExpired(row(), null, now)).toBe(false);
    expect(markExpired(row({ status: "completed" }), ago(1), now)).toBe(false);
    expect(markExpired(row({ marked_metric_value: -3, reviews_gained_since_mark: 1 }), ago(1), now)).toBe(false);
    expect(markExpired(row({ marked_metric_value: -3, reviews_gained_since_mark: null }), ago(1), now)).toBe(false);
    expect(markExpired(row({ marked_metric_value: -3, reviews_gained_since_mark: 0 }), ago(1), now)).toBe(true);
  });
  test("display only: the row stays (it's the Growth tier's record of 'I did this')", () => {
    expect(readFileSync("app/actions/actionPlan.ts", "utf8")).toContain("buildActionPlan(breakdown, suggestions, rows, input, locale, { lastScanAt })");
    expect(readFileSync("lib/actionPlan.ts", "utf8")).not.toMatch(/markExpired\([^)]*\)\) \{\s*\/\/ Removing/);
  });
});

describe("6–7. room for 'Ask PostAI'; no 'Ready' pill beside the replies line", () => {
  test("every page has bottom room under its last button", () => {
    expect(readFileSync("components/layout/DashboardShell.tsx", "utf8")).toContain('<main className="min-w-0 p-4 pb-40 sm:p-8 sm:pb-28 nav:ml-[250px] nav:p-10 nav:pb-28">');
  });
  test("the replies line says 'drafted and ready' itself", () => {
    expect(readFileSync("components/gbp/ThisWeekList.tsx", "utf8")).toContain('{!(line && state === "ready") && <Badge');
  });
});
