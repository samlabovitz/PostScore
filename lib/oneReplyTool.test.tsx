// Day 25B: one reply tool, one home. Drafts are written in the background and saved
// (lib/replyBatch.server.ts, supabase/review-reply-batch.sql); pages only read them.
import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
vi.mock("@/app/actions/approveAll", () => ({ draftWeekReplies: vi.fn(), redraftWeekReply: vi.fn(), saveReplyDraft: vi.fn() }));
vi.mock("@/app/actions/googleReviews", () => ({ changeGoogleReviewReply: vi.fn() }));
vi.mock("@/app/actions/reviewReplies", () => ({ getReplyVoice: vi.fn(() => Promise.resolve("me")), setReplyVoice: vi.fn() }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { RepliesLine, type WeekRepliesState } from "@/components/gbp/RepliesPreview";
import { replyTargets } from "@/lib/replyBatch.server";

const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const state = (n: number, ready: number, over: Partial<WeekRepliesState> = {}): WeekRepliesState =>
  ({ status: "ok", items: Array.from({ length: n }, (_, i) => ({ reviewId: `r${i}`, sent: "draft" })), ready: Array.from({ length: ready }, (_, i) => `r${i}`), canPost: true, practice: false, more: 0, ...over }) as never;
const line = (s: WeekRepliesState, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}><RepliesLine businessId="b1" state={s} /></LocaleProvider>);

describe("Growth plan + Google results: one line, one number", () => {
  test("'{n} replies drafted and ready · Review them →' to Reviews #reply-to-reviews; no list here", () => {
    const html = line(state(10, 10));
    expect(text(html)).toBe("10 replies drafted and ready · Review them →");
    expect(html).toContain('href="/business/b1/website-reviews#reply-to-reviews"');
    expect(text(line(state(1, 1)))).toBe("1 reply drafted and ready · Review them →");
    expect(text(line(state(10, 10), "es"))).toBe("10 respuestas redactadas y listas · Revíselas →");
    const list = readFileSync("components/gbp/ThisWeekList.tsx", "utf8");
    expect(list).toContain('const child = rec.kind === "replies" ? null');
    expect(list).not.toContain("<RepliesPreview");
  });
  test("some left out (failed drafts or unchecked): '8 of 10 ready', the same number Approve all sends", () => {
    expect(text(line(state(10, 8)))).toBe("8 of 10 replies ready · Review them →");
    expect(line(state(10, 8))).toContain('data-ready="8" data-total="10"');
    expect(text(line(state(10, 0)))).toBe("Drafts are being written · Review them →");
    // Before the drafts table exists: no claim at all, just the way to Reviews.
    expect(text(line(state(10, 0, { savedReady: false })))).toBe("Review them →");
  });
});

describe("drafts: written in the background, read by pages", () => {
  test("the newest unanswered reviews, at most 10; answered and waiting ones are left out", () => {
    const r = (id: string, day: number, reply = false) => ({ reviewId: id, reviewer: null, stars: 5, comment: "Great", createTime: `2026-11-${String(day).padStart(2, "0")}T00:00:00Z`, updateTime: null, reply: reply ? { comment: "Thanks", updateTime: null } : null });
    const reviews = [...Array.from({ length: 12 }, (_, i) => r(`n${i}`, i + 1)), r("done", 20, true), r("waiting", 21)];
    const t = replyTargets(reviews, new Set(["waiting"]));
    expect(t.list.map((x) => x.reviewId)).toEqual(["n11", "n10", "n9", "n8", "n7", "n6", "n5", "n4", "n3", "n2"]);
    expect(t.more).toBe(2);
  });
  test("triggers: the daily job, after a scan, after a voice change — never a page load", () => {
    expect(readFileSync("app/api/cron/reply-drafts/route.ts", "utf8")).toContain("writeReplyDrafts(admin, id)");
    expect(readFileSync("netlify/functions/reply-drafts-scheduler.mts", "utf8")).toContain('schedule: "0 10 * * *"');
    expect(readFileSync("app/actions/scoring.ts", "utf8")).toContain('(await import("@/lib/replyBatch.server")).writeReplyDraftsSoon(businessId);');
    expect(readFileSync("app/actions/reviewReplies.ts", "utf8")).toContain("writeReplyDraftsSoon(businessId)");
    const page = readFileSync("app/actions/approveAll.ts", "utf8");
    for (const fn of ["export async function draftWeekReplies", "export async function getSavedReplies"]) {
      const body = page.slice(page.indexOf(fn), page.indexOf("\n}\n", page.indexOf(fn)));
      expect(body, fn).not.toMatch(/writeReplyDrafts|draftReplyBatch|draftReplyText/);
    }
    expect(readFileSync("supabase/review-reply-batch.sql", "utf8")).toMatch(/never the review's text[\s\S]*notify pgrst, 'reload schema';\s*$/i);
  });
  test("the Reviews inbox is the home: the saved draft opens ready, with the tool's controls and 'Write my own'", () => {
    const inbox = readFileSync("components/reviews/GoogleReviewsInbox.tsx", "utf8");
    expect(inbox).toContain("getSavedReplies(businessId)");
    expect(inbox).toContain('fits ? { kind: "editing", text: saved!.reply!, action: "post" }');
    expect(inbox).toContain('data-testid="reply-include"');
    expect(inbox).toContain('data-testid="reply-write-own"');
    expect(inbox).toContain("redraftWeekReply(businessId, review.reviewId");
  });
});

describe("'Since you did this': its own 20 seconds", () => {
  test("a plain fetch (not queued behind the page's server actions); the timer starts when it's sent", () => {
    const src = readFileSync("components/gbp/GoogleResults.tsx", "utf8");
    expect(src).toContain("fetch(`/api/business/${businessId}/since?dates=${encodeURIComponent(readyKey)}`");
    expect(src).toContain("setTimeout(() => ctrl.abort(), 20_000)");
    expect(readFileSync("app/api/business/[id]/since/route.ts", "utf8")).toContain("loadSinceNumbers(params.id, dates)");
  });
});
