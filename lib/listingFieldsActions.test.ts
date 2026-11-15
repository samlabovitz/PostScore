import { describe, expect, test, vi } from "vitest";

// The holiday-hours and services actions only write through the
// allow-listed context: off GOOGLE_WRITES_LIVE_PLACES (canEdit false) every
// change is refused before any Google call.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const fetchSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/gbpWriteContext.server", () => ({
  googleWriteContext: async () => ({ ok: true, admin: {}, target: { businessId: "b1", userId: "u1", locationName: "locations/1", accessToken: "t", locale: "en" }, practice: false, canEdit: false, fetchImpl: fetchSpy, business: {}, markReconnect: vi.fn() }),
}));
import { applyHolidayHours, applyServices, undoHolidayHours, undoServices } from "@/app/actions/gbpListingFields";

describe("blocked when the place isn't allowed", () => {
  test("every write is refused, nothing sent to Google", async () => {
    const { upcomingHolidays } = await import("@/lib/gbpListingFields");
    const id = upcomingHolidays(new Date())[0]?.id ?? "christmas";
    const first = await applyHolidayHours("b1", id, { closed: true });
    expect(["editing_off", "invalid"]).toContain(first.status);
    expect(await applyServices("b1", [{ name: "Silk press" }])).toEqual({ status: "editing_off" });
    expect(await undoHolidayHours("b1", "batch")).toEqual({ status: "editing_off" });
    expect(await undoServices("b1", "batch")).toEqual({ status: "editing_off" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
