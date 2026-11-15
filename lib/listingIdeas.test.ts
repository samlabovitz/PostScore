import { describe, expect, test } from "vitest";
import { doneSinceScan, ideaTypeOf, listingIdeas, missingServices, monthlyTerms, prefillFromHash, relatedCategory, type IdeaInputs } from "@/lib/listingIdeas";
import { editorFromHash } from "@/lib/googleProfileTab";

// Section 5: every idea comes from real data, ranked (a holiday within 14
// days first, then searches reached / known impact), at most 5 shown.

const NOW = Date.parse("2026-11-15T12:00:00Z"); // Thanksgiving: Nov 26 (11 days)
const FULL: IdeaInputs["listing"] = {
  services: ["Haircut", "Balayage", "Hair coloring"],
  categories: ["Hair salon"],
  description: "x".repeat(300),
  specialPeriods: [
    { startDate: { year: 2026, month: 11, day: 26 }, closed: true },
    { startDate: { year: 2026, month: 12, day: 24 }, closed: true },
    { startDate: { year: 2026, month: 12, day: 25 }, closed: true },
  ],
  attributeIds: ["attributes/has_wheelchair_accessible_entrance", "attributes/has_free_parking_lot"],
};
const base = (over: Partial<IdeaInputs> = {}): IdeaInputs => ({
  businessId: "b1",
  now: NOW,
  type: "hair",
  months: [{ topKeywords: [{ term: "hair salon tarrytown", count: 29 }] }],
  listing: FULL,
  photos: { count: 4, newestAt: "2026-11-01T00:00:00Z" },
  posts: { last30: 2 },
  messagingOn: true,
  bookingTurnOn: null,
  ...over,
});
const ids = (i: IdeaInputs) => listingIdeas(i).map((x) => x.id);

describe("each rule", () => {
  test("nothing to add when every check passes", () => {
    expect(ids(base())).toEqual([]);
  });

  test("missing services from search terms (loose match), with reach and the pre-filled editor", () => {
    const terms = [
      { term: "keratin treatment tarrytown", count: 12 },
      { term: "balayage near me", count: 30 },
      { term: "keratin", count: 4 },
    ];
    expect(missingServices("hair", terms, FULL!.services)).toEqual([{ service: "Keratin treatment", terms: ["keratin treatment tarrytown", "keratin"], searches: 16 }]);
    const idea = listingIdeas(base({ months: [{ topKeywords: terms }] }))[0];
    expect(idea).toMatchObject({ id: "services", searches: 16, action: { kind: "editor", hash: "#edit-services?add=Keratin%20treatment" } });
    expect(prefillFromHash("#edit-services?add=Keratin%20treatment,Silk%20press")).toEqual(["Keratin treatment", "Silk press"]);
    expect(editorFromHash("#edit-services?add=Keratin%20treatment")).toBe("services");
  });

  test("search terms are a monthly average over the stored months", () => {
    expect(monthlyTerms([{ topKeywords: [{ term: "Fade", count: 10 }] }, { topKeywords: [{ term: "fade", count: 20 }] }, { topKeywords: [] }])).toEqual([{ term: "fade", count: 15 }]);
  });

  test("thin description, quoted with its length", () => {
    expect(listingIdeas(base({ listing: { ...FULL!, description: "Hair salon" } }))).toEqual([expect.objectContaining({ id: "description", length: 10, text: "Hair salon" })]);
  });

  test("an upcoming holiday without special hours", () => {
    const idea = listingIdeas(base({ listing: { ...FULL!, specialPeriods: [] } }))[0];
    expect(idea).toMatchObject({ id: "holiday", holiday: "thanksgiving", date: "2026-11-26", daysAway: 11, action: { hash: "#edit-holiday" } });
  });

  test("no posts in 30 days → post ideas with a topic for the type", () => {
    expect(listingIdeas(base({ posts: { last30: 0 } }))).toEqual([expect.objectContaining({ id: "posts", topic: "hair", action: { kind: "link", href: "/business/b1/growth#ways-to-grow" } })]);
  });

  test("photos older than 30 days (or none) → the Add photos panel", () => {
    expect(listingIdeas(base({ photos: { count: 4, newestAt: "2026-09-09T00:00:00Z" } }))).toEqual([expect.objectContaining({ id: "photos", monthsOld: 2, action: { kind: "editor", hash: "#edit-photos" } })]);
    expect(listingIdeas(base({ photos: { count: 0, newestAt: null } }))[0]).toMatchObject({ id: "photos", monthsOld: null });
  });

  test("missing parking / accessibility, not for home services", () => {
    expect(listingIdeas(base({ listing: { ...FULL!, attributeIds: [] } }))[0]).toMatchObject({ id: "details", missing: ["parking", "accessibility"] });
    expect(ids(base({ type: "home", listing: { ...FULL!, attributeIds: [] } }))).toEqual([]);
    expect(ids(base({ listing: { ...FULL!, attributeIds: null } }))).toEqual([]);
  });

  test("messaging off", () => {
    expect(ids(base({ messagingOn: false }))).toEqual(["messaging"]);
    expect(ids(base({ messagingOn: null }))).toEqual([]);
  });

  test("second category: only with exactly one, and searches pointing to a related one", () => {
    const terms = [{ term: "barber tarrytown", count: 9 }];
    expect(relatedCategory("hair", terms, ["Hair salon"])).toEqual({ category: "Barber shop", terms: ["barber tarrytown"], searches: 9 });
    expect(relatedCategory("hair", terms, ["Hair salon", "Barber shop"])).toBeNull();
    expect(relatedCategory("hair", [{ term: "hair salon", count: 50 }], ["Hair salon"])).toBeNull();
  });

  test("booking not counted: case B only", () => {
    expect(ids(base({ bookingTurnOn: { provider: "Square" } }))).toEqual(["booking"]);
  });

  test("a failed listing read: those checks are skipped, never guessed", () => {
    expect(ids(base({ listing: null, posts: { last30: 0 } }))).toEqual(["posts"]);
  });

  test("business types covered by the maps", () => {
    expect(ideaTypeOf("hair_salon")).toBe("hair");
    expect(ideaTypeOf("barbershop")).toBe("barber");
    expect(ideaTypeOf("nail_salon")).toBe("nails");
    expect(ideaTypeOf("pizza")).toBe("restaurant");
    expect(ideaTypeOf("art_classes")).toBe("art");
    expect(ideaTypeOf("plumber")).toBe("home");
    expect(ideaTypeOf(null, ["Pottery classes"])).toBe("art");
    expect(ideaTypeOf("dentist")).toBeNull();
  });
});

describe("ranking", () => {
  const all = base({
    months: [{ topKeywords: [{ term: "keratin", count: 40 }, { term: "barber", count: 5 }] }],
    listing: { ...FULL!, description: "Hair salon", specialPeriods: [], attributeIds: [] },
    photos: { count: 0, newestAt: null },
    posts: { last30: 0 },
    messagingOn: false,
    bookingTurnOn: { provider: "Square" },
  });
  test("a holiday within 14 days first, then searches reached, then known impact", () => {
    expect(ids(all)).toEqual(["holiday", "services", "category", "booking", "photos", "description", "details", "posts", "messaging"]);
  });
  test("a holiday further out ranks by impact", () => {
    const later = listingIdeas({ ...all, now: Date.parse("2026-11-28T12:00:00Z") });
    expect(later.find((i) => i.id === "holiday")).toMatchObject({ holiday: "christmasEve", daysAway: 26 });
    expect(later[0].id).toBe("services");
  });
});

describe("Done ✓ until the next scan", () => {
  test("changes from PostScore after the last scan; failed or undone ones don't count", () => {
    const made = [
      { kind: "services", status: "live", at: "2026-11-15T10:00:00Z" },
      { kind: "holiday_hours", status: "failed", at: "2026-11-15T10:00:00Z" },
      { kind: "description", status: "undo", at: "2026-11-10T10:00:00Z" },
    ];
    expect(doneSinceScan(made, "2026-11-14T00:00:00Z")).toEqual(["services"]);
  });
});
