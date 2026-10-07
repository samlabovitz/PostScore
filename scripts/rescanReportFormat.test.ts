import { describe, expect, test } from "vitest";
import {
  computeSignificantChanges,
  computeTotals,
  mergeBusinessEntries,
  parseExistingReport,
  renderFullReport,
  type BusinessEntry,
} from "./rescanReportFormat";

function okEntry(overrides: Partial<BusinessEntry> = {}): BusinessEntry {
  return {
    businessId: "11111111-1111-1111-1111-111111111111",
    businessName: "Example Biz",
    status: "ok",
    beforeTotal: 80,
    afterTotal: 80,
    checks: {
      "website.has_website": { before: "full", after: "full", reason: null },
      "website.https": { before: "full", after: "full", reason: null },
      "website.performance_mobile": { before: "partial", after: "partial", reason: null },
      "website.content_depth": { before: "full", after: "full", reason: null },
      "website.contact_conversion": { before: "full", after: "full", reason: null },
      "website.about_presence": { before: "not scored", after: "not scored", reason: null },
      "website.services_presence": { before: "not scored", after: "not scored", reason: null },
    },
    ...overrides,
  };
}

describe("renderFullReport + parseExistingReport round-trip", () => {
  test("every real field survives a render -> parse round trip", () => {
    const entries: BusinessEntry[] = [
      okEntry({ businessId: "aaaa", businessName: "Blue Bottle Coffee", beforeTotal: 95, afterTotal: 79 }),
      { businessId: "bbbb", businessName: "Endless Nails", status: "failed", failReason: "Google Places details failed (500)" },
      okEntry({
        businessId: "cccc",
        businessName: "Colorful Yun Nan",
        beforeTotal: 81,
        afterTotal: 78,
        checks: {
          ...okEntry().checks!,
          "website.https": { before: "full", after: "not scored", reason: "down" },
          "website.performance_mobile": { before: "partial", after: "partial", reason: null },
        },
      }),
    ];

    const rendered = renderFullReport(entries, "2026-10-06T21:00:00.000Z", "Re-scanned 3 business(es).", "");
    const parsed = parseExistingReport(rendered);

    expect(parsed).not.toBeNull();
    expect(parsed!.entries).toHaveLength(3);
    expect(parsed!.entries[0]).toMatchObject({ businessId: "aaaa", businessName: "Blue Bottle Coffee", beforeTotal: 95, afterTotal: 79 });
    expect(parsed!.entries[1]).toMatchObject({ businessId: "bbbb", status: "failed", failReason: "Google Places details failed (500)" });
    expect(parsed!.entries[2].checks!["website.https"]).toEqual({ before: "full", after: "not scored", reason: "down" });
    expect(parsed!.trailingContent).toBe("");
  });

  test("a 'no previous score' / '?' entry round-trips as undefined, never a fabricated number", () => {
    const entries: BusinessEntry[] = [okEntry({ businessId: "new1", businessName: "Brand New Biz", beforeTotal: undefined, afterTotal: 84 })];
    const rendered = renderFullReport(entries, "2026-10-06T21:00:00.000Z", "x", "");
    const parsed = parseExistingReport(rendered)!;
    expect(parsed.entries[0].beforeTotal).toBeUndefined();
    expect(parsed.entries[0].afterTotal).toBe(84);
  });

  test("hand-written trailing content after Totals/significant-changes survives verbatim", () => {
    const entries: BusinessEntry[] = [okEntry()];
    const trailing = "## Follow-up\n\nSome real hand-written note about a retry.";
    const rendered = renderFullReport(entries, "2026-10-06T21:00:00.000Z", "x", trailing);
    const parsed = parseExistingReport(rendered)!;
    expect(parsed.trailingContent).toBe(trailing);
  });

  test("content that doesn't start with the real report header returns null, never guessed at", () => {
    expect(parseExistingReport("# Some other file\n\nrandom content")).toBeNull();
    expect(parseExistingReport("")).toBeNull();
  });
});

describe("mergeBusinessEntries — Day 4 Task B: a partial run never deletes other businesses' results", () => {
  const existing: BusinessEntry[] = [
    okEntry({ businessId: "a", businessName: "Business A", beforeTotal: 10, afterTotal: 10 }),
    okEntry({ businessId: "b", businessName: "Business B", beforeTotal: 20, afterTotal: 20 }),
    okEntry({ businessId: "c", businessName: "Business C", beforeTotal: 30, afterTotal: 30 }),
  ];

  test("re-scanning ONE business replaces only its own entry — the other two are untouched, same position", () => {
    const fresh: BusinessEntry[] = [okEntry({ businessId: "b", businessName: "Business B", beforeTotal: 20, afterTotal: 95 })];
    const merged = mergeBusinessEntries(existing, fresh);

    expect(merged).toHaveLength(3);
    expect(merged[0]).toBe(existing[0]); // business A: byte-identical object, never touched
    expect(merged[1].afterTotal).toBe(95); // business B: replaced with the fresh result
    expect(merged[2]).toBe(existing[2]); // business C: byte-identical object, never touched
  });

  test("a business failing on this run still replaces its entry (the failure itself is the fresh, honest result)", () => {
    const fresh: BusinessEntry[] = [{ businessId: "a", businessName: "Business A", status: "failed", failReason: "transient 500" }];
    const merged = mergeBusinessEntries(existing, fresh);
    expect(merged[0]).toEqual({ businessId: "a", businessName: "Business A", status: "failed", failReason: "transient 500" });
    expect(merged[1]).toBe(existing[1]);
    expect(merged[2]).toBe(existing[2]);
  });

  test("a genuinely new business (not in the existing report at all) is appended, not substituted for an existing one", () => {
    const fresh: BusinessEntry[] = [okEntry({ businessId: "z", businessName: "Brand New Biz" })];
    const merged = mergeBusinessEntries(existing, fresh);
    expect(merged).toHaveLength(4);
    expect(merged.slice(0, 3)).toEqual(existing);
    expect(merged[3].businessId).toBe("z");
  });

  test("end-to-end: render -> parse -> merge -> render again leaves the untouched businesses' rendered text byte-identical", () => {
    const original = renderFullReport(existing, "2026-10-06T20:00:00.000Z", "Re-scanned 3 business(es).", "");
    const parsed = parseExistingReport(original)!;

    const fresh: BusinessEntry[] = [okEntry({ businessId: "b", businessName: "Business B", beforeTotal: 20, afterTotal: 99 })];
    const merged = mergeBusinessEntries(parsed.entries, fresh);
    const final = renderFullReport(merged, "2026-10-06T21:00:00.000Z", "merged", parsed.trailingContent);

    expect(final).toContain("## Business A (a)");
    expect(final).toContain("Score: 10 -> 10");
    expect(final).toContain("## Business C (c)");
    expect(final).toContain("Score: 30 -> 30");
    expect(final).toContain("## Business B (b)");
    expect(final).toContain("Score: 20 -> 99");
    // The old Business B score must be gone, not just appended alongside.
    expect(final).not.toContain("Score: 20 -> 20");
  });
});

describe("computeTotals / computeSignificantChanges on a merged set", () => {
  test("totals and significant changes are recomputed from ALL entries, not just the ones just re-scanned", () => {
    const entries: BusinessEntry[] = [
      okEntry({ businessId: "a", beforeTotal: 50, afterTotal: 50 }),
      okEntry({
        businessId: "b",
        beforeTotal: 50,
        afterTotal: 65,
        checks: { ...okEntry().checks!, "website.performance_mobile": { before: "not scored", after: "partial", reason: null } },
      }),
    ];
    const totals = computeTotals(entries);
    expect(totals.total).toBe(2);
    expect(totals.measuredAfter).toBe(2);

    const changes = computeSignificantChanges(entries);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ businessName: "Example Biz", before: 50, after: 65, delta: 15 });
  });
});
