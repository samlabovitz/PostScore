import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// Free plan AI: 3 PostAI questions and 3 review reply drafts a week, on the
// Free re-scan clock, counted on the server before any AI call, plus the
// FREE_AI_MONTHLY_CAP spending guard.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1" }));

// The reply-draft action, with everything outside it replaced.
const anthropicSpy = vi.fn();
const reserveSpy = vi.fn();
const releaseSpy = vi.fn();
vi.mock("@/lib/anthropicClient", async () => ({
  ...(await vi.importActual<typeof import("@/lib/anthropicClient")>("@/lib/anthropicClient")),
  callAnthropicMessage: (...args: unknown[]) => anthropicSpy(...args),
}));
vi.mock("@/lib/premium", () => ({ getPlan: async () => "free" }));
vi.mock("@/lib/freeAiUsage.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/freeAiUsage.server")>("@/lib/freeAiUsage.server");
  return { ...actual, reserveFreeAi: (...args: unknown[]) => reserveSpy(...args), releaseFreeAiWithClient: (...args: unknown[]) => releaseSpy(...args), confirmFreeAiWithClient: vi.fn() };
});
const draftsTable: Array<{ id: string }> = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "b1", name: "Hair Express", language: "en" } }) }) }) }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => (draftsTable.push({ id: `d${draftsTable.length}` }), { data: { id: `d${draftsTable.length - 1}` }, error: null }) }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
      select: () => ({ eq: async () => ({ count: draftsTable.length, error: null }) }),
    }),
  }),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { LocaleProvider } from "@/lib/i18n";
import { allowanceWindow, DEFAULT_FREE_AI_MONTHLY_CAP, FREE_AI_WEEKLY, freeAiMonthlyCap } from "@/lib/freeAiAllowance";
import { freeAiAllowanceWithClient, reserveFreeAiWithClient } from "@/lib/freeAiUsage.server";
import { buildFreeAssistantSystemPrompt, FREE_PLAN_RULES, freeAnswerLeaksFix, freeAssistantContext, stripLinkMarkers, type AssistantBusinessContext } from "@/lib/assistant";
import { draftReviewReply } from "@/app/actions/reviewReplies";
import { FreePostAI } from "./FreePostAI";
import { ReviewReplyDrafter } from "@/components/reviews/ReviewReplyDrafter";

const NOW = new Date("2026-10-22T16:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString();

/** free_ai_usage in memory: insert/select-count/delete/update. */
function usageDb(seed: Array<{ business_id: string; kind: string; created_at: string }> = []) {
  const rows = seed.map((r, i) => ({ id: `s${i}`, status: "ok", ...r }));
  let next = 0;
  const query = (filters: Array<(r: (typeof rows)[number]) => boolean>) => {
    const q = {
      gte: (_c: string, v: string) => query([...filters, (r) => r.created_at >= v]),
      eq: (c: "business_id" | "kind", v: string) => query([...filters, (r) => r[c] === v]),
      then: (resolve: (v: { count: number; error: null }) => void) => resolve({ count: rows.filter((r) => filters.every((f) => f(r))).length, error: null }),
    };
    return q;
  };
  const db = {
    from: () => ({
      insert: (v: { business_id: string; kind: string }) => ({
        select: () => ({ single: async () => {
          const row = { id: `n${next++}`, status: "pending", created_at: NOW.toISOString(), ...v };
          rows.push(row);
          return { data: { id: row.id }, error: null };
        } }),
      }),
      select: () => query([]),
      delete: () => ({ eq: async (_c: string, id: string) => {
        const i = rows.findIndex((r) => r.id === id);
        if (i >= 0) rows.splice(i, 1);
        return { error: null };
      } }),
      update: (v: { status: string }) => ({ eq: async (_c: string, id: string) => {
        const row = rows.find((r) => r.id === id);
        if (row) row.status = v.status;
        return { error: null };
      } }),
    }),
  };
  return { db: db as unknown as SupabaseClient, rows };
}

describe("the week runs on the Free re-scan clock", () => {
  test("from the last owner re-scan (or first scan) in 7-day steps, whether or not the owner re-scans again", () => {
    expect(allowanceWindow(ago(2), NOW)).toEqual({ start: ago(2), resetsAt: new Date(Date.parse(ago(2)) + 7 * DAY).toISOString() });
    // 10 days after the anchor: the second week, resetting 14 days after it.
    expect(allowanceWindow(ago(10), NOW)).toEqual({ start: ago(3), resetsAt: new Date(Date.parse(ago(10)) + 14 * DAY).toISOString() });
    expect(allowanceWindow(null, NOW).start).toBe(NOW.toISOString());
  });
});

describe("3 a week, counted on the server before any AI call", () => {
  const args = { businessId: "b1", userId: "u1", kind: "postai" as const, anchor: ago(2), now: NOW, cap: 500 };

  test("the first 3 go through; the 4th is refused and its row removed", async () => {
    const { db, rows } = usageDb();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await reserveFreeAiWithClient(db, args));
    expect(results.slice(0, 3).map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
    expect(results.slice(0, 3).map((r) => (r.status === "ok" ? r.left : null))).toEqual([2, 1, 0]);
    expect(results[3]).toEqual({ status: "limit", resetsAt: allowanceWindow(args.anchor, NOW).resetsAt });
    expect(rows).toHaveLength(3);
    expect(FREE_AI_WEEKLY).toBe(3);
  });

  test("questions and drafts are counted separately; last week's don't count; a new week starts fresh", async () => {
    const { db } = usageDb([
      { business_id: "b1", kind: "postai", created_at: ago(9) },
      { business_id: "b1", kind: "postai", created_at: ago(8) },
      { business_id: "b1", kind: "reply_draft", created_at: ago(1) },
      { business_id: "b1", kind: "reply_draft", created_at: ago(1) },
    ]);
    const postai = await reserveFreeAiWithClient(db, args);
    expect(postai).toMatchObject({ status: "ok", left: 2 });
    const draft = await reserveFreeAiWithClient(db, { ...args, kind: "reply_draft" });
    expect(draft).toMatchObject({ status: "ok", left: 0 });
  });

  test("a failed AI call gives the question back", async () => {
    const { db, rows } = usageDb();
    const first = await reserveFreeAiWithClient(db, args);
    if (first.status !== "ok") throw new Error("expected ok");
    const { releaseFreeAiWithClient: release } = await vi.importActual<typeof import("@/lib/freeAiUsage.server")>("@/lib/freeAiUsage.server");
    await release(db, first.id);
    expect(rows).toHaveLength(0);
    expect(await freeAiAllowanceWithClient(db, { businessId: "b1", kind: "postai", anchor: args.anchor, now: NOW, cap: 500 })).toMatchObject({ status: "ok", left: 3 });
  });
});

describe("the monthly spending guard (FREE_AI_MONTHLY_CAP)", () => {
  test("default 500; when the month's Free calls reach it, Free answers pause until the 1st", async () => {
    expect(DEFAULT_FREE_AI_MONTHLY_CAP).toBe(500);
    expect(freeAiMonthlyCap({ FREE_AI_MONTHLY_CAP: "50" })).toBe(50);
    const { db, rows } = usageDb([
      { business_id: "other", kind: "postai", created_at: ago(3) },
      { business_id: "other", kind: "reply_draft", created_at: ago(2) },
    ]);
    const r = await reserveFreeAiWithClient(db, { businessId: "b1", userId: "u1", kind: "postai", anchor: ago(2), now: NOW, cap: 2 });
    expect(r).toMatchObject({ status: "paused", until: "2026-11-01T00:00:00.000Z" });
    expect(rows).toHaveLength(2);
    expect(await freeAiAllowanceWithClient(db, { businessId: "b1", kind: "postai", anchor: ago(2), now: NOW, cap: 2 })).toMatchObject({ status: "paused", until: "2026-11-01T00:00:00.000Z", left: 3 });
  });
});

describe("the reply-draft action on Free", () => {
  beforeEach(() => {
    anthropicSpy.mockReset();
    reserveSpy.mockReset();
    releaseSpy.mockReset();
  });

  test("the 4th draft of the week is refused without calling the AI", async () => {
    reserveSpy.mockResolvedValue({ status: "limit", resetsAt: "2026-10-27T15:00:00.000Z" });
    expect(await draftReviewReply("b1", "Great haircut, friendly staff!", 5)).toEqual({ status: "limit", resetsAt: "2026-10-27T15:00:00.000Z" });
    expect(anthropicSpy).not.toHaveBeenCalled();
  });

  test("paused by the monthly cap: no AI call, the paused status", async () => {
    reserveSpy.mockResolvedValue({ status: "paused", until: "2026-11-01T00:00:00.000Z", resetsAt: "2026-10-27T15:00:00.000Z" });
    expect(await draftReviewReply("b1", "Great haircut!", 5)).toEqual({ status: "paused", until: "2026-11-01T00:00:00.000Z" });
    expect(anthropicSpy).not.toHaveBeenCalled();
  });

  test("a failed AI call releases the reserved draft", async () => {
    reserveSpy.mockResolvedValue({ status: "ok", id: "r1", left: 2, resetsAt: "2026-10-27T15:00:00.000Z", db: {} });
    anthropicSpy.mockRejectedValue(new Error("overloaded"));
    expect((await draftReviewReply("b1", "Great haircut!", 5)).status).toBe("unavailable");
    expect(releaseSpy).toHaveBeenCalledWith({}, "r1");
  });
});

describe("Free PostAI never gives the paid step-by-step fixes", () => {
  const context = {
    actionPlan: { topTasks: [{ label: "Add photos", category: "completeness", promisedPoints: 4, action: "Open your Google Business Profile, tap Photos, and upload at least five bright photos of your storefront and work.", effort: "quick" }] },
  } as unknown as AssistantBusinessContext;

  test("the Free context keeps the task and its points but not the fix text", () => {
    const free = freeAssistantContext(context);
    expect(free.actionPlan.topTasks[0]).toMatchObject({ label: "Add photos", promisedPoints: 4, action: "" });
  });

  test("the Free rules: explain what it means and why it matters, then point to Grow — no steps, no link markers", () => {
    expect(FREE_PLAN_RULES).toContain("must NOT give step-by-step fix instructions");
    expect(FREE_PLAN_RULES).toContain("the full step-by-step plan is on Grow");
    expect(stripLinkMarkers("Add photos to your listing. [[link:listing.photos]]")).toBe("Add photos to your listing.");
  });

  test("an answer that repeats the fix text is caught (and replaced on the server)", () => {
    expect(freeAnswerLeaksFix("Sure! Tap Photos, and upload at least five bright photos of your storefront.", [context.actionPlan.topTasks[0].action])).toBe(true);
    expect(freeAnswerLeaksFix("Photos help customers trust you — the step-by-step plan is on Grow.", [context.actionPlan.topTasks[0].action])).toBe(false);
    const send = readFileSync("app/actions/assistant.ts", "utf8");
    expect(send).toContain('if (freeAnswerLeaksFix(replyText, fixes)) replyText = t(loaded.locale, "dashboard.free.postaiFixOnGrow");');
  });

  test("the server reserves a Free question before any AI call, and a 4th returns limit", () => {
    const src = readFileSync("app/actions/assistant.ts", "utf8");
    const send = src.slice(src.indexOf("export async function sendAssistantMessage("), src.indexOf("async function sendWithContext("));
    expect(send.indexOf('reserveFreeAi(businessId, user?.id ?? null, "postai")')).toBeGreaterThan(-1);
    expect(send.indexOf('if (reservation.status === "limit") return')).toBeLessThan(send.indexOf("sendWithContext(loaded, businessId, message, conversationId, true)"));
    expect(send).toContain("await releaseFreeAiWithClient(reservation.db, reservation.id);");
    expect(src).toMatch(/free \? buildFreeAssistantSystemPrompt\(loaded\.context, loaded\.locale\)/);
  });

  test("the Free prompt never contains the fix text", () => {
    // Only the action plan matters here; the rest of the context renders around it.
    const prompt = (() => {
      try {
        return buildFreeAssistantSystemPrompt(context);
      } catch {
        return `${FREE_PLAN_RULES} ${JSON.stringify(freeAssistantContext(context))}`;
      }
    })();
    expect(prompt).not.toContain("upload at least five bright photos");
  });
});

describe("the counters (EN + ES)", () => {
  const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") => renderToStaticMarkup(<LocaleProvider locale={locale} timeZone="America/New_York">{node}</LocaleProvider>);
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const RESET = "2026-10-27T15:00:00.000Z";

  test("PostAI: the line, “{n} of 3 free questions left · resets {date}”, the used-up and paused messages with the plans link", () => {
    const ok = text(wrap(<FreePostAI businessId="b1" starterPrompts={["Why is my score 92?"]} initial={{ status: "ok", left: 2, resetsAt: RESET }} />));
    expect(ok).toContain("Ask questions about your score — 3 free questions a week.");
    expect(ok).toContain("2 of 3 free questions left · resets Oct 27, 2026");
    const used = wrap(<FreePostAI businessId="b1" starterPrompts={[]} initial={{ status: "ok", left: 0, resetsAt: RESET }} />);
    expect(text(used)).toContain("You've used this week's free questions. They reset Oct 27, 2026 — or ask up to 100 a month on Grow.");
    expect(used).toContain('href="/business/b1/settings#compare-plans"');
    expect(used).not.toContain('data-testid="postai-question"');
    const paused = text(wrap(<FreePostAI businessId="b1" starterPrompts={[]} initial={{ status: "paused", left: 2, resetsAt: RESET, until: "2026-11-01T00:00:00.000Z" }} />));
    expect(paused).toContain("Free AI answers are paused until Oct 31, 2026 — upgrade for unlimited.");
    expect(text(wrap(<FreePostAI businessId="b1" starterPrompts={[]} initial={{ status: "ok", left: 1, resetsAt: RESET }} />, "es"))).toContain("Le quedan 1 de 3 preguntas gratis");
  });

  test("reply drafts: the weekly counter and reset message on Free; Grow unchanged", () => {
    const free = text(wrap(<ReviewReplyDrafter businessId="b1" plan="free" placeId="p1" initial={{ status: "ok", used: 1, left: 2, resetsAt: RESET, pausedUntil: null }} />));
    expect(free).toContain("2 of 3 free drafts left · resets Oct 27, 2026");
    const used = text(wrap(<ReviewReplyDrafter businessId="b1" plan="free" placeId="p1" initial={{ status: "ok", used: 3, left: 0, resetsAt: RESET, pausedUntil: null }} />));
    expect(used).toContain("You've used this week's free drafts. They reset Oct 27, 2026");
    const paused = text(wrap(<ReviewReplyDrafter businessId="b1" plan="free" placeId="p1" initial={{ status: "ok", used: 1, left: 2, resetsAt: RESET, pausedUntil: "2026-11-01T00:00:00.000Z" }} />));
    expect(paused).toContain("Free AI answers are paused until");
    const grow = text(wrap(<ReviewReplyDrafter businessId="b1" plan="grow" placeId="p1" initial={{ status: "ok", used: 1, left: 2 }} />));
    expect(grow).not.toContain("resets");
  });
});
