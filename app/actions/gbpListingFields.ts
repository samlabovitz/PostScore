"use server";

// Holiday hours and services on the owner's Google listing (Premium). Opening
// only reads; only Approve and "Yes, undo" write — through
// lib/gbpFieldWrite.server.ts (save first, one PATCH, read back, 7-day
// undo). The owner, plan, practice mode and live allow list
// (GOOGLE_WRITES_LIVE_PLACES) come from googleWriteContext: off the list the
// real values load read-only and every change is refused ("editing_off").

import { googlePagePaths } from "@/lib/routes";
import { revalidatePath } from "next/cache";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import type { FieldUndo } from "@/lib/gbpFieldWrite.server";
import type { GoogleWriteContext } from "@/lib/gbpWriteContext.server";
import { addFreeFormServices, mergeSpecialHours, serviceNames, upcomingHolidays, type HolidaySetting, type Holiday, type ServiceType, type SpecialHourPeriod } from "@/lib/gbpListingFields";

type GbpEditErrorCode = import("@/lib/gbpAttributes.server").GbpEditError;
type Blocked = { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: GbpEditErrorCode };
export type FieldActionResult = { status: "sent"; verified: boolean; undo: FieldUndo | null } | { status: "pending_review"; undo: FieldUndo | null } | { status: "no_change" } | { status: "editing_off" } | Blocked | { status: "invalid" };

async function setup(businessId: string, practiceOutcome: unknown = null) {
  const { googleWriteContext } = await import("@/lib/gbpWriteContext.server");
  const c = await googleWriteContext(businessId);
  if (c.ok && c.practice) {
    const practice = await import("@/lib/gbpProfilePractice.server");
    practice.setPracticeOutcome(businessId, practice.isPracticeOutcome(practiceOutcome) ? practiceOutcome : "accept");
  }
  const [write, specs, attrs] = await Promise.all([import("@/lib/gbpFieldWrite.server"), import("@/lib/gbpListingFields.server"), import("@/lib/gbpAttributes.server")]);
  return { c, write, specs, attrs };
}

async function after(c: Extract<GoogleWriteContext, { ok: true }>, businessId: string) {
  if (c.practice) return;
  const { forgetRealListing } = await import("@/lib/gbpRealListing.server");
  forgetRealListing(businessId);
  for (const p of googlePagePaths(businessId)) revalidatePath(p);
}

function result(r: { status: string; verified?: boolean; error?: GbpEditErrorCode }, undo: FieldUndo | null): FieldActionResult {
  if (r.status === "error") return { status: "error", error: r.error! };
  if (r.status === "no_change") return { status: "no_change" };
  if (r.status === "pending_review") return { status: "pending_review", undo };
  return { status: "sent", verified: r.verified === true, undo };
}

// ---------------------------------------------------------------------------
// Holiday hours
// ---------------------------------------------------------------------------

export type OpenHolidayHoursResult = { status: "ok"; periods: SpecialHourPeriod[]; holidays: Holiday[]; canEdit: boolean; practice: boolean; undo: FieldUndo | null } | Blocked;

export async function openHolidayHours(businessId: string): Promise<OpenHolidayHoursResult> {
  const { c, write, specs, attrs } = await setup(businessId);
  if (!c.ok) return c.result;
  const read = await write.readFieldOnce(c.target, specs.SPECIAL_HOURS_SPEC, c.fetchImpl);
  if (!read.ok) {
    if (read.error === "reconnect") await c.markReconnect();
    return { status: "error", error: read.error };
  }
  const undo = await write.getFieldUndo(attrs.supabaseChangeStore(c.admin), specs.SPECIAL_HOURS_SPEC, businessId, c.target.locationName, c.practice).catch(() => null);
  return { status: "ok", periods: read.data.value, holidays: upcomingHolidays(new Date()), canEdit: c.canEdit, practice: c.practice, undo };
}

const validTime = (t: unknown): t is { hours: number; minutes: number } => {
  const x = t as { hours?: unknown; minutes?: unknown } | null;
  return !!x && Number.isInteger(x.hours) && Number.isInteger(x.minutes) && (x.hours as number) >= 0 && (x.hours as number) <= 24 && (x.minutes as number) >= 0 && (x.minutes as number) < 60;
};

/** Approve: one holiday set to closed or open with these hours, every other date kept. */
export async function applyHolidayHours(businessId: string, holidayId: string, setting: HolidaySetting, practiceOutcome: unknown = null): Promise<FieldActionResult> {
  const holiday = upcomingHolidays(new Date()).find((h) => h.id === holidayId);
  if (!holiday) return { status: "invalid" };
  if (!setting.closed && !(validTime(setting.open) && validTime(setting.close) && setting.open.hours * 60 + setting.open.minutes < setting.close.hours * 60 + setting.close.minutes)) return { status: "invalid" };
  const { c, write, specs, attrs } = await setup(businessId, practiceOutcome);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  const store = attrs.supabaseChangeStore(c.admin);
  const r = await write.applyField(c.target, specs.SPECIAL_HOURS_SPEC, (current) => mergeSpecialHours(current, holiday.date, setting.closed ? { closed: true } : { closed: false, open: setting.open, close: setting.close }), store, { fetchImpl: c.fetchImpl, practice: c.practice });
  if (r.status === "error" && r.error === "reconnect") await c.markReconnect();
  await after(c, businessId);
  return result(r, await write.getFieldUndo(store, specs.SPECIAL_HOURS_SPEC, businessId, c.target.locationName, c.practice).catch(() => null));
}

export async function undoHolidayHours(businessId: string, batchId: string, practiceOutcome: unknown = null): Promise<FieldActionResult> {
  const { c, write, specs, attrs } = await setup(businessId, practiceOutcome);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  const r = await write.undoField(c.target, specs.SPECIAL_HOURS_SPEC, batchId, attrs.supabaseChangeStore(c.admin), { fetchImpl: c.fetchImpl, practice: c.practice });
  await after(c, businessId);
  return result(r, null);
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export type OpenServicesResult = { status: "ok"; names: string[]; canEdit: boolean; practice: boolean; undo: FieldUndo | null } | Blocked;

const typesOf = (loc: Record<string, unknown>) => ((loc.categories as { primaryCategory?: { serviceTypes?: ServiceType[] }; additionalCategories?: Array<{ serviceTypes?: ServiceType[] }> } | undefined) ?? {});
const allTypes = (loc: Record<string, unknown>): ServiceType[] => {
  const c = typesOf(loc);
  return [...(c.primaryCategory?.serviceTypes ?? []), ...(c.additionalCategories ?? []).flatMap((a) => a.serviceTypes ?? [])];
};

export async function openServices(businessId: string): Promise<OpenServicesResult> {
  const { c, write, specs, attrs } = await setup(businessId);
  if (!c.ok) return c.result;
  const read = await write.readFieldOnce(c.target, specs.SERVICES_SPEC, c.fetchImpl, "categories");
  if (!read.ok) {
    if (read.error === "reconnect") await c.markReconnect();
    return { status: "error", error: read.error };
  }
  const undo = await write.getFieldUndo(attrs.supabaseChangeStore(c.admin), specs.SERVICES_SPEC, businessId, c.target.locationName, c.practice).catch(() => null);
  return { status: "ok", names: serviceNames(read.data.value, allTypes(read.data.location)), canEdit: c.canEdit, practice: c.practice, undo };
}

/** Approve: new free-form services added; every existing service kept untouched. */
export async function applyServices(businessId: string, entries: Array<{ name: string; description?: string }>, practiceOutcome: unknown = null): Promise<FieldActionResult> {
  const clean = (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e.name === "string" && e.name.trim()).slice(0, 10);
  if (clean.length === 0) return { status: "invalid" };
  const { c, write, specs, attrs } = await setup(businessId, practiceOutcome);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  const store = attrs.supabaseChangeStore(c.admin);
  const r = await write.applyField(
    c.target,
    specs.SERVICES_SPEC,
    (current, loc) => {
      const category = (typesOf(loc) as { primaryCategory?: { name?: string } }).primaryCategory?.name ?? "";
      return addFreeFormServices(current, allTypes(loc), category, clean, c.target.locale === "es" ? "es" : "en");
    },
    store,
    { fetchImpl: c.fetchImpl, practice: c.practice, extraMask: "categories" }
  );
  if (r.status === "error" && r.error === "reconnect") await c.markReconnect();
  await after(c, businessId);
  return result(r, await write.getFieldUndo(store, specs.SERVICES_SPEC, businessId, c.target.locationName, c.practice).catch(() => null));
}

export async function undoServices(businessId: string, batchId: string, practiceOutcome: unknown = null): Promise<FieldActionResult> {
  const { c, write, specs, attrs } = await setup(businessId, practiceOutcome);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  const r = await write.undoField(c.target, specs.SERVICES_SPEC, batchId, attrs.supabaseChangeStore(c.admin), { fetchImpl: c.fetchImpl, practice: c.practice, extraMask: "categories" });
  await after(c, businessId);
  return result(r, null);
}
