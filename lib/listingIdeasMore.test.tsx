// "Show up for more searches" on the Google listing page: 3–5 ideas from real data, ranked by likely search impact,
// never inventing a service, a detail or a category (lib/listingIdeas.ts).
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { listingIdeas, townOf, type IdeaInputs } from "@/lib/listingIdeas";

const base: IdeaInputs = {
  businessId: "b1",
  now: Date.parse("2026-11-27T12:00:00Z"),
  type: "hair",
  months: [],
  listing: { services: ["Balayage", "Haircut"], categories: ["Hair salon"], description: "A full-service salon with friendly stylists and great color, open six days a week for cuts, color and blowouts. Book online today.", specialPeriods: [], attributeIds: ["has_parking", "has_wheelchair_accessible_entrance"], details: null },
  photos: { count: 40, newestAt: "2026-11-20T00:00:00Z" },
  posts: null,
  messagingOn: true,
  bookingTurnOn: null,
  town: "Tarrytown",
};

describe("the town", () => {
  test("read from the address read live; unclear addresses give none", () => {
    expect(townOf("9 S Broadway, Tarrytown, NY 10591, USA")).toBe("Tarrytown");
    expect(townOf("12 Main St, Sleepy Hollow, NY 10591")).toBe("Sleepy Hollow");
    expect(townOf("Somewhere")).toBeNull();
    expect(townOf(null)).toBeNull();
  });
  test("'Mention Tarrytown in your description': the searches that name it lead, and it ranks by them", () => {
    const ideas = listingIdeas({ ...base, months: [{ topKeywords: [{ term: "tarrytown hair salon", count: 29 }, { term: "hair salon tarrytown", count: 20 }, { term: "hair salon", count: 27 }] }] });
    expect(ideas[0]).toMatchObject({ id: "town", town: "Tarrytown", terms: ["tarrytown hair salon", "hair salon tarrytown"], searches: 49 });
    // Already there, or no description yet (the fuller description covers it): none.
    expect(listingIdeas({ ...base, listing: { ...base.listing!, description: "Our Tarrytown salon." } }).some((i) => i.id === "town")).toBe(false);
    expect(listingIdeas({ ...base, listing: { ...base.listing!, description: "" } }).some((i) => i.id === "town")).toBe(false);
  });
});

describe("a second category", () => {
  test("no search points to one: the closest for the type as examples (never one already on the listing); the owner sets it on Google", () => {
    const cat = listingIdeas(base).find((i) => i.id === "category");
    expect(cat).toMatchObject({ category: "Hair stylist", also: "Beauty salon", searches: 0, action: { kind: "link", href: "https://business.google.com/" } });
    expect(listingIdeas({ ...base, listing: { ...base.listing!, categories: ["Hair salon", "Beauty salon"] } }).some((i) => i.id === "category")).toBe(false);
    const msgs = readFileSync("lib/i18n/messages.ts", "utf8");
    expect(msgs).toContain("You choose; PostScore never sets it.");
    expect(msgs).toContain("Usted decide; PostScore nunca la cambia.");
  });
});

describe("services and details come only from real data", () => {
  test("generic searches name no service: no 'Add services' idea", () => {
    expect(listingIdeas({ ...base, months: [{ topKeywords: [{ term: "hair salon near me", count: 24 }] }] }).some((i) => i.id === "services")).toBe(false);
  });
  test("parking and accessibility already set: no customer-details idea", () => {
    expect(listingIdeas(base).some((i) => i.id === "details")).toBe(false);
  });
});

describe("the page", () => {
  test("every listing idea (no 'This week' filter; posts stay in Growth plan), minus done or still with Google; each '+N pts' or 'Helps customers · no points'", () => {
    const page = readFileSync("components/gbp/GoogleListingPage.tsx", "utf8");
    expect(page).toContain('ideas.filter((i) => i.id !== "posts" && !done.includes(i.id) && !(i.id === "town" && done.includes("description")) && !waiting.includes(IDEA_ROW[i.id]))');
    expect(page).toContain("data-testid={`idea-pts-${idea.id}`}");
    expect(page).toContain("data-testid={`idea-helps-${idea.id}`}");
    // Grow: the steps, and what Premium would do.
    expect(page).toContain("data-testid={`idea-premium-${idea.id}`}");
  });
});
