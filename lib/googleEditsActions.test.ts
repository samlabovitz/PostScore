import { beforeEach, describe, expect, test, vi } from "vitest";

// "Keep Google's version" / "Change it back": keep never calls Google;
// change back sends the owner's own value through the safety flow when
// writes are allowed, is refused ("editing_off") off the live list, and is
// always done on Google for name / address / categories ("on_google").

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const h = vi.hoisted(() => ({ canEdit: true, row: null as null | Record<string, unknown>, applied: [] as unknown[], resolved: [] as string[], fetchSpy: null as unknown }));
h.fetchSpy = vi.fn();
vi.mock("@/lib/gbpWriteContext.server", () => ({
  googleWriteContext: async () => ({ ok: true, admin: {}, target: { businessId: "b1", userId: "u1", locationName: "locations/1", accessToken: "t", locale: "en" }, practice: false, canEdit: h.canEdit, fetchImpl: h.fetchSpy, business: {}, markReconnect: vi.fn() }),
}));
vi.mock("@/lib/gbpRealListing.server", () => ({ forgetRealListing: vi.fn() }));
vi.mock("@/lib/gbpAttributes.server", () => ({ supabaseChangeStore: () => ({}), call: vi.fn() }));
vi.mock("@/lib/gbpFieldWrite.server", () => ({
  applyField: async (_t: unknown, spec: { mask: string }, merge: () => unknown) => {
    h.applied.push({ mask: spec.mask, value: merge() });
    return { status: "sent", verified: true };
  },
  getFieldUndo: async () => ({ batchId: "batch1", undoUntil: "2026-11-22T12:00:00Z" }),
}));
vi.mock("@/lib/gbpGoogleEdits.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gbpGoogleEdits.server")>("@/lib/gbpGoogleEdits.server");
  return {
    REVERT_SPECS: actual.REVERT_SPECS,
    openGoogleEdit: async () => h.row,
    readOwnerValue: async () => ({ ok: true, value: { primaryPhone: "(914) 320-3012" } }),
    resolveGoogleEdit: async (_a: unknown, _b: string, id: string, how: string) => {
      h.resolved.push(`${id}:${how}`);
      return h.row;
    },
  };
});
import { changeGoogleEditBack, keepGoogleVersion } from "@/app/actions/gbpGoogleEdits";

const edit = (field: string) => ({ id: "e1", field, owner_value: "(914) 320-3012", google_value: "(914) 555-0100", detected_at: "2026-11-15T00:00:00Z", resolved_at: null, resolution: null });

beforeEach(() => {
  h.canEdit = true;
  h.applied = [];
  h.resolved = [];
});

describe("Google's own edits: keep or change back", () => {
  test("keep: the row closes as kept, nothing sent to Google", async () => {
    h.row = edit("phone");
    expect(await keepGoogleVersion("b1", "e1")).toEqual({ status: "ok" });
    expect(h.resolved).toEqual(["e1:kept"]);
    expect(h.applied).toEqual([]);
  });

  test("change back (allowed): the owner's phone is sent with updateMask phoneNumbers, with undo", async () => {
    h.row = edit("phone");
    const r = await changeGoogleEditBack("b1", "e1");
    expect(r).toEqual({ status: "sent", verified: true, undo: { batchId: "batch1", undoUntil: "2026-11-22T12:00:00Z" } });
    expect(h.applied).toEqual([{ mask: "phoneNumbers", value: { primaryPhone: "(914) 320-3012" } }]);
    expect(h.resolved).toEqual(["e1:changed_back"]);
  });

  test("change back (read-only): refused, nothing sent — the tab shows the steps on Google", async () => {
    h.canEdit = false;
    h.row = edit("phone");
    expect(await changeGoogleEditBack("b1", "e1")).toEqual({ status: "editing_off" });
    expect(h.applied).toEqual([]);
    expect(h.resolved).toEqual([]);
  });

  test("name / address / categories: always on Google", async () => {
    for (const f of ["title", "address", "categories"]) {
      h.row = edit(f);
      expect(await changeGoogleEditBack("b1", "e1")).toEqual({ status: "on_google" });
    }
    expect(h.applied).toEqual([]);
  });

  test("a row that's already closed (or someone else's) isn't found", async () => {
    h.row = null;
    expect(await keepGoogleVersion("b1", "e1")).toEqual({ status: "not_found" });
    expect(await changeGoogleEditBack("b1", "e1")).toEqual({ status: "not_found" });
  });
});
