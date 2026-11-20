import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/actions/gbpCustomerDetails", () => ({ applyCustomerDetailsAction: vi.fn(), loadCustomerDetailsEditorAction: vi.fn(), undoCustomerDetailsAction: vi.fn() }));
vi.mock("@/app/actions/gbpWebsiteLink", () => ({ openWebsiteLinkFix: vi.fn(), applyWebsiteLinkFix: vi.fn(), undoWebsiteLinkFix: vi.fn() }));
vi.mock("@/app/actions/gbpInsights", () => ({ syncGoogleNumbers: vi.fn(async () => ({ status: "busy" })) }));
vi.mock("@/app/actions/gbpProfileEdits", () => ({ openProfileEdits: vi.fn(), applyProfileEditAction: vi.fn(), undoProfileEditAction: vi.fn() }));
import { LocaleProvider, t, type Locale } from "@/lib/i18n";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { GoogleProfileTab, leverText, recapSentence, rowText, type GoogleProfileTabProps } from "@/components/gbp/GoogleProfileTab";
import { segmentFromParam } from "@/app/business/[id]/growth/GrowthView";
import { fixFlowHref } from "@/lib/fixFlows";
import type { CheckResult } from "@/lib/scoring";
import {
  changedByOthers,
  compactHours,
  conversionRate,
  editorFromHash,
  formatRate,
  activeJumpSection,
  isGoogleTabParam,
  sampleIdeas,
  JUMP_LINE_SLACK,
  jumpIdFromHash,
  levers,
  listingCounts,
  listingGroups,
  madeFromPostScore,
  madeValue,
  type ListingExtras,
  SAMPLE_INSIGHTS,
  watchedChanges,
  monthListingChanges,
  monthRecap,
  nextMonthlyUpdate,
  previousMonthKey,
  syncedAgo,
  type ChangeRow,
  type Lever,
} from "./googleProfileTab";

// Day 22B step 1: the Growth page's Google Profile tab. Real data where
// PostScore stores it; the conversion rate, insights and searches stay
// empty until the first monthly Google report (step 2) — sample numbers
// only in practice mode; one card when Google isn't connected.

const render = (props: Partial<GoogleProfileTabProps> = {}, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      <GbpEditProvider value={{ premium: true, connected: props.connected ?? true, undo: null, canEdit: true, practice: props.practice ?? false }}>
        <GoogleProfileTab {...BASE} {...props} />
      </GbpEditProvider>
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

const check = (id: string, earned: number | null, max = 4): CheckResult => ({ id, label: id, category: "completeness", maxPoints: max, earnedPoints: earned, confidence: "VERIFIED", explanation: `${id} explanation` }) as unknown as CheckResult;

const BASE: GoogleProfileTabProps = {
  businessId: "b1",
  connected: true,
  practice: false,
  needsReconnect: false,
  canStart: true,
  result: null,
  business: { name: "Hair express on Broadway", address: "9 S Broadway, Tarrytown, NY 10591, USA" },
  listing: { rating: 5, reviewCount: 30, photoCount: 12, phone: "(914) 320-3012", website: "https://www.hairexpressonbroadway.com/", category: "Hair salon", openingHours: ["Monday: Closed", "Tuesday: 9:30 AM – 5:00 PM", "Wednesday: 9:30 AM – 6:00 PM", "Thursday: 9:30 AM – 6:00 PM"], googleMapsUri: "https://maps.google.com/?cid=1" },
  checks: [check("completeness.phone", 4), check("completeness.website_link", 4), check("completeness.hours", 2), check("completeness.categories", 4), check("completeness.customer_details", 0), check("completeness.photos", 4), check("visibility.review_replies", 0, 6)],
  website: { earned: 28, of: 30, fixes: 1 },
  replyCounts: { reviewsInWindow: 20, replied: 0, templatedShare: 0, hasRecentReview: true, allTimeReviews: 30, allTimeReplied: 0, allTimeCapped: false, checkedAt: "2026-11-14T10:00:00Z" },
  messagingOn: false,
  saved: { couponsRunning: 0, lastMonth: "2026-10", recap: { did: [{ key: "listing.customer_details" }, { key: "listing.website_link" }], notYet: ["replies", "campaign"] }, made: [], others: { fields: [], since: "2026-11-01T00:00:00Z" }, businessStatus: "OPERATIONAL" },
  lastScanAt: "2026-11-14T10:00:00Z",
};

describe("the conversion rate", () => {
  test("customer actions ÷ people who saw the listing, one decimal", () => {
    expect(conversionRate(83, 704)).toBe(11.8);
    expect(conversionRate(1, 3)).toBe(33.3);
    expect(conversionRate(0, 50)).toBe(0);
    expect(formatRate(11.8, "en")).toBe("11.8%");
    expect(formatRate(11.8, "es")).toBe("11,8 %");
  });

  test("nobody saw the listing → no rate, never a divide by zero", () => {
    expect(conversionRate(0, 0)).toBeNull();
    expect(conversionRate(5, 0)).toBeNull();
    expect(conversionRate(-1, 10)).toBeNull();
    expect(conversionRate(Number.NaN, 10)).toBeNull();
  });

  test("updates on the 1st: the next 1st in the business's time zone", () => {
    expect(nextMonthlyUpdate(new Date("2026-11-14T12:00:00Z"), "America/New_York").slice(0, 10)).toBe("2026-12-01");
    expect(nextMonthlyUpdate(new Date("2026-12-31T12:00:00Z"), "America/New_York").slice(0, 10)).toBe("2027-01-01");
    // Still Nov 30 in New York at 03:00 UTC Dec 1.
    expect(nextMonthlyUpdate(new Date("2026-12-01T03:00:00Z"), "America/New_York").slice(0, 10)).toBe("2026-12-01");
    expect(previousMonthKey(new Date("2026-01-10T12:00:00Z"), "America/New_York")).toBe("2025-12");
  });
});

describe("the five levers: status and pill", () => {
  const base = { businessId: "b1", replies: null, couponsRunning: 0, website: null };
  const one = (over: Partial<Parameters<typeof levers>[0]>, id: Lever["id"]) => levers({ ...base, ...over }).find((l) => l.id === id)!;
  const words = (l: Lever, locale: Locale = "en") => leverText(l, locale);

  test("five, in order, and no social media", () => {
    expect(levers(base).map((l) => l.id)).toEqual(["reviews", "photos", "posts", "deals", "website"]);
  });

  test("Reviews: “{X}% replied”, amber Reply under 80%, green Done at 80%+", () => {
    const low = one({ replies: { replied: 15, inWindow: 20 } }, "reviews");
    expect([words(low).status, words(low).pill, low.tone]).toEqual(["75% replied", "Reply", "warn"]);
    const at80 = one({ replies: { replied: 16, inWindow: 20 } }, "reviews");
    expect([words(at80).status, words(at80).pill, at80.tone]).toEqual(["80% replied", "Done", "ok"]);
    expect(one({ replies: null }, "reviews").tone).toBe("neutral");
    expect(words(one({ replies: { replied: 0, inWindow: 20 } }, "reviews"), "es")).toEqual({ status: "0 % respondidas", pill: "Responder" });
    expect(one({}, "reviews").href).toBe("/business/b1/website-reviews#google-reviews");
  });

  test("Photos and Google posts: a neutral pill until the first read from Google", () => {
    for (const id of ["photos", "posts"] as const) {
      const l = one({}, id);
      expect([words(l).status, words(l).pill, l.tone]).toEqual(["coming soon", "Soon", "neutral"]);
    }
    expect(one({}, "photos").href).toBe("#edit-photos");
  });

  test("Deals: red Start with no coupon running, green with one", () => {
    const none = one({ couponsRunning: 0 }, "deals");
    expect([words(none).status, words(none).pill, none.tone]).toEqual(["no coupon running", "Start", "bad"]);
    expect(words(one({ couponsRunning: 1 }, "deals")).status).toBe("1 running");
    const two = one({ couponsRunning: 2 }, "deals");
    expect([words(two).status, words(two).pill, two.tone]).toEqual(["2 running", "Running", "ok"]);
    expect(none.href).toBe("/business/b1/campaigns?tab=coupons");
  });

  test("Website: “{score} / 30”, “{N} fix”, green from 27", () => {
    const good = one({ website: { earned: 28, of: 30, fixes: 1 } }, "website");
    expect([words(good).status, words(good).pill, good.tone]).toEqual(["28 / 30", "1 fix", "ok"]);
    const low = one({ website: { earned: 22.4, of: 30, fixes: 3 } }, "website");
    expect([words(low).status, words(low).pill, low.tone]).toEqual(["22 / 30", "3 fixes", "warn"]);
    expect(words(one({ website: { earned: 30, of: 30, fixes: 0 } }, "website")).pill).toBe("Done");
    const none = one({ website: null }, "website");
    expect([words(none).status, none.tone]).toEqual(["no website", "bad"]);
  });
});

describe("“Last month you: … Not yet: …” from the real logs", () => {
  const row = (over: Partial<ChangeRow>): ChangeRow => ({ batch_id: Math.random().toString(), kind: "profile_info", field: "hours", status: "sent", approved_at: "2026-10-10T15:00:00Z", undone_at: null, undo_closed_at: null, undo_of: null, ...over });
  test("only changes that went through, last month, each once; practice rows only in practice mode", () => {
    const rows = [
      row({}),
      row({ approved_at: "2026-10-12T15:00:00Z" }),
      row({ kind: "attributes", field: "attributes" }),
      row({ kind: "website_uri", field: "website_uri", status: "failed" }),
      row({ kind: "profile_info", field: "phone", undone_at: "2026-10-13T00:00:00Z" }),
      row({ kind: "profile_info", field: "description", approved_at: "2026-11-02T15:00:00Z" }),
      row({ kind: "profile_info_practice", field: "phone" }),
    ];
    expect(monthListingChanges(rows, "2026-10", "America/New_York", false)).toEqual(["hours", "customer_details"]);
    expect(monthListingChanges(rows, "2026-10", "America/New_York", true)).toEqual(["phone"]);
  });

  test("the sentence (EN + ES), with what's not done yet", () => {
    const recap = monthRecap({ listing: ["customer_details", "website_link"], replies: 0, campaigns: 0 });
    const saved = { ...BASE.saved!, recap };
    expect(recapSentence(saved, "en")).toEqual({ did: "added customer details · fixed your website link", notYet: "review replies, a coupon or referral card" });
    expect(recapSentence({ ...saved, recap: monthRecap({ listing: [], replies: 1, campaigns: 2 }) }, "es")).toEqual({ did: "respondió 1 reseña · empezó 2 campañas", notYet: "una actualización de su ficha" });
    expect(recapSentence({ ...saved, recap: monthRecap({ listing: [], replies: 0, campaigns: 0 }) }, "en").did).toBe("nothing from PostScore yet");
  });
});

describe("Protection & changes", () => {
  const row = (over: Partial<ChangeRow>): ChangeRow => ({ batch_id: "a", kind: "website_uri", field: "website_uri", status: "sent", approved_at: "2026-11-12T12:00:00Z", undone_at: null, undo_closed_at: null, undo_of: null, ...over });
  const now = Date.parse("2026-11-14T12:00:00Z");
  test("Made from PostScore: Live / Undo · N days left / Google reviewing / Undone / Didn't go through", () => {
    const made = madeFromPostScore(
      [
        row({ batch_id: "1" }),
        row({ batch_id: "2", kind: "attributes", field: "parking", approved_at: "2026-10-20T12:00:00Z" }),
        row({ batch_id: "3", kind: "profile_info", field: "description", status: "pending_review", approved_at: "2026-11-13T12:00:00Z" }),
        row({ batch_id: "4", kind: "profile_info", field: "hours", approved_at: "2026-11-10T12:00:00Z", undone_at: "2026-11-11T12:00:00Z" }),
        row({ batch_id: "5", kind: "order_link", field: "order_link", status: "failed", approved_at: "2026-11-09T12:00:00Z" }),
        row({ batch_id: "6", undo_of: "4", approved_at: "2026-11-11T12:00:00Z" }),
        row({ batch_id: "7", kind: "website_uri_practice" }),
      ],
      now,
      false
    );
    expect(made.map((m) => [m.kind, m.status, m.daysLeft])).toEqual([
      ["description", "reviewing", 6],
      ["website_link", "undo", 5],
      ["hours", "undone", 3],
      ["booking_link", "failed", 2],
      ["customer_details", "live", 0],
    ]);
  });

  test("changes by anyone else leave out what PostScore changed between the two scans", () => {
    expect(changedByOthers(["phone", "website"], [row({ approved_at: "2026-11-05T00:00:00Z" })], "2026-11-01T00:00:00Z", "2026-11-08T00:00:00Z")).toEqual(["phone"]);
    expect(changedByOthers(["website"], [row({ approved_at: "2026-10-05T00:00:00Z" })], "2026-11-01T00:00:00Z", "2026-11-08T00:00:00Z")).toEqual(["website"]);
  });

  test("the cards: old → new values with the date, Open · Verified, PostScore's changes with Undo", () => {
    const html = text(
      render({
        canEditGoogle: true,
        extras: { specialPeriods: [], services: [], categories: [], verified: true },
        saved: {
          ...BASE.saved!,
          others: { fields: ["phone", "name"], since: "2026-11-01T00:00:00Z", at: "2026-11-08T12:00:00Z", changes: [{ field: "phone", from: "(914) 320-3012", to: "(914) 555-0100" }, { field: "name", from: "Hair express", to: "Hair Express Salon" }] },
          made: [{ kind: "website_link", status: "undo", daysLeft: 5, at: "2026-11-12T12:00:00Z", batchId: "b", value: { text: "https://hairexpress.example" } }],
        },
      })
    );
    expect(html).toContain("Name, phone, address, hours, website");
    expect(html).toContain("Phone: “(914) 320-3012” → “(914) 555-0100” · Nov 8");
    expect(html).toContain("Name: “Hair express” → “Hair Express Salon”");
    expect(html).toContain("Open · Verified");
    expect(html).toContain("Website link : https://hairexpress.example");
    expect(html).toContain("Undo · 5 days left");
    expect(render({ canEditGoogle: true, saved: { ...BASE.saved!, made: [{ kind: "website_link", status: "undo", daysLeft: 5, at: "2026-11-12T12:00:00Z", batchId: "b" }] } })).toContain('data-testid="made-undo"');
    // Read-only: the status, no Undo button.
    expect(render({ saved: { ...BASE.saved!, made: [{ kind: "website_link", status: "undo", daysLeft: 5, at: "2026-11-12T12:00:00Z", batchId: "b" }] } })).not.toContain('data-testid="made-undo"');
    expect(text(render())).toContain("Unchanged ✓");
    expect(text(render())).toContain("No changes made from PostScore yet.");
  });

  test("Suggested edits Google accepted: None ✓, or each change with Keep / Change it back, and the red banner", () => {
    const none = text(render({ saved: { ...BASE.saved!, googleEdits: { available: true, open: [], checkedAt: "2026-11-15T12:00:00Z" } } }));
    expect(none).toContain("Suggested edits Google accepted None ✓");
    expect(none).toContain("Last checked");
    expect(none).toContain("Check now");
    expect(none.slice(none.indexOf("6 Protection & changes"))).not.toContain("Coming soon");
    const edit = { id: "e1", field: "phone" as const, owner_value: "(914) 320-3012", google_value: "(914) 555-0100", detected_at: "2026-11-14T12:00:00Z", resolved_at: null, resolution: null };
    const html = render({ saved: { ...BASE.saved!, googleEdits: { available: true, open: [edit], checkedAt: "2026-11-15T12:00:00Z" } } });
    expect(text(html)).toContain("Google changed your phone. Which is right?");
    expect(html).toContain('data-testid="version-google"');
    expect(html).toContain('data-testid="version-mine"');
    expect(text(html)).toContain("Keep Google's version");
    expect(text(html)).toContain("Keep your version");
    // Never "Unchanged" while a change is listed above.
    expect(text(html)).toContain("1 changed: phone");
    expect(text(html)).not.toContain("Unchanged ✓");
    expect(html).toContain('data-testid="google-edits-banner"');
    expect(text(html)).toContain("Your phone number was changed on Google (Nov 14).");
    // Before supabase/gbp-step3b.sql: no Check now, no guess.
    expect(text(render({ saved: { ...BASE.saved!, googleEdits: { available: false, open: [], checkedAt: null } } }))).toContain("After the next check");
  });

  test("Made from PostScore: the last 10, then Show all changes", () => {
    const made = Array.from({ length: 12 }, (_, i) => ({ kind: "phone" as const, status: "live" as const, daysLeft: 0, at: `2026-10-${String(10 + i).padStart(2, "0")}T12:00:00Z`, batchId: `b${i}` }));
    const html = render({ saved: { ...BASE.saved!, made } });
    expect(html.match(/data-testid="made-row"/g)).toHaveLength(10);
    expect(text(html)).toContain("Show all changes (12)");
  });

  test("short values: services added, holiday dates set, text clipped; none for hours", () => {
    const svc = (n: string) => ({ freeFormServiceItem: { label: { displayName: n } } });
    expect(madeValue("services", JSON.stringify([svc("Cut")]), JSON.stringify([svc("Cut"), svc("Balayage")]))).toEqual({ added: ["Balayage"] });
    expect(madeValue("holiday_hours", "[]", JSON.stringify([{ startDate: { year: 2026, month: 11, day: 26 }, closed: true }]))).toEqual({ dates: [{ date: "2026-11-26", closed: true, open: null, close: null }] });
    expect(madeValue("phone", null, "(914) 320-3012")).toEqual({ text: "(914) 320-3012" });
    expect(madeValue("hours", null, JSON.stringify({ mon: [] }))).toBeNull();
    expect(madeFromPostScore([row({ batch_id: "s", kind: "special_hours", field: "specialHours", before_value: "[]", after_value: JSON.stringify([{ startDate: { year: 2026, month: 11, day: 26 }, closed: true }]) })], now, false)[0]).toMatchObject({ kind: "holiday_hours", batchId: "s" });
    expect(madeFromPostScore([row({ batch_id: "r", kind: "google_revert", field: "phoneNumbers" })], now, false)[0].kind).toBe("phone");
  });

  test("between scans: old → new for name, phone, address, website; hours by the first day that differs", () => {
    const a = { name: "A", phone: "1", address: "9 S Broadway", website: "u", openingHours: ["Monday: 9 AM–5 PM", "Tuesday: 9 AM–5 PM"] };
    const b = { name: "B", phone: "1", address: "9 S Broadway", website: "u", openingHours: ["Monday: 9 AM–5 PM", "Tuesday: 10 AM–5 PM"] };
    expect(watchedChanges(a, b, ["name", "hours"])).toEqual([
      { field: "name", from: "A", to: "B" },
      { field: "hours", from: "Tuesday: 9 AM–5 PM", to: "Tuesday: 10 AM–5 PM" },
    ]);
    // Name and address have no PostScore edit, so they're never left out.
    expect(changedByOthers(["name", "address"], [row({})], "2026-11-01T00:00:00Z", "2026-11-20T00:00:00Z")).toEqual(["name", "address"]);
  });
});

describe("description and photos rows", () => {
  const groupsWith = (extras: ListingExtras) => listingGroups({ ...BASE.listing, businessId: "b1", checks: BASE.checks, messagingOn: true, replies: null, extras }).flatMap((g) => g.rows);
  test("a short description is ! amber with Write with PostAI; 250+ is ✓", () => {
    const desc = groupsWith({ specialPeriods: [], services: [], categories: [], description: "Hair salon" }).find((r) => r.id === "description")!;
    expect(desc).toMatchObject({ status: "warn", meta: { short: "1" } });
    expect(rowText(desc, "en").action).toBe("Write with PostAI");
    expect(groupsWith({ specialPeriods: [], services: [], categories: [], description: "x".repeat(260) }).find((r) => r.id === "description")!.status).toBe("ok");
    expect(groupsWith({ specialPeriods: [], services: [], categories: [], description: "" }).find((r) => r.id === "description")!.status).toBe("bad");
  });
  test("the Photos row opens Add photos, with the customer-photos tooltip", () => {
    const html = render({ media: { photos: { count: 4, newestAt: "2026-09-09T00:00:00Z" }, posts: null, checkedAt: null } });
    expect(html).toContain('title="Customer photos aren&#x27;t counted"');
    expect(text(html)).toContain("4 photos you added · newest 2 months ago");
    expect(text(html)).toContain("Add photos");
  });
});

describe("Show up for more searches (section 5)", () => {
  const full = { specialPeriods: [], services: ["Haircut"], categories: ["Hair salon"], description: "Hair salon", attributeIds: [], verified: true };
  const section = (html: string) => text(html).slice(text(html).indexOf("5 Show up for more searches"), text(html).indexOf("6 Protection & changes"));
  test("real ideas with a pill, a reason with real numbers and one button; max 5, then Show N more", () => {
    const html = render({
      nicheId: "hair_salon",
      extras: full,
      messagingOn: false,
      media: { photos: { count: 4, newestAt: "2026-09-09T00:00:00Z" }, posts: { last30: 0, lastAt: null, lastType: null }, checkedAt: "2026-11-15T00:00:00Z" },
      // "barber near me" → a second category: a 6th idea, so "Show 1 more".
      insights: [{ ...SAMPLE_INSIGHTS[SAMPLE_INSIGHTS.length - 1], topKeywords: [{ term: "keratin tarrytown", count: 12 }, { term: "barber near me", count: 20 }] }],
    });
    const s5 = section(html);
    // Day 23C: the photos and the post are in section 1's "This week", not repeated here.
    expect(html).not.toContain('data-testid="google-tab-idea-photos"');
    expect(html).not.toContain('data-testid="google-tab-idea-posts"');
    expect(s5).toContain("Add Keratin treatment to your services");
    expect(s5).toContain("Reach: 12 searches/mo");
    expect(s5).toContain("Your description is only 10 characters (“Hair salon”)");
    expect(s5).not.toContain("Coming soon");
    expect(s5).not.toContain("Sample");
    expect((html.match(/data-testid="google-tab-idea-[a-z]+"/g) ?? []).length).toBe(5);
    expect(s5).toMatch(/Show \d more/);
    expect(html).toContain('href="#edit-services?add=Keratin%20treatment"');
  });

  test("every check passes: Nothing to add right now", () => {
    const html = render({
      extras: { ...full, description: "x".repeat(300), attributeIds: ["attributes/has_free_parking_lot", "attributes/has_wheelchair_accessible_entrance"], specialPeriods: [{ startDate: { year: 2026, month: 11, day: 26 }, closed: true }, { startDate: { year: 2026, month: 12, day: 24 }, closed: true }, { startDate: { year: 2026, month: 12, day: 25 }, closed: true }, { startDate: { year: 2026, month: 12, day: 31 }, closed: true }, { startDate: { year: 2027, month: 1, day: 1 }, closed: true }] },
      messagingOn: true,
      media: { photos: { count: 4, newestAt: new Date().toISOString() }, posts: { last30: 3, lastAt: null, lastType: null }, checkedAt: null },
    });
    expect(section(html)).toContain("Nothing to add right now. Your listing covers what people search for.");
  });
});

describe("your listing", () => {
  test("grouped rows with ✓ / ! / ✕, the counts, and coming-soon rows", () => {
    const groups = listingGroups({ ...BASE.listing, businessId: "b1", checks: BASE.checks, messagingOn: false, replies: { replied: 0, inWindow: 20 } });
    expect(groups.map((g) => g.id)).toEqual(["reach", "open", "who", "fresh"]);
    const status = Object.fromEntries(groups.flatMap((g) => g.rows).map((r) => [r.id, r.status]));
    expect(status).toMatchObject({ phone: "ok", website: "ok", messaging: "warn", hours: "warn", holiday: "soon", customerDetails: "bad", posts: "soon", reviews: "bad" });
    expect(listingCounts(groups)).toEqual({ ok: 4, fix: 2, improve: 2 });
    const html = text(render());
    expect(html).toContain("How customers reach you");
    expect(html).toContain("(914) 320-3012");
    expect(html).toContain("hairexpressonbroadway.com");
    expect(html).toContain("Mon Closed · Tue 9:30 AM – 5:00 PM · Wed–Thu 9:30 AM – 6:00 PM");
    expect(html).toContain("0 of your last 20 replied");
    expect(html).toContain("4 OK");
    expect(html).toContain("2 to fix");
  });

  test("Description and Booking link: read from Google after load: a shimmer, then the value, or the couldn't-load line", () => {
    const html = render();
    expect(html).toContain('data-testid="listing-loading-description"');
    expect(html).toContain('data-testid="listing-loading-booking"');
    expect(text(html)).not.toContain("Read from Google when you open it");
    const rows = listingGroups({ ...BASE.listing, businessId: "b1", checks: BASE.checks, messagingOn: false, replies: null }).flatMap((g) => g.rows);
    const desc = rows.find((r) => r.id === "description")!;
    const booking = rows.find((r) => r.id === "booking")!;
    const loading = { description: { kind: "loading" }, booking: { kind: "loading" } } as const;
    expect(rowText(desc, "en", { live: { ...loading, description: { kind: "value", value: "Hair salon" } } })).toMatchObject({ value: "“Hair salon”", note: "10 of 750 characters. Too short: say what you do best (aim for 250+ characters)." });
    expect(rowText(desc, "en", { live: { ...loading, description: { kind: "none" } } }).value).toBe("No description on Google yet");
    expect(rowText(desc, "en", { live: { ...loading, description: { kind: "error" } } })).toMatchObject({ value: "Couldn't load from Google. Open the editor to see it.", note: null });
    expect(rowText(booking, "en", { live: { ...loading, booking: { kind: "value", value: "https://www.booksy.com/en-us/hair-express/" } } }).value).toBe("booksy.com/en-us/hair-express");
    expect(rowText(booking, "en", { live: { ...loading, booking: { kind: "notOffered" } } }).value).toBe("Google doesn't offer this for your business type");
    expect(rowText(booking, "es", { live: { ...loading, booking: { kind: "error" } } }).value).toBe("No se pudo cargar desde Google. Abra el editor para verlo.");
  });

  test("rows: at least 44px, 32px buttons flush right (no per-row margin); room for Ask PostAI at the bottom of the tab", () => {
    const html = render();
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("inline-flex h-8 items-center");
    expect(html).not.toContain("sm:mr-[108px]");
    expect(html).toContain('class="flex flex-col pb-[68px]" data-testid="google-profile-tab"');
  });

  test("customer details: the three groups once, then the grey line", () => {
    const html = text(render({ extras: { specialPeriods: [], services: [], categories: [], details: { payment: true, parking: false, accessibility: false, open: 14, suggest: [] } } }));
    expect(html).toContain("Payments ✓ · Parking ✗ · Accessibility ✗ These three count toward your score · 14 more details you can add");
  });

  test("hours: Compare (primary) beside Edit only when the website and Google differ", () => {
    const with_ = render({ hoursMismatch: true });
    expect(with_).toContain('data-testid="listing-action-compare"');
    expect(text(with_)).toMatch(/Compare Edit/);
    expect(render({ hoursMismatch: false })).not.toContain('data-testid="listing-action-compare"');
  });

  test("hours run together; links open the right editor", () => {
    expect(compactHours(["Monday: 9 AM – 5 PM", "Tuesday: 9 AM – 5 PM", "Wednesday: Closed"])).toBe("Mon–Tue 9 AM – 5 PM · Wed Closed");
    expect(compactHours(null)).toBeNull();
    expect(editorFromHash("#edit-hours")).toBe("hours");
    expect(editorFromHash("#edit-website-link")).toBe("website");
    expect(editorFromHash("#other")).toBeNull();
    expect(fixFlowHref("b1", "completeness.hours")).toBe("/business/b1/growth?tab=google#edit-hours");
  });

  test("synced X ago", () => {
    const now = Date.parse("2026-11-14T12:00:00Z");
    expect(syncedAgo("2026-11-14T11:50:00Z", now)).toEqual({ unit: "minutes", count: 10 });
    expect(syncedAgo("2026-11-14T10:00:00Z", now)).toEqual({ unit: "hours", count: 2 });
    expect(syncedAgo("2026-11-10T12:00:00Z", now)).toEqual({ unit: "days", count: 4 });
    expect(syncedAgo(null, now)).toBeNull();
  });
});

describe("the pinned menu: which item is active, and #hashes", () => {
  // Section tops in viewport px; the menu's bottom edge at 44px.
  const line = 44 + JUMP_LINE_SLACK;
  const tops = (values: number[]) => (["last-month", "funnel", "searches", "listing", "next", "protection"] as const).map((id, i) => ({ id, top: values[i] }));

  test("the last section whose title has reached the line under the menu", () => {
    // Top of the page: nothing has reached the menu yet → section 1.
    expect(activeJumpSection(tops([200, 900, 1500, 2000, 3000, 3600]), line, false)).toBe("last-month");
    // A jump lands a title 12px under the menu (scroll-margin): that section, not the one before.
    expect(activeJumpSection(tops([-1400, -600, 56, 600, 1600, 2200]), line, false)).toBe("searches");
    // Midway through a long section: still that section.
    expect(activeJumpSection(tops([-2400, -1600, -1000, -300, 700, 1300]), line, false)).toBe("listing");
    // Just past the line by a pixel → the next one.
    expect(activeJumpSection(tops([-2400, -1600, -1000, -700, line, 900]), line, false)).toBe("next");
  });

  test("at the bottom of the page the last section highlights, even if its title can't reach the menu", () => {
    expect(activeJumpSection(tops([-3000, -2200, -1600, -1000, -200, 508]), line, true)).toBe("protection");
    expect(activeJumpSection(tops([-3000, -2200, -1600, -1000, -200, 508]), line, false)).toBe("next");
    expect(activeJumpSection([], line, false)).toBe("last-month");
  });

  test("#hash → the item it highlights: a section's own, a listing editor's, nothing else", () => {
    expect(jumpIdFromHash("#protection")).toBe("protection");
    expect(jumpIdFromHash("#searches")).toBe("searches");
    expect(jumpIdFromHash("listing")).toBe("listing");
    expect(jumpIdFromHash("#edit-hours")).toBe("listing");
    expect(jumpIdFromHash("#edit-website-link")).toBe("listing");
    expect(jumpIdFromHash("#google-connection")).toBeNull();
    expect(jumpIdFromHash("")).toBeNull();
    expect(jumpIdFromHash(null)).toBeNull();
  });

  test("the menu: one row of 6 pill links, dividers after 3 and 5, one active item, a focus ring; sections clear the pinned menu", () => {
    const html = render();
    const menu = html.slice(html.indexOf('data-testid="google-tab-jump"'), html.indexOf("</nav>"));
    expect(menu.match(/<a /g)).toHaveLength(6);
    for (const id of ["last-month", "funnel", "searches", "listing", "next", "protection"]) expect(menu).toContain(`href="#${id}"`);
    expect(text(menu.slice(menu.indexOf(">") + 1)).trim()).toBe("1 Last month 2 Searches → customers 3 Search terms 4 Your listing 5 Show up for more 6 Changes");
    // No group labels in the menu; thin dividers after item 3 and item 5.
    expect(text(menu)).not.toMatch(/Performance|Edit your listing|Protection/);
    expect(menu.match(/data-testid="google-tab-jump-divider"/g)).toHaveLength(2);
    expect(menu.indexOf("google-tab-jump-divider")).toBeGreaterThan(menu.indexOf('href="#searches"'));
    expect(menu.indexOf("google-tab-jump-divider")).toBeLessThan(menu.indexOf('href="#listing"'));
    expect(menu.match(/aria-current="location"/g)).toHaveLength(1);
    expect(menu).toContain("focus-visible:ring-2");
    // 40px tall, spread across the column from 1000px, scrolling sideways below.
    expect(menu).toContain("h-10");
    expect(menu).toContain("min-[1000px]:justify-evenly");
    expect(menu).toContain("overflow-x-auto");
    // Pinned at the top of the scrolling area (under the phone top bar), in a page-colored band.
    expect(html).toMatch(/class="sticky z-20 bg-paper[^"]*top-14 nav:top-0/);
    // Every section and part header lands below the pinned menu.
    for (const id of ["last-month", "funnel", "searches", "listing", "next", "protection", "part-performance", "part-edit", "part-protection"]) expect(html).toMatch(new RegExp(`id="${id}"[^>]*scroll-mt-\\[112px\\] nav:scroll-mt-14|scroll-mt-\\[112px\\] nav:scroll-mt-14[^>]*id="${id}"`));
  });
});

describe("the tab's states", () => {
  test("?tab=google opens it; the old ?tab=google-profile too", () => {
    expect(isGoogleTabParam("google")).toBe(true);
    expect(isGoogleTabParam("google-profile")).toBe(true);
    expect(isGoogleTabParam(null)).toBe(false);
    expect(segmentFromParam("google")).toBe("google-profile");
    expect(segmentFromParam("google-profile")).toBe("google-profile");
    expect(segmentFromParam(null)).toBe("plan");
  });

  test("connected, before the first monthly Google report: empty states, real levers and listing, no sample numbers", () => {
    const html = render();
    const words = text(html);
    expect(html).toContain('data-testid="google-tab-jump"');
    for (const s of ["Last month", "Searches → customers", "What people searched", "Your listing", "Show up for more", "Changes"]) expect(words).toContain(s);
    expect(html).toContain('data-testid="google-tab-rate-empty"');
    expect(words).toContain("Google hasn't shared numbers for your listing yet. They usually appear within a few days.");
    expect(words).toContain("Updates on the 1st of every month · next: ");
    expect(html).toContain('data-testid="google-tab-kpis-empty"');
    // Sections 2 and 3 wait for Google's numbers; section 5 never says "Coming soon".
    expect(html.match(/data-testid="google-tab-coming"/g)).toHaveLength(2);
    expect(words).not.toContain("first full month");
    expect(words).not.toMatch(/Sample data|11\.8%|704|\$3,700/);
    // The levers, with the exact micro descriptions.
    expect(words).toContain("What raises your conversion rate");
    for (const why of [
      "80% prefer businesses that reply to every review.",
      "42% more direction requests with photos (Google).",
      "Give people who found you a reason to act now.",
      "50% of customers look for a deal when searching (Google).",
      "0.1s faster on phones lifts conversions ~8% (Deloitte).",
    ])
      expect(words).toContain(why);
    expect(words).not.toMatch(/Instagram|Facebook|social media/i);
    expect(words).toContain("Last month you: added customer details · fixed your website link. Not yet: review replies, a coupon or referral card. The more of these you keep up each month, the better your odds of this number climbing.");
    expect(words).toContain("Sources: Google Business Profile playbooks · BrightLocal Local Consumer Review Survey 2026 · Sterling Sky Google Posts test · Deloitte 'Milliseconds Make Millions'.");
  });

  test("three parts, each a one-line header: gold label · grey line (none for Edit your listing); no summary line, no part titles (EN + ES)", () => {
    const html = render();
    const words = text(html);
    expect(words).not.toContain("your whole Google listing in one place");
    expect(words).not.toMatch(/How you're doing on Google|Fix your listing|Who changed your listing/);
    const at = (s: string) => html.indexOf(s);
    expect(at('data-testid="google-tab-part-performance"')).toBeLessThan(at('id="last-month"'));
    expect(at('id="searches"')).toBeLessThan(at('data-testid="google-tab-part-edit"'));
    expect(at('data-testid="google-tab-part-edit"')).toBeLessThan(at('id="listing"'));
    expect(at('id="next"')).toBeLessThan(at('data-testid="google-tab-part-protection"'));
    expect(at('data-testid="google-tab-part-protection"')).toBeLessThan(at('id="protection"'));
    const part = (p: string) => text(html.slice(at(`data-testid="google-tab-part-${p}"`), html.indexOf("</p>", at(`data-testid="google-tab-part-${p}"`)))).replace(/^[^>]*>/, "").trim();
    expect(part("performance")).toBe("Performance · How people found you on Google and what they did");
    expect(part("edit")).toBe("Edit your listing");
    expect(part("protection")).toBe("Protection · Changes made by anyone else, and everything changed from PostScore");
    // Section 4 keeps only its right-hand note (with Beta); section 4 and 5 have no line under the title.
    expect(words).toContain("Edit right here: preview → approve → undo for 7 days · Beta");
    expect(words).not.toContain("checked and editable without leaving PostScore");
    expect(words).not.toContain("Your weekly tasks live in Growth recap");
    const es = text(render({}, "es"));
    expect(es).toContain("Rendimiento · Cómo lo encontró la gente en Google y qué hizo");
    expect(es).toContain("Protección · Cambios hechos por cualquier otra persona, y todo lo que se cambió desde PostScore");
    // Not connected: still one card only.
    expect(render({ connected: false })).not.toContain("google-tab-part-");
  });

  test("practice mode: the note is a small pill at the end of the menu (the full sentence as its tooltip); every “Sample data” tag is the same pill", () => {
    const html = render({ practice: true, connected: false });
    const menu = html.slice(html.indexOf('data-testid="google-tab-jump"'), html.indexOf("</nav>"));
    expect(menu).toContain('data-testid="google-tab-sample-note"');
    expect(menu).toContain('title="Practice mode: the numbers in sections 1, 2, 3 and 5 are sample data');
    expect(text(menu)).toContain("Sample data in practice mode");
    expect(html.match(/data-testid="google-tab-sample-note"/g)).toHaveLength(1);
    const pills = html.match(/<span class="inline-block align-middle normal-case tracking-normal rounded-full[^"]*">Sample data<\/span>/g) ?? [];
    expect(pills.length).toBeGreaterThanOrEqual(4);
    expect(render()).not.toContain("google-tab-sample-note");
  });

  test("section 5's sample ideas never contradict the real listing", () => {
    expect(sampleIdeas(["Hair salon"])).toEqual([1, 2]);
    expect(sampleIdeas(null)).toEqual([1, 2]);
    // Hair Express has 5 categories: no "add a second category".
    expect(sampleIdeas(["Hair salon", "Beauty salon", "Hair care", "Hair extension technician", "Hairdresser"])).toEqual([1]);
    // Samples only while there's no real idea (messaging off would be one).
    const html = render({ practice: true, connected: false, messagingOn: true, listing: { ...BASE.listing, categories: ["Hair salon", "Beauty salon"] } });
    expect(html).toContain('data-testid="google-tab-idea-1"');
    expect(html).not.toContain('data-testid="google-tab-idea-2"');
    expect(render({ practice: true, connected: false, messagingOn: true })).toContain('data-testid="google-tab-idea-2"');
    expect(render({ practice: true, connected: false, messagingOn: false })).not.toContain('data-testid="google-tab-idea-1"');
  });

  test("practice mode: the mockup's sample numbers, labelled as sample data", () => {
    const words = text(render({ practice: true, connected: false }));
    expect(words).toContain("11.8%");
    expect(words).toContain("October: 11.8% · 83 of 704 people");
    expect(words).toContain("September: 10.1% · 69 of 680 people ▲ 2 more customers per 100 people than the month before");
    expect(words).toContain("Sample data");
    expect(words).toContain("hair salon tarrytown");
    expect(words).toContain("Google brought you about $1,250–$3,750 last month");
    expect(words).not.toContain("Coming with your first monthly Google report");
  });

  test("not connected: one card, what connecting unlocks, the Connect button — nothing else", () => {
    const html = render({ connected: false, saved: null });
    const words = text(html);
    expect(html).toContain('data-testid="google-tab-not-connected"');
    expect(html).toContain('data-testid="google-tab-connect"');
    expect(words).toContain("Connect Google to see your Google Profile");
    expect(words).toContain("Your conversion rate each month");
    expect(html).not.toContain("google-tab-jump");
    expect(html).not.toContain("google-tab-listing");
    expect(words).not.toContain("What raises your conversion rate");
  });

  test("Spanish (usted)", () => {
    const words = text(render({}, "es"));
    expect(words).toContain("Google aún no ha compartido números de su ficha. Suelen aparecer en unos días.");
    expect(words).toContain("Qué sube su tasa de conversión");
    expect(words).toContain("Cómo le contactan");
    expect(text(render({ connected: false }, "es"))).toContain("Conecte Google para ver su Perfil de Empresa en Google");
    expect(t("es", "dashboard.googleTab.lever.reviews.why")).toBe("El 80 % prefiere negocios que responden a todas las reseñas.");
  });
});
