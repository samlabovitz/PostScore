// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// The one "two versions" choice (components/gbp/CompareVersions.tsx) in
// both uses — section 6's Google edits and the hours-mismatch chooser —
// clicked through like an owner would. Actions are stubbed: nothing calls
// Google.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const edits = vi.hoisted(() => ({
  keepGoogleVersion: vi.fn(async () => ({ status: "ok" })),
  changeGoogleEditBack: vi.fn(async () => ({ status: "sent", verified: true, undo: null })),
  reopenGoogleEditAction: vi.fn(async () => ({ status: "ok" })),
  checkGoogleEditsNow: vi.fn(),
  undoMadeChange: vi.fn(),
}));
vi.mock("@/app/actions/gbpGoogleEdits", () => edits);
vi.mock("@/app/actions/hoursChooser", () => ({ openHoursCompare: vi.fn() }));
vi.mock("@/app/actions/gbpInsights", () => ({ syncGoogleNumbers: vi.fn() }));

import { GoogleEditItem } from "@/components/gbp/GoogleProfileTab";
import { HoursComparePanel } from "@/components/hours/HoursMismatchChooser";
import { LocaleProvider } from "@/lib/i18n";
import { versionsOfEdit, versionsOfHours, watchedSummary } from "@/lib/compareVersions";
import { weekFromSite } from "@/lib/gbpProfileEdits";
import type { GoogleEditRow } from "@/lib/gbpGoogleEdits";
import type { OpenHoursCompareResult } from "@/app/actions/hoursChooser";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

const wrap = (ui: React.ReactNode, locale: "en" | "es" = "en") => render(<LocaleProvider locale={locale} timeZone="America/New_York">{ui}</LocaleProvider>);

// Hair Express, live: Google shows Tue–Thu 10–5 / Fri 10–6; the owner entered Tue–Wed 9:30–5 / Thu–Fri 9:30–6.
const OWNER_HOURS = "0|c\n1|570-1020\n2|570-1020\n3|570-1080\n4|570-1080\n5|540-1020\n6|660-960";
const GOOGLE_HOURS = "0|c\n1|600-1020\n2|600-1020\n3|600-1020\n4|600-1080\n5|540-1020\n6|660-960";
const hoursEdit: GoogleEditRow = { id: "e1", field: "hours", owner_value: OWNER_HOURS, google_value: GOOGLE_HOURS, detected_at: "2026-11-15T18:24:19Z", resolved_at: null, resolution: null };
const websiteEdit: GoogleEditRow = { id: "e2", field: "website", owner_value: null, google_value: "https://www.hairexpressonbroadway.com/", detected_at: "2026-11-15T18:24:19Z", resolved_at: null, resolution: null };
const phoneEdit: GoogleEditRow = { id: "e3", field: "phone", owner_value: "(914) 320-3012", google_value: "(914) 555-0100", detected_at: "2026-11-15T18:24:19Z", resolved_at: null, resolution: null };

const differing = (side: "google" | "mine") => Array.from(screen.getByTestId(`version-${side}`).querySelectorAll('[data-differs="true"]')).map((li) => li.textContent);

describe("day diff highlighting", () => {
  test("the differing days are marked in BOTH cards, the matching ones aren't", () => {
    const v = versionsOfEdit("hours", GOOGLE_HOURS, OWNER_HOURS, "en");
    expect(v.kind === "days" && v.days.filter((d) => d.differs).map((d) => d.label)).toEqual(["Tuesday", "Wednesday", "Thursday", "Friday"]);
    wrap(<GoogleEditItem businessId="b1" edit={hoursEdit} canEdit practice={false} />);
    expect(differing("google")).toEqual(["Tuesday10:00 AM – 5:00 PM", "Wednesday10:00 AM – 5:00 PM", "Thursday10:00 AM – 5:00 PM", "Friday10:00 AM – 6:00 PM"]);
    expect(differing("mine")).toEqual(["Tuesday9:30 AM – 5:00 PM", "Wednesday9:30 AM – 5:00 PM", "Thursday9:30 AM – 6:00 PM", "Friday9:30 AM – 6:00 PM"]);
    expect(screen.getByText("Google changed your hours. Which is right?")).toBeTruthy();
    expect(document.body.innerHTML).not.toContain("line-through");
  });

  test("hours chooser: Google's week vs the website's", () => {
    const site = weekFromSite([1, 2, 3, 4, 5].map((day) => ({ day, closed: false, open: 9 * 60, close: 17 * 60 })));
    const google = weekFromSite([1, 2, 3, 4].map((day) => ({ day, closed: false, open: 9 * 60, close: 17 * 60 })));
    const v = versionsOfHours(google, site, "en");
    expect(v.kind === "days" && v.days.filter((d) => d.differs).map((d) => d.label)).toEqual(["Friday"]);
    expect(v.kind === "days" && v.days.find((d) => d.label === "Friday")).toMatchObject({ google: "Closed", mine: "9:00 AM – 5:00 PM" });
  });
});

describe("section 6: Keep Google's version / Keep your version", () => {
  test("Keep Google's version: nothing sent to Google", async () => {
    wrap(<GoogleEditItem businessId="b1" edit={phoneEdit} canEdit practice={false} />);
    expect(screen.getByText("Nothing changes on Google.")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByTestId("keep-google")));
    expect(edits.keepGoogleVersion).toHaveBeenCalledWith("b1", "e3");
    expect(edits.changeGoogleEditBack).not.toHaveBeenCalled();
  });

  test("writes allowed: preview → Approve sends it (safety flow + undo)", async () => {
    wrap(<GoogleEditItem businessId="b1" edit={phoneEdit} canEdit practice={false} />);
    expect(screen.getByText("We'll update Google for you (preview, approve, undo for 7 days).")).toBeTruthy();
    fireEvent.click(screen.getByTestId("change-back"));
    expect(screen.getByTestId("change-back-preview").textContent).toContain("(914) 320-3012");
    expect(edits.changeGoogleEditBack).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByTestId("approve-change-back")));
    expect(edits.changeGoogleEditBack).toHaveBeenCalledWith("b1", "e3", null);
  });

  test("read-only: the steps on Google + Open on Google + Copy, nothing sent", () => {
    wrap(<GoogleEditItem businessId="b1" edit={hoursEdit} canEdit={false} practice={false} />);
    expect(screen.getByText("We'll show you how to change it on Google.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("change-back"));
    const guide = screen.getByTestId("change-back-guide");
    expect(guide.textContent).toContain("Open on Google ↗");
    expect(guide.textContent).toContain("Tuesday: 9:30 AM – 5:00 PM");
    expect(screen.getByTestId("copy-value").textContent).toBe("Copy these hours");
    expect(edits.changeGoogleEditBack).not.toHaveBeenCalled();
  });

  test("Google added a website the owner never entered: both cards, (none), Change on Google", () => {
    wrap(<GoogleEditItem businessId="b1" edit={websiteEdit} canEdit practice={false} />);
    expect(screen.getByTestId("version-google").textContent).toContain("https://www.hairexpressonbroadway.com/");
    expect(screen.getByTestId("version-mine").textContent).toContain("(none)");
    expect(screen.getByTestId("change-back").textContent).toBe("Change on Google");
    fireEvent.click(screen.getByTestId("change-back"));
    expect(screen.getByTestId("change-back-guide")).toBeTruthy();
    expect(edits.changeGoogleEditBack).not.toHaveBeenCalled();
  });

  test("after a choice: one line with the date and Change", async () => {
    wrap(<GoogleEditItem businessId="b1" edit={{ ...phoneEdit, resolved_at: "2026-11-15T19:00:00Z", resolution: "kept" }} canEdit practice={false} />);
    expect(screen.getByTestId("version-chosen").textContent).toContain("✓ You confirmed Google's version · Nov 15");
    expect(screen.queryByTestId("version-google")).toBeNull();
    await act(async () => fireEvent.click(screen.getByTestId("version-change")));
    expect(edits.reopenGoogleEditAction).toHaveBeenCalledWith("b1", "e3");
  });

  test("Spanish (usted)", () => {
    wrap(<GoogleEditItem businessId="b1" edit={phoneEdit} canEdit={false} practice={false} />, "es");
    expect(screen.getByText("Google cambió su teléfono. ¿Cuál es el correcto?")).toBeTruthy();
    expect(screen.getByText("Mantener la versión de Google")).toBeTruthy();
    expect(screen.getByText("Le mostraremos cómo cambiarlo en Google.")).toBeTruthy();
  });
});

describe("section 6 hours: Google's version vs the website's", () => {
  // Hair Express's site (last scan): Tue–Fri 9:30–5, Sat 9–5, Sun 11–4, Mon closed.
  const siteWeek = weekFromSite([2, 3, 4, 5].map((day) => ({ day, closed: false, open: 570, close: 1020 })).concat([{ day: 6, closed: false, open: 540, close: 1020 }, { day: 0, closed: false, open: 660, close: 960 }]))!;
  const website = { week: siteWeek, builder: { id: "square" as const, name: "Square Online" }, siteUrl: "https://hairexpressonbroadway.com/", managedEmail: null };

  test("the website's hours on the right, differing days marked in both, and what the owner entered on Google", () => {
    wrap(<GoogleEditItem businessId="b1" edit={hoursEdit} canEdit practice={false} website={website} />);
    expect(screen.getByTestId("version-mine").textContent).toContain("Website's version");
    expect(differing("google")).toEqual(["Tuesday10:00 AM – 5:00 PM", "Wednesday10:00 AM – 5:00 PM", "Thursday10:00 AM – 5:00 PM", "Friday10:00 AM – 6:00 PM"]);
    expect(differing("mine")).toEqual(["Tuesday9:30 AM – 5:00 PM", "Wednesday9:30 AM – 5:00 PM", "Thursday9:30 AM – 5:00 PM", "Friday9:30 AM – 5:00 PM"]);
    // The owner's own entry (Thu–Fri 9:30–6) matches neither: one small line.
    expect(screen.getByTestId("you-entered").textContent).toBe("You entered on Google: Mon closed · Tue–Wed 9:30 AM – 5:00 PM · Thu–Fri 9:30 AM – 6:00 PM · Sat 9:00 AM – 5:00 PM · Sun 11:00 AM – 4:00 PM");
    expect(screen.queryByTestId("no-site-hours")).toBeNull();
  });

  test("no extra line when the owner's entry matches the website", () => {
    const sameAsSite = "0|c\n1|570-1020\n2|570-1020\n3|570-1020\n4|570-1020\n5|540-1020\n6|660-960";
    wrap(<GoogleEditItem businessId="b1" edit={{ ...hoursEdit, owner_value: sameAsSite }} canEdit practice={false} website={website} />);
    expect(screen.queryByTestId("you-entered")).toBeNull();
  });

  test("Keep website's version: writes allowed → the hours editor with the website's hours; read-only → the steps on Google", () => {
    wrap(<GoogleEditItem businessId="b1" edit={hoursEdit} canEdit practice={false} website={website} />);
    expect(screen.getByTestId("keep-website").textContent).toBe("Keep website's version");
    fireEvent.click(screen.getByTestId("keep-website"));
    expect(screen.getByTestId("open-hours-editor").getAttribute("href")).toBe("#edit-hours?use=website");
    cleanup();
    wrap(<GoogleEditItem businessId="b1" edit={hoursEdit} canEdit={false} practice={false} website={website} />);
    fireEvent.click(screen.getByTestId("keep-website"));
    const steps = screen.getByTestId("fix-google-steps");
    expect(steps.textContent).toContain("Open on Google ↗");
    expect(steps.textContent).toContain("Tuesday: 9:30 AM – 5:00 PM");
    expect(edits.changeGoogleEditBack).not.toHaveBeenCalled();
  });

  test("Keep Google's version: kept, then how to update the website with Google's hours", async () => {
    wrap(<GoogleEditItem businessId="b1" edit={hoursEdit} canEdit practice={false} website={website} />);
    expect(screen.getByText("We'll show you how to update your website.")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByTestId("keep-google")));
    expect(edits.keepGoogleVersion).toHaveBeenCalledWith("b1", "e1");
    const fix = screen.getByTestId("fix-website");
    expect(fix.textContent).toContain("Update the hours on Square Online");
    expect(fix.textContent).toContain("Tuesday: 10:00 AM – 5:00 PM");
  });

  test("no hours read on the website: falls back to Your version with the note", () => {
    wrap(<GoogleEditItem businessId="b1" edit={hoursEdit} canEdit practice={false} website={{ ...website, week: null }} />);
    expect(screen.getByTestId("version-mine").textContent).toContain("Your version");
    expect(screen.getByTestId("no-site-hours").textContent).toBe("We couldn't read hours on your website.");
  });

  test("Spanish (usted) labels, the same in the hours chooser", () => {
    wrap(<GoogleEditItem businessId="b1" edit={hoursEdit} canEdit={false} practice={false} website={website} />, "es");
    expect(screen.getByTestId("version-mine").textContent).toContain("Versión de su sitio web");
    expect(screen.getByTestId("keep-website").textContent).toBe("Conservar la versión de su sitio web");
  });
});

describe("hours chooser: routing", () => {
  const view = (over: Partial<Extract<OpenHoursCompareResult, { status: "ok" }>> = {}): OpenHoursCompareResult => ({
    status: "ok",
    google: weekFromSite([1, 2, 3, 4].map((day) => ({ day, closed: false, open: 10 * 60, close: 17 * 60 }))),
    googleLines: null,
    live: true,
    site: weekFromSite([1, 2, 3, 4, 5].map((day) => ({ day, closed: false, open: 9 * 60 + 30, close: 17 * 60 }))),
    builder: { id: "square", name: "Square Online" },
    siteUrl: "https://hairexpressonbroadway.com/",
    canEdit: true,
    tab: true,
    managedEmail: null,
    ...over,
  });

  test("Keep website's hours (writes allowed) → the hours editor with the website's hours", () => {
    wrap(<HoursComparePanel businessId="b1" initialView={view()} />);
    expect(screen.getByText("Your Google listing and website show different hours. Which is right?")).toBeTruthy();
    expect(screen.getByTestId("version-mine").textContent).toContain("Website's version");
    expect(screen.getByTestId("choice-website").textContent).toBe("Keep website's version");
    fireEvent.click(screen.getByTestId("choice-website"));
    expect(screen.getByTestId("open-hours-editor").getAttribute("href")).toBe("/business/b1/growth?tab=google#edit-hours?use=website");
    expect(screen.queryByTestId("fix-website")).toBeNull();
    expect(screen.getByTestId("version-chosen").textContent).toContain("✓ You kept your website's hours");
  });

  test("Keep website's hours (read-only) → the steps on Google", () => {
    wrap(<HoursComparePanel businessId="b1" initialView={view({ canEdit: false })} />);
    expect(screen.getByText("We'll show you how to change it on Google.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("choice-website"));
    const steps = screen.getByTestId("fix-google-steps");
    expect(steps.textContent).toContain("Change your hours on Google (2 min)");
    expect(steps.textContent).toContain("Open on Google ↗");
    expect(steps.textContent).toContain("Monday: 9:30 AM – 5:00 PM");
  });

  test("Keep Google's version → only the website steps for the builder, never Google", () => {
    wrap(<HoursComparePanel businessId="b1" initialView={view()} />);
    fireEvent.click(screen.getByTestId("choice-google"));
    const fix = screen.getByTestId("fix-website");
    expect(fix.textContent).toContain("Update the hours on Square Online");
    expect(fix.textContent).toContain("Friday: Closed");
    expect(screen.queryByTestId("open-hours-editor")).toBeNull();
    expect(screen.queryByTestId("fix-google-steps")).toBeNull();
    // Collapsed, remembered, and "Change" brings the two cards back.
    expect(screen.getByTestId("version-chosen").textContent).toContain("✓ You kept Google's version");
    expect(JSON.parse(window.localStorage.getItem("postscore.hoursChoice.b1")!).choice).toBe("google");
    fireEvent.click(screen.getByTestId("version-change"));
    expect(screen.getByTestId("version-google")).toBeTruthy();
    expect(window.localStorage.getItem("postscore.hoursChoice.b1")).toBeNull();
  });

  test("Neither is right → the owner's hours, then both fixes", () => {
    wrap(<HoursComparePanel businessId="b1" initialView={view()} />);
    fireEvent.click(screen.getByTestId("choice-own"));
    expect(screen.getByTestId("own-hours")).toBeTruthy();
    fireEvent.click(screen.getByTestId("own-continue"));
    expect(screen.getByTestId("fix-website")).toBeTruthy();
    expect(screen.getByTestId("open-hours-editor").getAttribute("href")).toBe("/business/b1/growth?tab=google#edit-hours?use=own");
  });
});

describe("section 6 summary", () => {
  test("never Unchanged while Google's edits are listed", () => {
    expect(watchedSummary([], ["hours", "website"])).toEqual(["hours", "website"]);
    expect(watchedSummary(["phone"], ["title", "categories"])).toEqual(["name", "phone"]);
    expect(watchedSummary([], [])).toEqual([]);
  });
});
