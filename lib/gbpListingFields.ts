// Holiday hours (Google's specialHours) and services (serviceItems): what
// the listing has, the upcoming US holidays, and the merges that change
// one thing while keeping every other value exactly as Google has it. The
// writes themselves are lib/gbpFieldWrite.server.ts. Pure.

// ---------------------------------------------------------------------------
// Holiday hours
// ---------------------------------------------------------------------------

export interface GDate {
  year: number;
  month: number;
  day: number;
}
export interface GTime {
  hours?: number;
  minutes?: number;
}
export interface SpecialHourPeriod {
  startDate: GDate;
  endDate?: GDate;
  openTime?: GTime;
  closeTime?: GTime;
  closed?: boolean;
}

export type HolidayId = "thanksgiving" | "christmasEve" | "christmas" | "newYearsEve" | "newYear" | "july4" | "memorialDay" | "laborDay";
export interface Holiday {
  id: HolidayId;
  date: GDate;
}

const nthWeekday = (year: number, month0: number, weekday: number, n: number) => {
  const first = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
};
const lastWeekday = (year: number, month0: number, weekday: number) => {
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0));
  return lastDay.getUTCDate() - ((lastDay.getUTCDay() - weekday + 7) % 7);
};

/** The US holidays of one year (fixed dates and the "nth weekday" ones). */
export function holidaysOf(year: number): Holiday[] {
  return [
    { id: "newYear", date: { year, month: 1, day: 1 } },
    { id: "memorialDay", date: { year, month: 5, day: lastWeekday(year, 4, 1) } },
    { id: "july4", date: { year, month: 7, day: 4 } },
    { id: "laborDay", date: { year, month: 9, day: nthWeekday(year, 8, 1, 1) } },
    { id: "thanksgiving", date: { year, month: 11, day: nthWeekday(year, 10, 4, 4) } },
    { id: "christmasEve", date: { year, month: 12, day: 24 } },
    { id: "christmas", date: { year, month: 12, day: 25 } },
    { id: "newYearsEve", date: { year, month: 12, day: 31 } },
  ];
}

const key = (d: GDate) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

/** The holidays from today through the next `weeks` weeks, in order. */
export function upcomingHolidays(now: Date, weeks = 6): Holiday[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = today + weeks * 7 * 86_400_000;
  return [...holidaysOf(now.getUTCFullYear()), ...holidaysOf(now.getUTCFullYear() + 1)]
    .filter((h) => {
      const at = Date.UTC(h.date.year, h.date.month - 1, h.date.day);
      return at >= today && at <= end;
    })
    .sort((a, b) => key(a.date).localeCompare(key(b.date)));
}

/** The special hours Google has for one date (null: not set). */
export function specialFor(periods: SpecialHourPeriod[], date: GDate): SpecialHourPeriod | null {
  return periods.find((p) => p.startDate && key(p.startDate) === key(date)) ?? null;
}

export type HolidaySetting = { closed: true } | { closed: false; open: GTime; close: GTime };

/** The special hours with one date set (or replaced), every other date kept as Google has it. */
export function mergeSpecialHours(periods: SpecialHourPeriod[], date: GDate, setting: HolidaySetting): SpecialHourPeriod[] {
  const others = periods.filter((p) => !p.startDate || key(p.startDate) !== key(date));
  const period: SpecialHourPeriod = setting.closed ? { startDate: date, closed: true } : { startDate: date, endDate: date, openTime: setting.open, closeTime: setting.close, closed: false };
  return [...others, period].sort((a, b) => key(a.startDate).localeCompare(key(b.startDate)));
}

export function sameSpecialHours(a: SpecialHourPeriod[], b: SpecialHourPeriod[]): boolean {
  const norm = (ps: SpecialHourPeriod[]) => JSON.stringify([...ps].map((p) => ({ s: key(p.startDate), c: !!p.closed, o: p.openTime ?? null, x: p.closeTime ?? null })).sort((x, y) => x.s.localeCompare(y.s)));
  return norm(a) === norm(b);
}

/** "9:30 AM" / "9:30" — for the row and the editor. */
export function timeText(t: GTime | undefined, locale: "en" | "es"): string {
  const h = t?.hours ?? 0;
  const m = t?.minutes ?? 0;
  if (locale === "es") return `${h}:${String(m).padStart(2, "0")}`;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export interface ServiceItem {
  structuredServiceItem?: { serviceTypeId?: string; description?: string };
  freeFormServiceItem?: { category?: string; label?: { displayName?: string; description?: string; languageCode?: string } };
  price?: unknown;
}
export interface ServiceType {
  serviceTypeId?: string;
  displayName?: string;
}

/** Every service's name, as Google shows it: structured ones by their
 * category's service type names, free-form ones by their own label. */
export function serviceNames(items: ServiceItem[], types: ServiceType[]): string[] {
  const byId = new Map(types.filter((t) => t.serviceTypeId).map((t) => [t.serviceTypeId!, t.displayName ?? t.serviceTypeId!]));
  const names = items.map((i) => (i.freeFormServiceItem?.label?.displayName ? i.freeFormServiceItem.label.displayName : i.structuredServiceItem?.serviceTypeId ? (byId.get(i.structuredServiceItem.serviceTypeId) ?? prettyId(i.structuredServiceItem.serviceTypeId)) : null));
  return names.filter((n): n is string => !!n && n.trim().length > 0);
}

/** "job_type_id:hair_coloring" → "Hair coloring" when Google didn't name it. */
function prettyId(id: string): string {
  const raw = id.replace(/^job_type_id:/, "").replace(/_/g, " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** The services with new free-form ones added at the end; every existing
 * service is kept untouched, and a name already listed is skipped. */
export function addFreeFormServices(items: ServiceItem[], types: ServiceType[], category: string, entries: Array<{ name: string; description?: string }>, languageCode = "en"): ServiceItem[] {
  const have = new Set(serviceNames(items, types).map(norm));
  const added: ServiceItem[] = [];
  for (const e of entries) {
    const name = e.name.trim().slice(0, 140);
    if (!name || have.has(norm(name))) continue;
    have.add(norm(name));
    added.push({ freeFormServiceItem: { category, label: { displayName: name, ...(e.description?.trim() ? { description: e.description.trim().slice(0, 300) } : {}), languageCode } } });
  }
  return [...items, ...added];
}

export function sameServices(a: ServiceItem[], b: ServiceItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Loose name matching for search terms and services: case, plurals and
 * extra words don't matter ("balayage" matches "Balayage highlights"). */
export function looseMatch(term: string, name: string): boolean {
  const stem = (w: string) => w.toLowerCase().replace(/[^a-z0-9áéíóúñ]/g, "").replace(/(es|s)$/, "");
  const t = term.split(/\s+/).map(stem).filter(Boolean);
  const n = name.split(/\s+/).map(stem).filter(Boolean);
  return t.length > 0 && t.every((w) => n.some((x) => x === w || x.startsWith(w) || w.startsWith(x)));
}
