// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const save = vi.hoisted(() => ({ saveOwnerDetails: vi.fn() }));
vi.mock("@/app/actions/ownerDetails", () => save);

import { LocaleProvider } from "@/lib/i18n";
import { closedWeek, type WeeklyHours } from "@/lib/gbpProfileEdits";
import { copyToWeekdays, DROPDOWN_ITEM_PX, DROPDOWN_LIST_PX, dropdownScrollTop, nearestQuarter, parseTypedTime, sameEveryDay, stepTime, weekFromPlacesPeriods, QUARTER_HOURS } from "@/lib/hoursEditor";
import { WeekHoursEditor } from "./WeekHoursEditor";
import { OwnerDetailsCard } from "@/components/settings/OwnerDetailsCard";
import type { OwnerDetails } from "@/lib/ownerDetails";

// The week editor shared by the Google Profile tab and Settings → "Your
// business details", clicked and typed through like an owner would.

afterEach(cleanup);

const MON = 1;
const open = (ranges: Array<[number, number]>) => ({ mode: "open" as const, ranges: ranges.map(([o, c]) => ({ open: o, close: c })) });

/** The editor with its own state; `last()` is the week it last reported. */
function renderEditor(initial: WeeklyHours, locale: "en" | "es" = "en", maxRanges = 2) {
  let latest = initial;
  function Host() {
    const [week, setWeek] = useState(initial);
    return (
      <WeekHoursEditor
        value={week}
        onChange={(w) => {
          latest = w;
          setWeek(w);
        }}
        maxRanges={maxRanges}
      />
    );
  }
  render(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      <Host />
    </LocaleProvider>
  );
  return { last: () => latest };
}
const day = (d: number) => within(screen.getByTestId(`hours-day-${d}`));
const time = (testId: string) => within(screen.getByTestId(testId)).getByRole("combobox") as HTMLInputElement;

describe("the hours rules (lib/hoursEditor.ts)", () => {
  test("15-minute steps, wrapping at midnight; every quarter hour in the dropdown", () => {
    expect(stepTime(540, 1)).toBe(555);
    expect(stepTime(540, -1)).toBe(525);
    // An off-grid typed time snaps to the next quarter.
    expect(stepTime(547, 1)).toBe(555);
    expect(stepTime(547, -1)).toBe(540);
    expect(stepTime(1425, 1)).toBe(0);
    expect(stepTime(0, -1)).toBe(1425);
    expect(QUARTER_HOURS).toHaveLength(96);
    expect(QUARTER_HOURS.slice(0, 3)).toEqual([0, 15, 30]);
  });

  test("typed times: 12-hour and 24-hour, with or without the colon", () => {
    expect(parseTypedTime("9")).toBe(540);
    expect(parseTypedTime("9:30")).toBe(570);
    expect(parseTypedTime("930")).toBe(570);
    expect(parseTypedTime("21:00")).toBe(1260);
    expect(parseTypedTime("2130")).toBe(1290);
    expect(parseTypedTime("9pm")).toBe(1260);
    expect(parseTypedTime("9:30 PM")).toBe(1290);
    expect(parseTypedTime("9:30 p. m.")).toBe(1290);
    expect(parseTypedTime("12 am")).toBe(0);
    expect(parseTypedTime("12pm")).toBe(720);
    for (const bad of ["", "25", "9:75", "13pm", "noon", "0am"]) expect(parseTypedTime(bad)).toBeNull();
  });

  test("Monday copies to the weekdays, or to every day", () => {
    const week = closedWeek().map((d, i) => (i === MON ? open([[540, 720], [780, 1020]]) : i === 6 ? open([[600, 840]]) : d));
    const weekdays = copyToWeekdays(week);
    for (const d of [1, 2, 3, 4, 5]) expect(weekdays[d]).toEqual(open([[540, 720], [780, 1020]]));
    expect(weekdays[6]).toEqual(open([[600, 840]]));
    expect(weekdays[0]).toEqual({ mode: "closed" });
    // Copies, not the same objects.
    expect(weekdays[2]).not.toBe(week[1]);
    const every = sameEveryDay(week);
    for (const d of [0, 1, 2, 3, 4, 5, 6]) expect(every[d]).toEqual(open([[540, 720], [780, 1020]]));
  });

  test("Google's live hours as the rows: split shifts, overnight, 24 hours, none", () => {
    const week = weekFromPlacesPeriods([
      { open: { day: 1, hour: 13, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
      { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 12, minute: 0 } },
      { open: { day: 5, hour: 18, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
      { open: { day: 6, hour: 0, minute: 0 }, close: { day: 0, hour: 0, minute: 0 } },
    ])!;
    expect(week[1]).toEqual(open([[540, 720], [780, 1020]]));
    expect(week[5]).toEqual(open([[1080, 120]]));
    expect(week[6]).toEqual({ mode: "open24" });
    expect(week[0]).toEqual({ mode: "closed" });
    expect(weekFromPlacesPeriods([{ open: { day: 0, hour: 0, minute: 0 } }])).toEqual(Array.from({ length: 7 }, () => ({ mode: "open24" })));
    expect(weekFromPlacesPeriods([])).toBeNull();
    expect(weekFromPlacesPeriods(null)).toBeNull();
  });
});

describe("the week editor, row by row", () => {
  test("7 rows, Monday first; the Open / Closed switch opens a day at 9–5 and closes it again", () => {
    const { last } = renderEditor(closedWeek());
    const rows = screen.getAllByTestId(/^hours-day-\d$/).map((r) => r.getAttribute("data-testid"));
    expect(rows).toEqual(["hours-day-1", "hours-day-2", "hours-day-3", "hours-day-4", "hours-day-5", "hours-day-6", "hours-day-0"]);
    const toggle = screen.getByTestId(`hours-toggle-${MON}`);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.textContent).toContain("Closed");
    fireEvent.click(toggle);
    expect(last()[MON]).toEqual(open([[540, 1020]]));
    expect(screen.getByTestId(`hours-toggle-${MON}`).getAttribute("aria-checked")).toBe("true");
    expect(time(`hours-open-${MON}-0`).value).toBe("9:00 AM");
    expect(time(`hours-close-${MON}-0`).value).toBe("5:00 PM");
    fireEvent.click(screen.getByTestId(`hours-toggle-${MON}`));
    expect(last()[MON]).toEqual({ mode: "closed" });
    expect(day(MON).queryByRole("combobox")).toBeNull();
  });

  test("time pickers: ↑ ↓ keys and the ▲ ▼ buttons move 15 minutes; typing + Enter sets it; Escape and nonsense keep it", () => {
    const { last } = renderEditor(closedWeek().map((d, i) => (i === MON ? open([[540, 1020]]) : d)));
    const opens = time(`hours-open-${MON}-0`);
    fireEvent.keyDown(opens, { key: "ArrowUp" });
    expect(last()[MON]).toEqual(open([[555, 1020]]));
    fireEvent.keyDown(opens, { key: "ArrowDown" });
    fireEvent.keyDown(opens, { key: "ArrowDown" });
    expect(last()[MON]).toEqual(open([[525, 1020]]));
    fireEvent.click(within(screen.getByTestId(`hours-close-${MON}-0`)).getByRole("button", { name: "Later" }));
    expect(last()[MON]).toEqual(open([[525, 1035]]));
    fireEvent.click(within(screen.getByTestId(`hours-close-${MON}-0`)).getByRole("button", { name: "Earlier" }));
    expect(last()[MON]).toEqual(open([[525, 1020]]));

    fireEvent.change(opens, { target: { value: "10:30 am" } });
    fireEvent.keyDown(opens, { key: "Enter" });
    expect(last()[MON]).toEqual(open([[630, 1020]]));
    expect(opens.value).toBe("10:30 AM");

    fireEvent.change(opens, { target: { value: "lunch" } });
    fireEvent.keyDown(opens, { key: "Enter" });
    expect(last()[MON]).toEqual(open([[630, 1020]]));
    expect(opens.value).toBe("10:30 AM");
    fireEvent.change(opens, { target: { value: "11" } });
    fireEvent.keyDown(opens, { key: "Escape" });
    expect(opens.value).toBe("10:30 AM");
    // Typing then leaving the field also sets it.
    fireEvent.change(opens, { target: { value: "1100" } });
    fireEvent.blur(opens);
    expect(last()[MON]).toEqual(open([[660, 1020]]));
  });

  test("one control per time: clicking the field opens the list; ▲ ▼ inside it; no separate dropdown button", () => {
    renderEditor(closedWeek().map((d, i) => (i === MON ? open([[540, 1020]]) : d)));
    const picker = within(screen.getByTestId(`hours-close-${MON}-0`));
    expect(picker.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Later", "Earlier"]);
    expect(picker.queryByRole("listbox")).toBeNull();
    fireEvent.click(time(`hours-close-${MON}-0`));
    expect(picker.getByRole("listbox")).toBeTruthy();
    expect(time(`hours-close-${MON}-0`).getAttribute("aria-expanded")).toBe("true");
    // Leaving the field, or Escape, closes it.
    fireEvent.blur(time(`hours-close-${MON}-0`));
    expect(picker.queryByRole("listbox")).toBeNull();
    fireEvent.click(time(`hours-close-${MON}-0`));
    fireEvent.keyDown(time(`hours-close-${MON}-0`), { key: "Escape" });
    expect(picker.queryByRole("listbox")).toBeNull();
    // The arrows keep the field focused (no blur on press).
    const arrows = picker.getByRole("button", { name: "Later" }).parentElement!;
    expect(fireEvent.mouseDown(arrows)).toBe(false);
  });

  test("the list opens scrolled to the current time with it highlighted (5:00 PM opens at 5:00 PM), and sets the picked time", () => {
    const { last } = renderEditor(closedWeek().map((d, i) => (i === MON ? open([[540, 1020]]) : d)));
    const picker = within(screen.getByTestId(`hours-close-${MON}-0`));
    fireEvent.click(time(`hours-close-${MON}-0`));
    const list = picker.getByRole("listbox");
    expect(picker.getAllByRole("option")).toHaveLength(96);
    const selected = picker.getByRole("option", { selected: true });
    expect(selected.textContent).toBe("5:00 PM");
    expect(selected.getAttribute("data-current")).toBe("true");
    expect(picker.getAllByRole("option", { selected: true })).toHaveLength(1);
    // Row 68 (5:00 PM) in the middle of the list.
    expect(list.scrollTop).toBe(dropdownScrollTop(68));
    expect(dropdownScrollTop(68)).toBe(68 * DROPDOWN_ITEM_PX - (DROPDOWN_LIST_PX - DROPDOWN_ITEM_PX) / 2);
    fireEvent.mouseDown(picker.getByRole("option", { name: "6:45 PM" }));
    expect(last()[MON]).toEqual(open([[540, 1125]]));
    expect(picker.queryByRole("listbox")).toBeNull();
    // Opened again: at 6:45 PM now.
    fireEvent.click(time(`hours-close-${MON}-0`));
    expect(picker.getByRole("option", { selected: true }).textContent).toBe("6:45 PM");
    expect(picker.getByRole("listbox").scrollTop).toBe(dropdownScrollTop(75));
  });

  test("the list's opening place: near the top and bottom it stays inside the list; an off-grid time highlights its nearest quarter hour", () => {
    expect(dropdownScrollTop(0)).toBe(0);
    expect(dropdownScrollTop(95)).toBe(96 * DROPDOWN_ITEM_PX - DROPDOWN_LIST_PX);
    expect(nearestQuarter(547)).toBe(540);
    expect(nearestQuarter(553)).toBe(555);
    expect(nearestQuarter(1435)).toBe(0);
    renderEditor(closedWeek().map((d, i) => (i === MON ? open([[547, 1020]]) : d)));
    const picker = within(screen.getByTestId(`hours-open-${MON}-0`));
    fireEvent.click(time(`hours-open-${MON}-0`));
    expect(picker.getByRole("option", { selected: true }).textContent).toBe("9:00 AM");
    expect(picker.getByRole("listbox").scrollTop).toBe(dropdownScrollTop(36));
  });

  test("split shift: “Add hours” adds a second slot (max 2 here), Remove takes one away", () => {
    const { last } = renderEditor(closedWeek().map((d, i) => (i === MON ? open([[540, 720]]) : d)));
    fireEvent.click(screen.getByTestId(`hours-add-${MON}`));
    expect(last()[MON]).toEqual(open([[540, 720], [780, 900]]));
    expect(screen.queryByTestId(`hours-add-${MON}`)).toBeNull();
    // 1 PM – 5 PM by typing.
    const closes = time(`hours-close-${MON}-1`);
    fireEvent.change(closes, { target: { value: "5 pm" } });
    fireEvent.keyDown(closes, { key: "Enter" });
    expect(last()[MON]).toEqual(open([[540, 720], [780, 1020]]));
    fireEvent.click(day(MON).getAllByRole("button", { name: "Remove" })[0]);
    expect(last()[MON]).toEqual(open([[780, 1020]]));
    expect(screen.getByTestId(`hours-add-${MON}`)).toBeTruthy();
  });

  test("the Google tab keeps up to 4 slots a day", () => {
    renderEditor(closedWeek().map((d, i) => (i === MON ? open([[480, 540], [600, 660], [720, 780]]) : d)), "en", 4);
    expect(screen.getByTestId(`hours-add-${MON}`)).toBeTruthy();
  });

  test("Copy to all weekdays (from Monday) and Same every day", () => {
    const { last } = renderEditor(closedWeek().map((d, i) => (i === MON ? open([[540, 720], [780, 1020]]) : d)));
    fireEvent.click(screen.getByTestId("hours-copy-weekdays"));
    expect(last().map((d) => d.mode)).toEqual(["closed", "open", "open", "open", "open", "open", "closed"]);
    expect(last()[4]).toEqual(open([[540, 720], [780, 1020]]));
    fireEvent.click(screen.getByTestId("hours-same-every-day"));
    expect(last().every((d) => JSON.stringify(d) === JSON.stringify(open([[540, 720], [780, 1020]])))).toBe(true);
    // Only Monday's row has the copy button.
    expect(day(2).queryByTestId("hours-copy-weekdays")).toBeNull();
  });

  test("overnight: a close before the open is the next day (“until 2:00 AM next day”); midnight says so; a backwards same-day time is a problem", () => {
    renderEditor(closedWeek().map((d, i) => (i === 5 ? open([[1080, 120]]) : i === 6 ? open([[1080, 0]]) : i === MON ? open([[600, 600]]) : d)));
    expect(screen.getByTestId("hours-overnight-5-0").textContent).toBe("until 2:00 AM next day");
    expect(screen.getByTestId("hours-overnight-6-0").textContent).toBe("until midnight");
    expect(day(MON).getByRole("alert").textContent).toContain("can't be the same time");
    cleanup();
    renderEditor(closedWeek().map((d, i) => (i === 5 ? open([[1080, 120]]) : d)), "es");
    expect(screen.getByTestId("hours-overnight-5-0").textContent).toMatch(/^hasta las 2:00 a\.\s?m\. del día siguiente$/);
  });

  test("open 24 hours, and Spanish words throughout", () => {
    const { last } = renderEditor(closedWeek().map((d, i) => (i === MON ? open([[540, 1020]]) : d)), "es");
    expect(screen.getByTestId(`hours-toggle-${MON}`).textContent).toContain("Abierto");
    expect(screen.getByTestId(`hours-toggle-2`).textContent).toContain("Cerrado");
    expect(screen.getByText("Igual todos los días")).toBeTruthy();
    expect(screen.getByText("Copiar a todos los días entre semana")).toBeTruthy();
    expect(time(`hours-open-${MON}-0`).value).toMatch(/^9:00 a\.\s?m\.$/);
    fireEvent.click(screen.getByTestId(`hours-24-${MON}`));
    expect(last()[MON]).toEqual({ mode: "open24" });
    expect(day(MON).queryByRole("combobox")).toBeNull();
  });
});

describe("in Settings → Your business details", () => {
  const DETAILS: OwnerDetails = { name: "Centered Clay", address: "12 Main St", phone: "", hours: { kind: "regular", week: closedWeek().map((d, i) => (i === MON ? open([[600, 1080]]) : d)) } };
  const renderCard = (details: OwnerDetails, extra: { noGoogleHours?: boolean } = {}) =>
    render(
      <LocaleProvider locale="en" timeZone="America/New_York">
        <OwnerDetailsCard businessId="b1" card={{ details, confirmedAt: null, liveUnavailable: false, noListing: false, noGoogleHours: extra.noGoogleHours ?? false }} />
      </LocaleProvider>
    );

  test("By appointment only: the note, no rows, and Confirm sends the structured choice", async () => {
    save.saveOwnerDetails.mockResolvedValue({ status: "ok", details: { ...DETAILS, hours: { kind: "appointment" } }, confirmedAt: "2026-11-17T18:00:00Z" });
    renderCard(DETAILS);
    expect(screen.getByTestId("hours-editor")).toBeTruthy();
    fireEvent.click(screen.getByTestId("hours-mode-appointment"));
    expect(screen.getByTestId("appointment-note").textContent).toBe("Customers book a time with you.");
    expect(screen.queryByTestId("hours-editor")).toBeNull();
    fireEvent.click(screen.getByTestId("confirm-owner-details"));
    expect(save.saveOwnerDetails).toHaveBeenCalledWith("b1", { name: "Centered Clay", address: "12 Main St", phone: "", hours: { kind: "appointment" } });
    expect(await screen.findByTestId("owner-details-confirmed")).toBeTruthy();
  });

  test("Regular hours send the week; switching away and back keeps the week; hours with a problem can't be confirmed", () => {
    save.saveOwnerDetails.mockReset().mockResolvedValue({ status: "error" });
    renderCard(DETAILS);
    fireEvent.click(screen.getByTestId("hours-mode-none"));
    fireEvent.click(screen.getByTestId("hours-mode-regular"));
    expect(time(`hours-open-${MON}-0`).value).toBe("10:00 AM");
    fireEvent.click(screen.getByTestId("hours-copy-weekdays"));
    fireEvent.click(screen.getByTestId("confirm-owner-details"));
    const sent = save.saveOwnerDetails.mock.calls[0][1] as { hours: { kind: string; week: WeeklyHours } };
    expect(sent.hours.kind).toBe("regular");
    expect(sent.hours.week.map((d) => d.mode)).toEqual(["closed", "open", "open", "open", "open", "open", "closed"]);
    // 10 AM – 10 AM on Monday: a problem shown on the row, and Confirm waits.
    const closes = time(`hours-close-${MON}-0`);
    fireEvent.change(closes, { target: { value: "10am" } });
    fireEvent.keyDown(closes, { key: "Enter" });
    expect(day(MON).getByRole("alert")).toBeTruthy();
    expect((screen.getByTestId("confirm-owner-details") as HTMLButtonElement).disabled).toBe(true);
  });

  test("empty Google hours: the note shows with the starting choice", () => {
    renderCard({ ...DETAILS, hours: { kind: "regular", week: closedWeek() } }, { noGoogleHours: true });
    expect(screen.getByTestId("no-google-hours").textContent).toBe("Google doesn't show hours for you yet.");
    expect(screen.getAllByRole("switch").every((s) => s.getAttribute("aria-checked") === "false")).toBe(true);
  });

  test("collapsed once confirmed: open on load while not confirmed; Confirm collapses to the summary; Edit details reopens; Cancel collapses without saving", async () => {
    save.saveOwnerDetails.mockReset().mockResolvedValue({ status: "ok", details: { ...DETAILS, hours: { kind: "appointment" } }, confirmedAt: "2026-11-17T18:00:00Z" });
    renderCard(DETAILS);
    expect(screen.getByTestId("owner-details")).toBeTruthy();
    expect(screen.queryByTestId("owner-details-summary")).toBeNull();
    fireEvent.click(screen.getByTestId("hours-mode-appointment"));
    fireEvent.click(screen.getByTestId("confirm-owner-details"));
    const summary = await screen.findByTestId("owner-details-summary");
    expect(screen.queryByTestId("owner-details")).toBeNull();
    expect(summary.textContent).toContain("Centered Clay");
    expect(summary.textContent).toContain("12 Main St");
    expect(screen.getByTestId("owner-details-hours-summary").textContent).toBe("By appointment only");
    expect(summary.textContent).toContain("Confirmed · provided by you");

    fireEvent.click(screen.getByTestId("edit-owner-details"));
    expect(screen.getByTestId("owner-details")).toBeTruthy();
    expect((screen.getByTestId("hours-mode-appointment") as HTMLInputElement).checked).toBe(true);
    // Nothing changed: Confirm waits; Cancel goes back.
    expect((screen.getByTestId("confirm-owner-details") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("owner-detail-phone"), { target: { value: "555" } });
    fireEvent.click(screen.getByTestId("cancel-owner-details"));
    expect(screen.getByTestId("owner-details-summary").textContent).not.toContain("555");
    expect(save.saveOwnerDetails).toHaveBeenCalledTimes(1);

    // Edit, change, confirm again: collapsed again with the new values.
    save.saveOwnerDetails.mockResolvedValueOnce({ status: "ok", details: { ...DETAILS, phone: "973-555-0199", hours: { kind: "appointment" } }, confirmedAt: "2026-11-17T18:05:00Z" });
    fireEvent.click(screen.getByTestId("edit-owner-details"));
    fireEvent.change(screen.getByTestId("owner-detail-phone"), { target: { value: "973-555-0199" } });
    fireEvent.click(screen.getByTestId("confirm-owner-details"));
    expect((await screen.findByTestId("owner-details-summary")).textContent).toContain("973-555-0199");
  });

  test("already confirmed: starts collapsed; a failed save stays open with the amber message, never green", async () => {
    render(
      <LocaleProvider locale="en" timeZone="America/New_York">
        <OwnerDetailsCard businessId="b1" card={{ details: DETAILS, confirmedAt: "2026-11-17T17:00:00Z", liveUnavailable: false, noListing: false, noGoogleHours: false }} />
      </LocaleProvider>
    );
    expect(screen.getByTestId("owner-details-summary")).toBeTruthy();
    expect(screen.getByTestId("owner-details-hours-summary").textContent).toBe("Mon 10:00 AM – 6:00 PM · Tue–Sun Closed");
    save.saveOwnerDetails.mockReset().mockResolvedValue({ status: "error", reason: "no row updated" });
    fireEvent.click(screen.getByTestId("edit-owner-details"));
    fireEvent.change(screen.getByTestId("owner-detail-phone"), { target: { value: "973-555-0100" } });
    fireEvent.click(screen.getByTestId("confirm-owner-details"));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't save your details right now.");
    expect(screen.getByTestId("owner-details")).toBeTruthy();
    expect(screen.queryByTestId("owner-details-confirmed")).toBeNull();
  });

  test("the Google Profile tab uses the same editor", () => {
    const tab = readFileSync("components/gbp/ProfileEditsOnGoogle.tsx", "utf8");
    expect(tab).toContain("<WeekHoursEditor value={value} onChange={onChange} maxRanges={MAX_RANGES_PER_DAY} />");
    expect(readFileSync("components/settings/OwnerDetailsCard.tsx", "utf8")).toContain("<WeekHoursEditor value={form.week}");
  });
});
