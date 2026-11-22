import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "fs";

// Section 1 redesign pass: practice-mode actions never shown as results,
// old or rule-breaking saved post drafts redrafted, the spell check only on
// service names, the levers' short chip labels, step 2's service order,
// the hero's ⓘ above everything, and the Spanish FAQ hours.

vi.mock("server-only", () => ({}));

import { groupActions } from "@/lib/googleActions.server";
import { monthListingChanges, type ChangeRow } from "@/lib/googleProfileTab";
import { POST_DRAFT_RULES_SINCE, savedDraftUsable } from "@/lib/gbpPosts";
import { spellingFlags } from "@/lib/serviceSpelling";
import { leverShort } from "@/components/gbp/GoogleProfileTab";
import { serviceOrder } from "@/components/gbp/AnswersPreview";
import { hoursLines } from "@/lib/googleAnswers";
import type { Lever } from "@/lib/googleProfileTab";

// Day 25B step 2: the old tab is split into these files (the old tab composes them).
const GOOGLE_TAB_SOURCE = () => ["GoogleProfileTab", "googleTabParts", "GoogleResults", "GoogleListingPage"].map((f) => readFileSync(`components/gbp/${f}.tsx`, "utf8")).join("\n");

const TZ = "America/New_York";

describe("1. practice-mode actions never appear as results", () => {
  const changes: ChangeRow[] = [
    { batch_id: "p", kind: "profile_info_practice", field: "description", status: "sent", approved_at: "2026-11-20T15:00:00Z", origin: "answers" },
    { batch_id: "q", kind: "services", field: "serviceItems", status: "sent", approved_at: "2026-11-20T15:00:01Z", location_name: "locations/practice" },
    { batch_id: "r", kind: "attributes", field: "attributes", status: "sent", approved_at: "2026-11-20T15:00:02Z", practice: true },
    { batch_id: "s", kind: "local_post_practice", field: "post", status: "sent", approved_at: "2026-11-20T15:00:03Z" },
    { batch_id: "t", kind: "profile_info", field: "hours", status: "sent", approved_at: "2026-11-18T15:00:00Z" },
  ];
  test("chart markers and 'Since you did this': real only — even in practice mode", () => {
    const replies = [
      { action: "post", status: "practice", created_at: "2026-11-20T15:00:00Z" },
      { action: "post", status: "ok", created_at: "2026-11-19T15:00:00Z" },
    ];
    for (const practice of [false, true]) {
      expect(groupActions({ replies, changes, promos: [], referrals: [] }, { timeZone: TZ, practice })).toEqual([
        { date: "2026-11-18", kind: "listing", count: 1, what: ["hours"] },
        { date: "2026-11-19", kind: "replies", count: 1 },
      ]);
    }
  });
  test("'Last month you': real listing changes only", () => {
    expect(monthListingChanges(changes, "2026-11", TZ)).toEqual(["hours"]);
  });
  test("the recap's replies count real replies only (never practice)", () => {
    const src = readFileSync("lib/googleProfileTab.server.ts", "utf8");
    expect(src).toContain('r.action === "post" && (r.status === "ok" || r.status === "unconfirmed")');
    expect(src).not.toContain('r.status === "practice"');
  });
});

describe("2. saved post drafts: redrafted when older than the rules or breaking them", () => {
  const after = new Date(Date.parse(POST_DRAFT_RULES_SINCE) + 60_000).toISOString();
  test("the invented-story draft saved earlier is never shown again", () => {
    expect(savedDraftUsable({ kind: "week", created_at: "2026-11-20T15:00:00+00:00", text: "Thinking about a new color? Book online anytime." })).toBe(false);
    expect(savedDraftUsable({ kind: "week", created_at: after, text: "Just finished an amazing baylage transformation here at Hair Express! Our client absolutely loves the results." })).toBe(false);
    expect(savedDraftUsable({ kind: "week", created_at: after, text: "Thinking about a new color for the holidays? Our balayage and highlights can give you a fresh look. Book online anytime." })).toBe(true);
    // Written from the owner's own facts: a real story is fine.
    expect(savedDraftUsable({ kind: "another", created_at: after, text: "We just finished a balayage for a long-time client this Tuesday." })).toBe(true);
    expect(savedDraftUsable({ kind: "another", created_at: after, text: "Call 914-320-3012 today." })).toBe(false);
  });
});

describe("3. the spell check: service names only, never ordinary words", () => {
  test("'tones' is not a typo of 'toner'; running text flags only the business's own misspelled service names", () => {
    expect(spellingFlags("Warm tones for fall, glossy finishes and fresh trims.", { prose: true })).toEqual([]);
    expect(spellingFlags("Fresh color at Hair Express this week. Book a manicur.", { prose: true })).toEqual([]);
    expect(spellingFlags("Our baylage is back.", { prose: true, ownerTerms: ["baylage", "Haircut"] })).toEqual([{ word: "baylage", suggestion: "balayage" }]);
    // A list of service names is still checked.
    expect(spellingFlags("baylage · Haircut")).toEqual([{ word: "baylage", suggestion: "balayage" }]);
  });
});

describe("6. the levers' chips: short labels, the detail on tap", () => {
  const lever = (id: Lever["id"], status: string, params: Record<string, string | number> = {}): Lever => ({ id, status, params, tone: "warn", pill: "fixes", href: "#x" }) as unknown as Lever;
  test("EN and ES", () => {
    expect(leverShort(lever("reviews", "replied", { percent: 0 }), "en")).toBe("Reviews · 0%");
    expect(leverShort(lever("photos", "newest", { months: 2 }), "en")).toBe("Photos · 2 mo");
    expect(leverShort(lever("posts", "none"), "en")).toBe("Posts · none");
    expect(leverShort(lever("deals", "none"), "en")).toBe("Deals · none");
    expect(leverShort(lever("website", "score", { earned: 29, of: 30 }), "en")).toBe("Website · 29/30");
    expect(leverShort(lever("reviews", "replied", { percent: 0 }), "es")).toBe("Reseñas · 0 %");
    expect(leverShort(lever("deals", "running", { count: 1 }), "es")).toBe("Ofertas · 1");
  });
  test("one row at desktop width: chips never wrap their own words", () => {
    const src = GOOGLE_TAB_SOURCE();
    // 44px tap targets on phones; 32px chips on desktop.
    expect(src).toContain('"inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-[13px] text-ink lg:min-h-[32px] lg:px-3"');
  });
});

describe("7. step 2: services missing a price first (max 6), new ones on top", () => {
  test("the order and 'Show all'", () => {
    const listed = (name: string, price: number | null) => ({ name, listed: true, googlePrice: price });
    const services = [listed("Haircut", 40), ...["A", "B", "C", "D", "E", "F", "G"].map((n) => listed(n, null)), { name: "baylage", listed: false, googlePrice: null }];
    expect(serviceOrder(services, false).map((r) => r.s.name)).toEqual(["baylage", "A", "B", "C", "D", "E", "F"]);
    expect(serviceOrder(services, true).map((r) => r.s.name)).toEqual(["baylage", "A", "B", "C", "D", "E", "F", "G", "Haircut"]);
    expect(serviceOrder(services, false)[0].i).toBe(8);
  });
});

describe("desktop tightening: 36px secondary / 40px primary buttons, 44px on phones; rows a third shorter", () => {
  test("the buttons and rows", () => {
    const week = readFileSync("components/gbp/ThisWeekList.tsx", "utf8");
    expect(week).toMatch(/const ROW_BUTTON = "inline-flex min-h-\[44px\][^"]*lg:min-h-\[36px\]/);
    expect(week).toMatch(/const ROW_BUTTON_SOLID = "inline-flex min-h-\[44px\][^"]*lg:min-h-\[40px\]/);
    expect(week).toContain("lg:gap-2 lg:py-2.5");
    expect(week).toContain('<p className="text-[15px] font-medium leading-snug text-ink">{x.text}</p>');
    const post = readFileSync("components/gbp/PostPreview.tsx", "utf8");
    expect(post).toMatch(/export const W_BUTTON = "[^"]*min-h-\[44px\][^"]*lg:min-h-\[40px\]/);
    expect(post).toMatch(/export const W_BUTTON_SOFT = "[^"]*min-h-\[44px\][^"]*lg:min-h-\[36px\]/);
    const recs = readFileSync("components/gbp/GoogleRecs.tsx", "utf8");
    expect(recs).toMatch(/const BUTTON_OUTLINE = "[^"]*min-h-\[44px\][^"]*lg:min-h-\[36px\]/);
  });
});

describe("4, 5, 11. the hero's ⓘ, the 'so far' line, the 'Since' cards", () => {
  const src = GOOGLE_TAB_SOURCE();
  test("the ⓘ opens above, over everything (never under the dark card or over 'Updates on the 1st')", () => {
    expect(src).toContain('"absolute bottom-full z-50 mb-2');
  });
  test("'November so far' lines up with the tiles' text; a card with numbers gets the full width", () => {
    expect(src).toContain('<p className="px-4 text-[13px] leading-snug text-ink-soft lg:px-3.5" data-testid="google-tab-so-far">');
    expect(src).toContain('st.ready && "sm:col-span-2"');
  });
});

describe("the website FAQ's hours in the business's language", () => {
  test("Spanish day names and wording", () => {
    const week = [{ mode: "open", ranges: [{ open: 660, close: 960 }] }, { mode: "closed" }, { mode: "open", ranges: [{ open: 570, close: 1020 }] }, { mode: "closed" }, { mode: "closed" }, { mode: "closed" }, { mode: "open24" }] as never;
    expect(hoursLines(week, "es").slice(0, 2)).toEqual(["Lunes: cerrado", "Martes: 9:30 a.m. – 5:00 p.m."]);
    expect(hoursLines(week, "es")[5]).toBe("Sábado: abierto las 24 horas");
    expect(hoursLines(week, "en")[0]).toBe("Monday: Closed");
    expect(hoursLines(week, "es").join(" ")).not.toMatch(/Monday|Closed/);
  });
});
