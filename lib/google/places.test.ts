import { describe, expect, test } from "vitest";
import { normalizeDetails, type RawDetailsPlace } from "./places";

describe("normalizeDetails — openingHoursPeriods", () => {
  test("periods present: stored exactly as Google returned them, no transformation", () => {
    const raw: RawDetailsPlace = {
      id: "place-1",
      regularOpeningHours: {
        weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"],
        periods: [
          { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
        ],
      },
    };
    const result = normalizeDetails(raw);
    expect(result.openingHoursPeriods).toEqual([
      { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
    ]);
  });

  test("periods absent: openingHoursPeriods is null, not an empty array or undefined", () => {
    const raw: RawDetailsPlace = {
      id: "place-2",
      regularOpeningHours: {
        weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"],
        // No `periods` field at all — Google sometimes omits it.
      },
    };
    const result = normalizeDetails(raw);
    expect(result.openingHoursPeriods).toBeNull();
  });

  test("no regularOpeningHours at all: openingHoursPeriods is null", () => {
    const raw: RawDetailsPlace = { id: "place-3" };
    const result = normalizeDetails(raw);
    expect(result.openingHoursPeriods).toBeNull();
  });

  test("an empty periods array also normalizes to null", () => {
    const raw: RawDetailsPlace = {
      id: "place-4",
      regularOpeningHours: { weekdayDescriptions: [], periods: [] },
    };
    const result = normalizeDetails(raw);
    expect(result.openingHoursPeriods).toBeNull();
  });

  test("a period that closes after midnight: close.day differs from open.day, stored as-is", () => {
    // A bar open Friday 6pm through Saturday 2am — Google represents this
    // as one period whose close.day rolls over to the next day, never
    // clamped or split by this mapping.
    const raw: RawDetailsPlace = {
      id: "place-5",
      regularOpeningHours: {
        weekdayDescriptions: ["Friday: 6:00 PM – 2:00 AM"],
        periods: [
          { open: { day: 5, hour: 18, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
        ],
      },
    };
    const result = normalizeDetails(raw);
    expect(result.openingHoursPeriods).toEqual([
      { open: { day: 5, hour: 18, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
    ]);
    expect(result.openingHoursPeriods?.[0].open?.day).toBe(5);
    expect(result.openingHoursPeriods?.[0].close?.day).toBe(6);
  });
});
