import { describe, expect, test } from "vitest";
import { diffProfileSnapshots, type ProfileSnapshot } from "./profileChanges";

const BASE: ProfileSnapshot = {
  phone: "555-1234",
  website: "https://example.com",
  openingHours: ["Mon-Fri 9-5"],
  categories: ["Restaurant"],
  photoCount: 5,
  rating: 4.5,
  reviewCount: 50,
  businessStatus: "OPERATIONAL",
};

function photoChange(previousCount: number, currentCount: number) {
  const previous: ProfileSnapshot = { ...BASE, photoCount: previousCount };
  const current: ProfileSnapshot = { ...BASE, photoCount: currentCount };
  return diffProfileSnapshots(previous, current).find((c) => c.field === "photos");
}

describe("diffProfileSnapshots — photo count", () => {
  test("reports a real exact delta when neither reading is at Google's photo-count cap", () => {
    const change = photoChange(5, 8);
    expect(change?.description).toBe("3 photos added.");
  });

  test("reports a real exact removal delta when neither reading is at the cap", () => {
    const change = photoChange(8, 5);
    expect(change?.description).toBe("3 photos were removed.");
  });

  test("crossing UP through the cap says 'now 10 or more', never an exact delta", () => {
    const change = photoChange(6, 10);
    expect(change?.description).toBe("Now 10 or more photos.");
  });

  test("crossing DOWN through the cap says 'fewer than 10 now', never an exact delta", () => {
    const change = photoChange(10, 6);
    expect(change?.description).toBe("Fewer than 10 photos now.");
  });

  test("both readings exactly at the cap (equal) report no photo change — already the natural real-world case", () => {
    const change = photoChange(10, 10);
    expect(change).toBeUndefined();
  });

  test("defensive case: both readings at/above the cap but numerically different still reports no photo change, never a false delta", () => {
    // Google's real API can never actually report more than the cap, so
    // this exact combination (both >= cap, yet unequal) shouldn't occur
    // with real data — but the guard must still hold if it ever does,
    // rather than silently computing a meaningless "delta" between two
    // lower bounds.
    const change = photoChange(10, 11);
    expect(change).toBeUndefined();
  });

  test("no entry at all when the count genuinely didn't change, below the cap", () => {
    const change = photoChange(5, 5);
    expect(change).toBeUndefined();
  });
});
