import { beforeEach, describe, expect, test, vi } from "vitest";

// Phases F and G: holiday hours (specialHours) and services (serviceItems).
// The merges keep every other value exactly as Google has it; the writes go
// through the full safety flow — run here against practice mode's fake
// Google (never the real one), with an in-memory change log.

vi.mock("server-only", () => ({}));
import { addFreeFormServices, holidaysOf, looseMatch, mergeSpecialHours, serviceNames, specialFor, upcomingHolidays, type ServiceItem, type SpecialHourPeriod } from "./gbpListingFields";
import { applyField, getFieldUndo, readFieldOnce, undoField } from "./gbpFieldWrite.server";
import { SERVICES_SPEC, SPECIAL_HOURS_SPEC } from "./gbpListingFields.server";
import { PRACTICE_PROFILE_LOCATION, practiceProfileFetch, resetPracticeProfiles, setPracticeOutcome } from "./gbpProfilePractice.server";
import { reviewRepliesPracticeOn } from "./gbpReviewPractice";
import type { GbpChangeStore } from "./gbpAttributes.server";
import type { GbpChangeRow } from "./gbpAttributes";

function memoryStore() {
  const rows: Array<GbpChangeRow & { kind: string; business_id: string }> = [];
  const log: unknown[] = [];
  const store: GbpChangeStore = {
    approvalsSince: async () => rows.filter((r) => !r.undo_of).map((r) => r.approved_at),
    rowsSince: async (_b, since, kind) => rows.filter((r) => r.approved_at >= since && (!kind || r.kind === kind)),
    insert: async (rs) => {
      rows.push(...(rs as never[]));
      return true;
    },
    setStatus: async (batch, status) => {
      rows.filter((r) => r.batch_id === batch).forEach((r) => (r.status = status));
    },
    markUndone: async (batch, at) => {
      rows.filter((r) => r.batch_id === batch).forEach((r) => (r.undone_at = at));
      return true;
    },
    editLogReady: async () => true,
    logEdit: async (row) => {
      log.push(row);
    },
  };
  return { store, rows, log };
}

const target = { businessId: "b1", userId: "u1", locationName: PRACTICE_PROFILE_LOCATION, accessToken: "practice-token", locale: "en" };
const NOW = Date.parse("2026-11-15T12:00:00Z");

describe("holiday hours", () => {
  test("the US holidays, and the ones in the next 6 weeks (Thanksgiving Nov 26 2026, Christmas Eve, Christmas)", () => {
    const y = Object.fromEntries(holidaysOf(2026).map((h) => [h.id, `${h.date.month}/${h.date.day}`]));
    expect(y).toMatchObject({ thanksgiving: "11/26", memorialDay: "5/25", laborDay: "9/7", july4: "7/4", christmasEve: "12/24", newYearsEve: "12/31" });
    expect(upcomingHolidays(new Date(NOW)).map((h) => h.id)).toEqual(["thanksgiving", "christmasEve", "christmas"]);
    expect(upcomingHolidays(new Date("2026-12-20T12:00:00Z")).map((h) => h.id)).toEqual(["christmasEve", "christmas", "newYearsEve", "newYear"]);
  });

  test("setting one holiday keeps every other special date as Google has it", () => {
    const existing: SpecialHourPeriod[] = [{ startDate: { year: 2026, month: 12, day: 24 }, closed: true }, { startDate: { year: 2026, month: 7, day: 4 }, openTime: { hours: 10 }, closeTime: { hours: 14 } }];
    const merged = mergeSpecialHours(existing, { year: 2026, month: 11, day: 26 }, { closed: true });
    expect(merged).toHaveLength(3);
    expect(specialFor(merged, { year: 2026, month: 12, day: 24 })).toEqual(existing[0]);
    expect(specialFor(merged, { year: 2026, month: 7, day: 4 })).toEqual(existing[1]);
    // The same date again replaces it, never duplicates.
    const open = mergeSpecialHours(merged, { year: 2026, month: 11, day: 26 }, { closed: false, open: { hours: 10, minutes: 0 }, close: { hours: 15, minutes: 0 } });
    expect(open).toHaveLength(3);
    expect(specialFor(open, { year: 2026, month: 11, day: 26 })).toMatchObject({ closed: false, openTime: { hours: 10 }, closeTime: { hours: 15 } });
  });
});

describe("services", () => {
  // Hair Express's real services (structured, named by the category's service types).
  const ITEMS: ServiceItem[] = [{ structuredServiceItem: { serviceTypeId: "job_type_id:balayages" } }, { structuredServiceItem: { serviceTypeId: "job_type_id:keratin_treatment" } }, { freeFormServiceItem: { category: "categories/gcid:hair_salon", label: { displayName: "Bridal hair" } } }];
  const TYPES = [{ serviceTypeId: "job_type_id:balayages", displayName: "Balayage" }, { serviceTypeId: "job_type_id:keratin_treatment", displayName: "Keratin treatments" }];

  test("names: structured by Google's service type names, free-form by their label", () => {
    expect(serviceNames(ITEMS, TYPES)).toEqual(["Balayage", "Keratin treatments", "Bridal hair"]);
    expect(serviceNames([{ structuredServiceItem: { serviceTypeId: "job_type_id:hair_coloring" } }], [])).toEqual(["Hair coloring"]);
  });

  test("adding keeps every existing service untouched, and skips names already listed", () => {
    const next = addFreeFormServices(ITEMS, TYPES, "categories/gcid:hair_salon", [{ name: "Silk press", description: "Smooth, shiny straightening" }, { name: "balayage" }, { name: "  " }]);
    expect(next.slice(0, 3)).toEqual(ITEMS);
    expect(next).toHaveLength(4);
    expect(next[3]).toEqual({ freeFormServiceItem: { category: "categories/gcid:hair_salon", label: { displayName: "Silk press", description: "Smooth, shiny straightening", languageCode: "en" } } });
  });

  test("loose matching: case, plurals and extra words don't matter", () => {
    expect(looseMatch("balayage", "Balayage highlights")).toBe(true);
    expect(looseMatch("keratin treatment", "Keratin treatments")).toBe(true);
    expect(looseMatch("perm", "Perms")).toBe(true);
    expect(looseMatch("silk press", "Hair coloring")).toBe(false);
  });
});

describe("the writes: save first, one PATCH, read back, 7-day undo (practice mode's fake Google)", () => {
  beforeEach(() => resetPracticeProfiles());
  const f = practiceProfileFetch("b1");

  test("holiday hours: Approve → Google shows it, others kept; Undo → back as before", async () => {
    const { store, rows, log } = memoryStore();
    const r = await applyField(target, SPECIAL_HOURS_SPEC, (cur) => mergeSpecialHours(cur, { year: 2026, month: 11, day: 26 }, { closed: true }), store, { fetchImpl: f, practice: true, now: NOW });
    expect(r).toMatchObject({ status: "sent", verified: true });
    expect(rows[0]).toMatchObject({ kind: "special_hours_practice", field: "specialHours", before_value: "[]", status: "sent" });
    expect(log).toHaveLength(1);
    const read = await readFieldOnce(target, SPECIAL_HOURS_SPEC, f);
    expect(read.ok && read.data.value).toHaveLength(1);
    const undo = await getFieldUndo(store, SPECIAL_HOURS_SPEC, "b1", PRACTICE_PROFILE_LOCATION, true, NOW);
    expect(undo).toMatchObject({ undoUntil: "2026-11-22T12:00:00.000Z" });
    expect(await undoField(target, SPECIAL_HOURS_SPEC, undo!.batchId, store, { fetchImpl: f, practice: true, now: NOW + 1000 })).toMatchObject({ status: "sent" });
    const after = await readFieldOnce(target, SPECIAL_HOURS_SPEC, f);
    expect(after.ok && after.data.value).toEqual([]);
  });

  test("services: Approve adds, keeps the rest; held for review is a neutral wait; refused changes nothing", async () => {
    const { store } = memoryStore();
    const add = (cur: ServiceItem[]) => addFreeFormServices(cur, [], "categories/gcid:hair_salon", [{ name: "Silk press" }]);
    expect(await applyField(target, SERVICES_SPEC, add, store, { fetchImpl: f, practice: true, now: NOW, extraMask: "categories" })).toMatchObject({ status: "sent", verified: true });
    setPracticeOutcome("b1", "hold");
    expect(await applyField(target, SERVICES_SPEC, (cur) => addFreeFormServices(cur, [], "c", [{ name: "Gloss" }]), store, { fetchImpl: f, practice: true, now: NOW + 60_000 })).toEqual({ status: "pending_review" });
    setPracticeOutcome("b1", "refuse");
    expect(await applyField(target, SERVICES_SPEC, (cur) => addFreeFormServices(cur, [], "c", [{ name: "Trim" }]), store, { fetchImpl: f, practice: true, now: NOW + 120_000 })).toMatchObject({ status: "error" });
    const read = await readFieldOnce(target, SERVICES_SPEC, f);
    expect(read.ok && serviceNames(read.data.value, [])).toEqual(["Silk press"]);
  });

  test("undo never overwrites a change someone made on Google since", async () => {
    const { store } = memoryStore();
    await applyField(target, SPECIAL_HOURS_SPEC, (cur) => mergeSpecialHours(cur, { year: 2026, month: 11, day: 26 }, { closed: true }), store, { fetchImpl: f, practice: true, now: NOW });
    const undo = await getFieldUndo(store, SPECIAL_HOURS_SPEC, "b1", PRACTICE_PROFILE_LOCATION, true, NOW);
    // Someone else sets Christmas on Google.
    await f(`https://mybusinessbusinessinformation.googleapis.com/v1/${PRACTICE_PROFILE_LOCATION}?updateMask=specialHours`, { method: "PATCH", body: JSON.stringify({ specialHours: { specialHourPeriods: [{ startDate: { year: 2026, month: 12, day: 25 }, closed: true }] } }) });
    expect(await undoField(target, SPECIAL_HOURS_SPEC, undo!.batchId, store, { fetchImpl: f, practice: true, now: NOW + 1000 })).toEqual({ status: "error", error: "changed_since" });
  });
});

describe("safety", () => {
  test("production always refuses practice mode", () => {
    expect(reviewRepliesPracticeOn({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "production" })).toBe(false);
    expect(reviewRepliesPracticeOn({ REVIEW_REPLIES_PRACTICE: "1", NODE_ENV: "development" })).toBe(true);
  });
});
