import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { createMeasurer, loadDesignFonts } from "@/lib/signStudio/fonts";
import { renderPdf } from "@/lib/signStudio/pdf";
import { businessRowToScoringInput, scoreBusiness, type CheckResult } from "@/lib/scoring";
import type { PrintPage } from "@/lib/signStudio/elements";
import type { ReportData } from "./reportPdf";
import {
  capMovedRows,
  cleanEventTitle,
  eventTitleBefore,
  familyPostIdeas,
  headedItems,
  isNoChange,
  layoutWeeklyReportV2,
  listingKind,
  pointsMovedRows,
  postFamily,
  printedTexts,
  todayItems,
  usesWeeklyReportV2,
  waitingOnGoogle,
  websitePostRows,
  WEEKLY_REPORT_V2_FROM,
  type WeeklyReportV2Data,
} from "./weeklyReportV2";

// The three-page weekly report (Day 22): never more than 3 pages, never
// "undefined", the waiting-on-Google box only while Google isn't
// connected, and "Where your points moved" rows that add up.

const read = async (f: string) => new Uint8Array(await readFile(path.join(process.cwd(), "public", "sign-fonts", f)));
const measurer = async () => createMeasurer(await loadDesignFonts({ headlineFont: "playfair", bodyFont: "inter" }, read));

const BASE: ReportData = {
  locale: "en",
  timeZone: "America/New_York",
  generatedAt: "2026-11-13T15:00:00Z",
  business: { name: "Centered Clay Studio", address: "67 Ways Ln, Kennett Square, PA 19348, USA" },
  score: { total: 83, grade: "B" },
  period: null,
  categories: [
    { label: "Visibility & Reputation", points: 30, weight: 40, earned: 0.75, unchecked: 0, done: 1, needsWork: 1, couldntCheck: 2 },
    { label: "Google Listing Completeness", points: 25, weight: 30, earned: 0.83, unchecked: 0, done: 6, needsWork: 2, couldntCheck: 0 },
    { label: "Website", points: 28, weight: 30, earned: 0.93, unchecked: 0, done: 12, needsWork: 2, couldntCheck: 0 },
  ],
  rank: { rank: 3, of: 5, noun: "tutoring services", previousRank: null },
  changes: { listing: [], listingUnavailable: false, fixesConfirmed: 0 },
  nextSteps: [],
  reviews: { rating: 4.8, count: 48, countChange: null, nearbyAverage: 51, goalLines: ["Art & pottery studios nearby average 51 reviews.", "Your goal: beat Fired Up Pottery, LLC, with 117 reviews (69 more than you)."] },
  weekly: { weekStart: "2026-11-09", weekEnd: "2026-11-15", noNewScanSince: null, comparedWith: null, comparedInWeek: false, routine: { done: 0, total: 5 }, pastWeek: false },
};

const STEP = (n: number, long = false) => ({
  label: long ? "A very long step name that keeps going and going far past the column".repeat(2) : `Step ${n}`,
  title: `Do the thing number ${n}`,
  urgent: n === 1,
  minutes: 10,
  points: "+4 pts",
  summary: "Show customers on Google when and how they can book you (see page 2).",
  why: "Right now your Google listing shows no hours. ".repeat(long ? 6 : 1),
  bullets: ["Open by appointment: choose “Open with no main hours”.", "Add a booking link.", "Seasonal hours? Set them while they apply."],
  script: { label: "What to say:", text: "If you had fun today, a quick Google review really helps a small studio like ours." },
});

const DATA: WeeklyReportV2Data = {
  base: BASE,
  plan: "free",
  firstReport: { scannedAt: "2026-11-13T16:53:18Z" },
  moved: null,
  rankText: "#3 of 5 nearby art & pottery studios",
  categoryLines: ["1 done · 1 needs work · 2 checks waiting on Google (see below)", "6 done · 2 need work", "12 done · 2 need work"],
  waiting: { checks: [{ label: "Review recency", points: 6 }, { label: "Replying to reviews", points: 6 }], category: { label: "Visibility & Reputation", points: 30, weight: 40 } },
  steps: [STEP(1), STEP(2), STEP(3)],
  posts: { kind: "website", listing: "workshop", site: "centeredclaystudio.com", checkedAt: "2026-11-13T15:00:00Z", rows: [{ when: "Nov 21", title: "Luminaries", idea: "Post about it by Nov 14" }, { when: "Nov 22", title: null, idea: "Post about it by Nov 15" }] },
  today: todayItems("free", "en"),
  headed: headedItems("free", "en"),
  scanAt: "2026-11-13T16:53:18Z",
};

const texts = (pages: PrintPage[]) => printedTexts(pages).join("\n");

describe("the layout", () => {
  test("Centered Clay's first report: 3 letter pages, the starting point, the type-aware rank, the waiting box, no “undefined”", async () => {
    const pages = layoutWeeklyReportV2(DATA, await measurer());
    expect(pages).toHaveLength(3);
    for (const p of pages) expect([p.width, p.height]).toEqual([612, 792]);
    const all = texts(pages);
    expect(all).not.toMatch(/undefined|NaN|\{\w+\}/);
    expect(all).toContain("YOUR STARTING POINT");
    expect(all).toContain("Your first full scan (Nov 13, 2026). Next week's report shows what moved and why.");
    expect(all).toContain("#3 of 5 nearby art & pottery studios");
    expect(all).not.toContain("tutoring services");
    expect(all).toContain("2 CHECKS WAITING ON GOOGLE");
    expect(all).toContain("Three things worth your time");
    expect(all).toContain("Post once, share it three places");
    expect(all).toContain("Dates from centeredclaystudio.com on Nov 13, 2026. Please double-check before posting.");
    expect(all).toContain("THIS IS ONE WEEK. POSTSCORE DOES IT EVERY WEEK.");
  });

  test("the waiting box only while Google isn't connected; paid plans get “Next week”, not the upgrade box", async () => {
    const all = texts(layoutWeeklyReportV2({ ...DATA, waiting: null, plan: "premium", today: todayItems("premium", "en"), headed: headedItems("premium", "en") }, await measurer()));
    expect(all).not.toContain("WAITING ON GOOGLE");
    expect(all).toContain("NEXT WEEK");
    expect(all).not.toContain("THIS IS ONE WEEK");
  });

  test("worst case — long names, Spanish, every section full — still 3 pages, every element on its page", async () => {
    const m = await measurer();
    const long: WeeklyReportV2Data = {
      ...DATA,
      base: { ...BASE, locale: "es", business: { name: "Hair Extension Sew ins Weave Microlinks Hair Extensions Tape in Crochet Box Braids Wigs", address: "1234 Very Long Avenue Name, Suite 500, Some Very Long Town Name, NY 10591, USA" } },
      moved: { from: 79, to: 84, rows: Array.from({ length: 6 }, (_, i) => ({ label: `Una revisión con un nombre largo ${i}`, delta: i === 0 ? 2 : 1 })).slice(0, 4), scoringUpdate: { from: 79, to: 78 }, unsplit: false },
      firstReport: null,
      steps: [STEP(1, true), STEP(2, true), STEP(3, true)],
      posts: { kind: "website", listing: "workshop", site: "example.com", checkedAt: BASE.generatedAt, rows: Array.from({ length: 7 }, (_, i) => ({ when: `Nov ${14 + i}`, title: i % 2 ? null : "Make and Decorate Your Own", idea: "Publíquelo antes del 7 nov" })) },
      today: todayItems("premium", "es"),
      headed: headedItems("premium", "es"),
      plan: "premium",
    };
    const pages = layoutWeeklyReportV2(long, m);
    expect(pages).toHaveLength(3);
    for (const p of pages)
      for (const e of p.panels[0].elements) {
        if (e.kind === "text") {
          expect(e.y, e.text).toBeLessThanOrEqual(792 - 20);
          expect(e.x + m.width(e.text, e.role, e.size, e.letterSpacing), e.text).toBeLessThanOrEqual(612 - 30);
        }
      }
    expect(texts(pages)).not.toMatch(/undefined|NaN/);
    const bytes = (await renderPdf(pages, { qrs: {}, fontBytes: await loadDesignFonts({ headlineFont: "playfair", bodyFont: "inter" }, read), title: "t" })).bytes;
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
  });

  test("Spanish wording (usted)", async () => {
    const es = texts(layoutWeeklyReportV2({ ...DATA, base: { ...BASE, locale: "es" }, today: todayItems("free", "es"), headed: headedItems("free", "es") }, await measurer()));
    expect(es).toContain("SU PUNTO DE PARTIDA");
    expect(es).toContain("Publique una vez, compártalo en tres lugares");
    expect(es).toContain("2 REVISIONES ESPERANDO A GOOGLE");
  });
});

describe("where your points moved", () => {
  const ROW = {
    rating: 4.8, review_count: 48, phone: "1", address: "a", opening_hours: null, website: null, https_status: null,
    categories: ["educational_institution"], category: "Educational Institution", photo_count: 12, business_status: "OPERATIONAL", primary_type: "educational_institution", name: "Clay",
    listing_has_accessibility: false, listing_has_payment: true, listing_has_parking: false, pure_service_area_business: false,
  };
  const before = scoreBusiness(businessRowToScoringInput(ROW));
  const after = scoreBusiness(businessRowToScoringInput({ ...ROW, opening_hours: ["Mon: 9–5"], photo_count: 30, review_count: 70, listing_has_parking: true }));
  const label = (c: CheckResult) => c.id;

  test("one row per changed check, adding up exactly to the score change", () => {
    const rows = pointsMovedRows(before.checks, after.checks, before.total, after.total, label);
    expect(after.total).not.toBe(before.total);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.reduce((a, r) => a + r.delta, 0)).toBe(after.total - before.total);
    expect(rows.every((r) => r.delta !== 0 && Number.isInteger(r.delta))).toBe(true);
  });

  test("the other way too, and nothing changed → no rows", () => {
    const back = pointsMovedRows(after.checks, before.checks, after.total, before.total, label);
    expect(back.reduce((a, r) => a + r.delta, 0)).toBe(before.total - after.total);
    expect(pointsMovedRows(before.checks, before.checks, before.total, before.total, label)).toEqual([]);
  });

  test("capped rows keep the sum (“Other changes (n)”)", () => {
    const rows = [5, 3, -2, 1, 1, 1, -1].map((delta, i) => ({ label: `c${i}`, delta }));
    const capped = capMovedRows(rows, 4, "en");
    expect(capped).toHaveLength(4);
    expect(capped.at(-1)!.label).toBe("Other changes (4)");
    expect(capped.reduce((a, r) => a + r.delta, 0)).toBe(8);
  });
});

describe("waiting on Google", () => {
  const check = (id: string, earnedPoints: number | null, confidence: CheckResult["confidence"]) => ({ id, earnedPoints, confidence, maxPoints: 6 }) as CheckResult;
  const checks = [check("visibility.review_recency", null, "NOT_FOUND"), check("visibility.review_replies", null, "NOT_FOUND"), check("visibility.rating", 13, "VERIFIED")];
  test("the two review checks while not connected; none once connected", () => {
    expect(waitingOnGoogle(checks, false).map((c) => c.id)).toEqual(["visibility.review_recency", "visibility.review_replies"]);
    expect(waitingOnGoogle(checks, true)).toEqual([]);
  });
});

describe("post ideas: real dates from the website, clean titles, never guessed", () => {
  const NOW = new Date("2026-11-13T15:00:00Z");
  // Centered Clay Studio's real workshops page, one line per block (htmlTextLines).
  const LINES = [
    "One-Time 1-2 Day Workshops",
    "November and December Projects 🎄",
    "Gnomes",
    "Gnomes $65",
    "Saturday December 5th ( get them back before christmas)",
    "Make a pair that reflects your unique personality. Fun colors and accessories.",
    "Date Night Nerikomi",
    "Nerikomi",
    "$",
    "7",
    "5",
    "Saturday November 14th, 10 am",
    "Use this Japanese technique to add colored clay shapes to handbuilt mugs, bowls, or plates.",
    "House and Tree Luminary",
    "Make it & Decorate it",
    "Make and Decorate $65",
    "November 29th 1pm",
    "Grazing Plate",
    "Charcuterie",
    "Set $75",
    "November 15th, and December 12th",
    "Longwood Garden Tree Project",
    "Ornament",
    "Trio $45",
    "November 13th 6:30 pm,",
    "November",
    "22nd 1pm, November 28th 12pm",
  ];

  // "November 15th, and December 12th" has no weekday or time after it, so
  // the date rule (lib/websiteTrust.ts) doesn't count it.
  test("Centered Clay: each future date with its own title — prices, times and repeats stripped; no clean title → none", () => {
    // Nov 13 (Ornament Trio) is today: only future dates.
    expect(websitePostRows({ lines: LINES }, NOW, "en").map((r) => [r.when, r.title])).toEqual([
      ["Nov 14", "Date Night Nerikomi"],
      // The dates right after Ornament Trio's own are the same workshop.
      ["Nov 22", "Ornament Trio"],
      ["Nov 28", "Ornament Trio"],
      ["Nov 29", "Make and Decorate"],
      ["Dec 5", "Gnomes"],
    ]);
  });

  test("Centered Clay's page as updated on Nov 14: titles for every listed date", () => {
    const live = [
      "Seasonal workshops",
      "Luminary",
      "Luminari",
      "a",
      "$65",
      "Sun",
      "day,",
      "Nov, 8th - 1-4 pm",
      ";",
      "Saturday, Nov. 21st - 2-5 pm",
      "; December dates TBA",
      "Enjoy a warm glow with your own luminary.",
      "Gnomes",
      "Gnomes $65",
      "Saturday, December 5th, 2-5 pm (ready for pickup before Christmas)",
      "Gnomes are a trendy holiday decor! Make a pair that reflects your unique personality.",
      "Longwood Garden Tree Project",
      "Ornament",
      "Trio $45",
      "November",
      "22nd 1pm, November 28th 12pm",
      "Make a trio of handmade clay ornaments.",
      "Make it & Decorate It",
      "Make It and Decorate It $65",
      "Sunday, November 29th, 1-4 pm",
      "Holiday version! You make the cup and decorate it.",
    ];
    expect(websitePostRows({ lines: live }, new Date("2026-11-15T03:00:00Z"), "en").map((r) => [r.when, r.title])).toEqual([
      // "Saturday, Nov. 21st": an abbreviated month, the second date of the Luminary workshop.
      ["Nov 21", "Luminary"],
      ["Nov 22", "Ornament Trio"],
      ["Nov 28", "Ornament Trio"],
      ["Nov 29", "Make It and Decorate It"],
      ["Dec 5", "Gnomes"],
    ]);
    // Two events in a row, the second with no title of its own: never borrowed.
    expect(websitePostRows({ lines: ["Our workshops are open to all.", "Gnomes", "Saturday, December 5th, 2-5 pm", "Bring a friend for this one.", "Saturday, December 12th, 2-5 pm"] }, NOW, "en").map((r) => r.title)).toEqual(["Gnomes", null]);
  });

  test("titles: short, a capital first, no prices, times, digits, dates or sentences", () => {
    expect(cleanEventTitle("Gnomes Gnomes $65")).toBe("Gnomes");
    expect(cleanEventTitle("Try the Wheel · $75 · 1–3:30 pm")).toBe("Try the Wheel");
    expect(cleanEventTitle("make a pair that reflects your unique personality")).toBeNull();
    expect(cleanEventTitle("A very long title that has far more than six words")).toBeNull();
    expect(cleanEventTitle("22nd 1pm")).toBeNull();
    expect(eventTitleBefore(["Use this technique on mugs.", "Saturday November 14th"], 1, "")).toBeNull();
    expect(eventTitleBefore(["November", "22nd 1pm"], 1, "")).toBeNull();
  });

  test("the row says “Workshop listed on your website” when there's no title (EN + ES)", async () => {
    const m = await measurer();
    expect(texts(layoutWeeklyReportV2(DATA, m))).toContain("Workshop listed on your website");
    expect(texts(layoutWeeklyReportV2({ ...DATA, base: { ...BASE, locale: "es" } }, m))).toContain("Taller publicado en su sitio web");
  });

  test("only class businesses and event venues list dates; never another organization's event", async () => {
    expect(listingKind("tutor_education")).toBe("workshop");
    expect(listingKind("gym_fitness")).toBe("workshop");
    expect(listingKind("events")).toBe("event");
    expect(listingKind("community_center")).toBe("event");
    // Rooted On Main (a gift shop): its events page lists the town's events → post ideas.
    expect(listingKind("retail_boutique")).toBeNull();
    expect(listingKind("salon")).toBeNull();
    const rooted = ["Upcoming Events", "SALT Presents Newsies", "Saturday November 21st, 7 pm", "Holiday Pottery Night", "Friday November 20th 6 pm"];
    expect(websitePostRows({ lines: rooted }, NOW, "en").map((r) => r.title)).toEqual(["Holiday Pottery Night"]);
    const m = await measurer();
    const venue = { ...DATA, posts: { ...DATA.posts, listing: "event" } } as WeeklyReportV2Data;
    expect(texts(layoutWeeklyReportV2(venue, m))).toContain("Event listed on your website");
    expect(texts(layoutWeeklyReportV2({ ...venue, base: { ...BASE, locale: "es" } }, m))).toContain("Evento publicado en su sitio web");
  });

  test("no dates → no rows (the report uses fixed ideas by business type instead)", () => {
    expect(websitePostRows({ lines: ["About us.", "We love pottery."] }, NOW, "en")).toEqual([]);
    expect(familyPostIdeas(postFamily("tutor_education", false), "en")).toHaveLength(4);
    expect(familyPostIdeas(postFamily("bakery", true), "es")[0]).toContain("Una foto");
    for (const f of ["food", "beauty", "retail", "classes", "services"] as const) for (const idea of familyPostIdeas(f, "en")) expect(idea).not.toMatch(/\$|\d{1,2}(:\d{2})?\s*(am|pm)|undefined/i);
  });
});

describe("plan boxes follow the plan and the Google-writes switch", () => {
  test("Premium: editing and replies say Beta until launch; “headed” loses the launch line at launch", () => {
    expect(todayItems("premium", "en", false).filter((i) => i.beta).map((i) => i.text)).toEqual(["Edit your Google listing from PostScore, with undo", "Reply to your Google reviews from PostScore"]);
    expect(todayItems("premium", "en", true).some((i) => i.beta)).toBe(false);
    expect(headedItems("premium", "en", false)).toHaveLength(3);
    expect(headedItems("premium", "en", true)).toHaveLength(2);
    expect(headedItems("premium", "en", false)).toContain("Google edits and replies for every business (out of Beta)");
    expect(headedItems("premium", "es", false)).toContain("Ediciones y respuestas en Google para todos los negocios (fuera de Beta)");
    expect(todayItems("free", "en").some((i) => /Edit your Google/.test(i.text))).toBe(false);
    expect(todayItems("grow", "en").map((i) => i.text)).toContain("PostAI: 100 questions a month");
  });
});

describe("page 1: what moved", () => {
  test("same total, no check moved, no scoring update → just “No change this week” (EN + ES)", async () => {
    const m = await measurer();
    const still = { from: 83, to: 83, rows: [], scoringUpdate: null, unsplit: false };
    expect(isNoChange(still)).toBe(true);
    expect(isNoChange({ ...still, rows: [{ label: "Hours", delta: 2 }, { label: "Photos", delta: -2 }] })).toBe(false);
    expect(isNoChange({ ...still, unsplit: true })).toBe(false);
    const week = { ...DATA, firstReport: null, moved: still, base: { ...BASE, period: { from: "2026-11-06T00:00:00Z", to: "2026-11-13T00:00:00Z", days: 7, fromScore: 83, toScore: 83, comparable: true } } };
    const en = texts(layoutWeeklyReportV2(week, m));
    expect(en).toContain("No change this week");
    expect(en).not.toContain("No check changed");
    expect(en).not.toContain("Scoring update");
    expect(texts(layoutWeeklyReportV2({ ...week, base: { ...week.base, locale: "es" } }, m))).toContain("Sin cambios esta semana");
  });
});

describe("which weeks use the new layout", () => {
  test("this week from WEEKLY_REPORT_V2_FROM on; finished weeks keep the one-page report", () => {
    expect(WEEKLY_REPORT_V2_FROM).toBe("2026-11-09");
    expect(usesWeeklyReportV2("2026-11-09", false)).toBe(true);
    expect(usesWeeklyReportV2("2026-11-02", false)).toBe(false);
    expect(usesWeeklyReportV2("2026-11-09", true)).toBe(false);
  });
});
