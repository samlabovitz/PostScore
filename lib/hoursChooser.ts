// "Your website and Google listing show different hours": the shared
// chooser (components/hours/HoursMismatchChooser.tsx) — a day-by-day table,
// "Which hours are correct?", and only the fix for the other side. The
// owner's choice is remembered in this browser until a scan shows the hours
// match, then it's Done ✓. Points never change here. Pure.

import { WEEK_ORDER, formatTime, type DayHours, type WeeklyHours } from "@/lib/gbpProfileEdits";

export type HoursChoice = "website" | "google" | "own";

const WORDS = {
  en: { closed: "Closed", open24: "Open 24 hours", days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], none: "Not listed" },
  es: { closed: "Cerrado", open24: "Abierto 24 horas", days: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"], none: "No aparece" },
};

export function dayText(d: DayHours | null | undefined, locale: "en" | "es"): string {
  const w = WORDS[locale];
  if (!d) return w.none;
  if (d.mode === "closed") return w.closed;
  if (d.mode === "open24") return w.open24;
  return d.ranges.map((r) => `${formatTime(r.open, locale)} – ${formatTime(r.close, locale)}`).join(", ");
}

export const dayName = (day: number, locale: "en" | "es") => WORDS[locale].days[day];

const norm = (d: DayHours | null | undefined) => (d ? JSON.stringify(d.mode === "open" ? { m: "open", r: d.ranges.map((r) => [r.open, r.close]).sort((a, b) => a[0] - b[0]) } : { m: d.mode }) : "none");

export interface CompareRow {
  day: number;
  google: string;
  site: string;
  differs: boolean;
}

/** Monday first. `googleLines`: Google's own words per day (Places
 * weekdayDescriptions, "Monday: 9:30 AM – 5:00 PM") when the listing
 * couldn't be read live — then a day differs when the words differ. */
export function compareRows(google: WeeklyHours | null, site: WeeklyHours | null, locale: "en" | "es", googleLines: string[] | null = null): CompareRow[] {
  return WEEK_ORDER.map((day) => {
    const siteText = dayText(site?.[day], locale);
    if (!google && googleLines) {
      const line = googleLines.find((l) => l.toLowerCase().startsWith(WORDS.en.days[day].toLowerCase()));
      const g = line ? line.replace(/^[^:]+:\s*/, "").replace(/ | /g, " ").trim() : WORDS[locale].none;
      const loose = (s: string) => s.toLowerCase().replace(/[\s–—-]+/g, "").replace(/:00/g, "");
      return { day, google: g, site: siteText, differs: loose(g) !== loose(dayText(site?.[day], "en")) };
    }
    return { day, google: dayText(google?.[day], locale), site: siteText, differs: norm(google?.[day]) !== norm(site?.[day]) };
  });
}

/** "Monday: 9:30 AM – 5:00 PM" lines, Monday first — what "Copy these hours" copies. */
export function hoursLines(week: WeeklyHours | null, locale: "en" | "es"): string[] {
  if (!week) return [];
  return WEEK_ORDER.map((day) => `${WORDS[locale].days[day].replace(/^./, (c) => c.toUpperCase())}: ${dayText(week[day], locale)}`);
}

/** Which fixes show: the other side only, never the side the owner says is right. */
export function fixesFor(choice: HoursChoice | null): { google: boolean; website: boolean } {
  if (choice === "website") return { google: true, website: false };
  if (choice === "google") return { google: false, website: true };
  if (choice === "own") return { google: true, website: true };
  return { google: false, website: false };
}

// ---------------------------------------------------------------------------
// The remembered choice (this browser): until a scan shows the hours match.
// ---------------------------------------------------------------------------

export const choiceKey = (businessId: string) => `postscore.hoursChoice.${businessId}`;

export interface StoredChoice {
  choice: HoursChoice;
  at: string;
}

export function parseStoredChoice(raw: string | null | undefined): StoredChoice | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredChoice>;
    return v && (v.choice === "website" || v.choice === "google" || v.choice === "own") && typeof v.at === "string" ? { choice: v.choice, at: v.at } : null;
  } catch {
    return null;
  }
}

/** "done": a choice was made and the latest scan no longer finds a
 * mismatch; "chosen": still waiting for a scan; "none": nothing chosen. */
export function choiceState(stored: StoredChoice | null, mismatchNow: boolean): "done" | "chosen" | "none" {
  if (!stored) return "none";
  return mismatchNow ? "chosen" : "done";
}

// ---------------------------------------------------------------------------
// A site PostScore / SL Digital manages: MANAGED_SITE_HOSTS (comma-separated
// hostnames), with MANAGED_SITE_CONTACT_EMAIL for "Or ask Sam to update it".
// ---------------------------------------------------------------------------

export function managedSiteContact(siteUrl: string | null | undefined, env: { MANAGED_SITE_HOSTS?: string; MANAGED_SITE_CONTACT_EMAIL?: string } = {}): string | null {
  const email = env.MANAGED_SITE_CONTACT_EMAIL?.trim();
  if (!siteUrl || !email) return null;
  let host: string;
  try {
    host = new URL(siteUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
  const hosts = (env.MANAGED_SITE_HOSTS ?? "").split(",").map((h) => h.trim().replace(/^www\./, "").toLowerCase()).filter(Boolean);
  return hosts.includes(host) ? email : null;
}

// ---------------------------------------------------------------------------
// Handing the hours to the Google Profile tab's hours editor:
// "#edit-hours?use=website" (the website's hours) or "#edit-hours?use=own"
// (the owner's own, kept in this tab's sessionStorage under ownHoursKey).
// ---------------------------------------------------------------------------

export const ownHoursKey = (businessId: string) => `postscore.hoursOwn.${businessId}`;

export function startHoursFromHash(hash: string, readOwn: () => string | null): "website" | WeeklyHours | null {
  const use = new URLSearchParams(hash.split("?")[1] ?? "").get("use");
  if (use === "website") return "website";
  if (use !== "own") return null;
  try {
    const week = JSON.parse(readOwn() ?? "null") as WeeklyHours | null;
    return Array.isArray(week) && week.length === 7 ? week : null;
  } catch {
    return null;
  }
}
