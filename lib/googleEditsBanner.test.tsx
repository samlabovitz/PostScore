// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

// The tab's "changed on Google" banner: plain grammar for 1 / 2 / 3+
// fields, "I know, that's right" accepts every change (nothing sent to
// Google) and the banner goes away until a NEW change; a field Google only
// filled in that matches our scan is info only; the name, the address and
// a closed listing are red with "Review" only.

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const actions = vi.hoisted(() => ({ keepAllGoogleVersions: vi.fn(async (_b: string, ids: string[]) => ({ status: "ok", kept: ids.length })), keepGoogleVersion: vi.fn(), changeGoogleEditBack: vi.fn(), reopenGoogleEditAction: vi.fn(), checkGoogleEditsNow: vi.fn(), undoMadeChange: vi.fn() }));
vi.mock("@/app/actions/gbpGoogleEdits", () => actions);
vi.mock("@/app/actions/gbpInsights", () => ({ syncGoogleNumbers: vi.fn() }));

import { GoogleEditsBanner } from "@/components/gbp/GoogleProfileTab";
import { bannerEdits, isInfoOnly, syncGoogleEdits, type GoogleEditRow } from "@/lib/gbpGoogleEdits";
import { LocaleProvider } from "@/lib/i18n";
import type { GoogleTabSaved } from "@/lib/googleProfileTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const edit = (field: GoogleEditRow["field"], over: Partial<GoogleEditRow> = {}): GoogleEditRow => ({ id: `e-${field}`, field, owner_value: "mine", google_value: "google's", detected_at: "2026-11-15T18:24:19Z", resolved_at: null, resolution: null, ...over });
const saved = (open: GoogleEditRow[], businessStatus = "OPERATIONAL") => ({ googleEdits: { available: true, open, checkedAt: null }, businessStatus }) as unknown as GoogleTabSaved;
const SCAN = { website: "https://www.hairexpressonbroadway.com/", phone: "(914) 320-3012" };
const show = (open: GoogleEditRow[], locale: "en" | "es" = "en", status = "OPERATIONAL") =>
  render(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      <GoogleEditsBanner businessId="b1" saved={saved(open, status)} scan={SCAN} />
    </LocaleProvider>
  );

describe("wording", () => {
  test("one, two, three fields — amber, with the why", () => {
    show([edit("hours")]);
    expect(screen.getByTestId("google-edits-banner").textContent).toContain("Your hours were changed on Google (Nov 15).");
    expect(screen.getByTestId("google-edits-banner").textContent).toContain("This can happen if you updated them somewhere else (like Square) or Google accepted a suggested edit.");
    expect(screen.getByTestId("google-edits-banner").getAttribute("data-tone")).toBe("amber");
    cleanup();
    show([edit("website"), edit("hours")]);
    expect(screen.getByTestId("google-edits-banner").textContent).toContain("Your hours and website were changed on Google (Nov 15).");
    cleanup();
    show([edit("website"), edit("phone"), edit("hours")]);
    expect(screen.getByTestId("google-edits-banner").textContent).toContain("Your hours, phone number and website were changed on Google (Nov 15).");
    cleanup();
    show([edit("phone")]);
    expect(screen.getByTestId("google-edits-banner").textContent).toContain("Your phone number was changed on Google (Nov 15).");
  });

  test("Spanish (usted)", () => {
    show([edit("hours")], "es");
    expect(screen.getByTestId("google-edits-banner").textContent).toContain("Sus horarios se cambiaron en Google (15 nov).");
    expect(screen.getByTestId("banner-accept").textContent).toBe("Sí, está bien");
    expect(screen.getByTestId("banner-review").textContent).toBe("Revisar");
  });
});

describe("I know, that's right", () => {
  test("accepts every change in the banner, nothing sent to Google, and the banner goes", async () => {
    show([edit("hours"), edit("phone")]);
    await act(async () => screen.getByTestId("banner-accept").click());
    expect(actions.keepAllGoogleVersions).toHaveBeenCalledWith("b1", ["e-hours", "e-phone"]);
    expect(actions.changeGoogleEditBack).not.toHaveBeenCalled();
    expect(screen.queryByTestId("google-edits-banner")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  test("a NEW change brings it back (a kept one with the same values stays quiet)", () => {
    const kept = { ...edit("hours"), resolved_at: "2026-11-15T19:00:00Z", resolution: "kept" as const };
    expect(syncGoogleEdits([], [{ field: "hours", ownerValue: "mine", googleValue: "google's" }], [kept]).create).toEqual([]);
    expect(syncGoogleEdits([], [{ field: "hours", ownerValue: "mine", googleValue: "something new" }], [kept]).create).toHaveLength(1);
  });
});

describe("info only and red cases", () => {
  test("Google added the website the owner left empty and it matches our scan: no banner", () => {
    const added = edit("website", { owner_value: null, google_value: "https://www.hairexpressonbroadway.com/" });
    expect(isInfoOnly(added, SCAN)).toBe(true);
    expect(bannerEdits([added], SCAN)).toEqual([]);
    show([added]);
    expect(screen.queryByTestId("google-edits-banner")).toBeNull();
    // A different site than our scan found is a real change.
    expect(isInfoOnly({ ...added, google_value: "https://other.example" }, SCAN)).toBe(false);
  });

  test("name or address: red, Review only", () => {
    show([edit("title")]);
    expect(screen.getByTestId("google-edits-banner").getAttribute("data-tone")).toBe("red");
    expect(screen.queryByTestId("banner-accept")).toBeNull();
    expect(screen.getByTestId("banner-review")).toBeTruthy();
    cleanup();
    show([edit("hours"), edit("address")]);
    expect(screen.queryByTestId("banner-accept")).toBeNull();
  });

  test("a closed listing: red, Review only", () => {
    show([], "en", "CLOSED_TEMPORARILY");
    expect(screen.getByTestId("google-edits-banner").textContent).toContain("Google shows your business as temporarily closed.");
    expect(screen.getByTestId("google-edits-banner").getAttribute("data-tone")).toBe("red");
    expect(screen.queryByTestId("banner-accept")).toBeNull();
  });
});
