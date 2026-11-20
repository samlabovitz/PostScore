// Server-only. Day 23E, "Answer your customers' common questions": what
// the listing has now (read live — Premium through googleWriteContext, so
// practice mode reads its fake Google; Grow through the real listing read,
// read-only) and, on Premium, applying the owner's answers in ONE sitting
// (one approval, lib/gbpAttributes.ts inSitting) through the existing
// writers — the description (lib/gbpProfileEdits.server.ts), services with
// prices (lib/gbpFieldWrite.server.ts) and customer details
// (lib/gbpAttributes.server.ts). Each keeps its own 7-day undo. Nothing is
// sent unless the owner approved it.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoogleWriteContext } from "@/lib/gbpWriteContext.server";
import type { CustomerDetailsEditorRow, AttrValue } from "@/lib/gbpAttributes";
import type { ServiceItem, ServiceType } from "@/lib/gbpListingFields";
import type { DetailPart } from "@/lib/googleAnswers";

type Ctx = Extract<GoogleWriteContext, { ok: true }>;

export interface AnswersListing {
  description: string | null;
  services: Array<{ name: string; googlePrice: number | null }>;
  /** Parking, accessibility and payment rows only. */
  details: Array<{ id: string; part: DetailPart; label: string; current: AttrValue }>;
}

const DETAIL: readonly string[] = ["parking", "accessibility", "payment"];

const moneyAmount = (p: unknown): number | null => {
  const m = p as { units?: string | number; nanos?: number } | null | undefined;
  if (!m || (m.units === undefined && m.nanos === undefined)) return null;
  const n = Number(m.units ?? 0) + (m.nanos ?? 0) / 1e9;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

type Cats = { primaryCategory?: { name?: string; serviceTypes?: ServiceType[] }; additionalCategories?: Array<{ serviceTypes?: ServiceType[] }> };
export const serviceTypesOf = (loc: Record<string, unknown>): ServiceType[] => {
  const c = (loc.categories as Cats | undefined) ?? {};
  return [...(c.primaryCategory?.serviceTypes ?? []), ...(c.additionalCategories ?? []).flatMap((a) => a.serviceTypes ?? [])];
};

async function servicesFrom(items: ServiceItem[], types: ServiceType[]) {
  const { serviceNames } = await import("@/lib/gbpListingFields");
  return items.map((i) => ({ name: serviceNames([i], types)[0] ?? "", googlePrice: moneyAmount(i.price) })).filter((s) => s.name);
}

const detailRows = (rows: CustomerDetailsEditorRow[]) => rows.filter((r) => DETAIL.includes(r.part)).map((r) => ({ id: r.id, part: r.part as DetailPart, label: r.label, current: r.current }));

/** Premium (practice-aware): description, services and customer details as Google has them now. */
export async function readAnswersWith(c: Ctx): Promise<AnswersListing | null> {
  const [{ readLiveProfile }, write, specs, attrs] = await Promise.all([import("@/lib/gbpProfileEdits.server"), import("@/lib/gbpFieldWrite.server"), import("@/lib/gbpListingFields.server"), import("@/lib/gbpAttributes.server")]);
  const [profile, services, details] = await Promise.all([
    readLiveProfile(c.target, c.fetchImpl),
    write.readFieldOnce(c.target, specs.SERVICES_SPEC, c.fetchImpl, "categories"),
    attrs.loadCustomerDetailsEditor(c.target, c.fetchImpl),
  ]);
  if (!profile.ok || !services.ok) return null;
  return {
    description: profile.data.description.value,
    services: await servicesFrom(services.data.value, serviceTypesOf(services.data.location)),
    details: details.status === "ok" ? detailRows(details.rows) : [],
  };
}

/** Grow (a connected listing, read-only): the same, from the real listing read. */
export async function readAnswersReal(admin: SupabaseClient, businessId: string): Promise<AnswersListing | null> {
  const { readRealListingCached } = await import("@/lib/gbpRealListing.server");
  const read = await readRealListingCached(admin, businessId).catch(() => null);
  if (!read?.ok) return null;
  const { customerDetailsEditorRows } = await import("@/lib/gbpAttributes");
  const loc = read.listing.location as unknown as Record<string, unknown>;
  return {
    description: read.listing.location.profile?.description ?? null,
    services: await servicesFrom((read.listing.location.serviceItems ?? []) as ServiceItem[], serviceTypesOf(loc)),
    details: (read.listing.offered ?? []).length ? detailRows(customerDetailsEditorRows(read.listing.offered!, read.listing.attributes as never, [])) : [],
  };
}

export interface AnswersPayload {
  description?: string | null;
  services?: Array<{ name: string; price: number | null }> | null;
  details?: Record<string, boolean> | null;
  /** Words the owner chose to keep as written ("Did you mean…?" → Keep). */
  keep?: string[] | null;
}

export type PartResult =
  | { status: "sent" | "pending_review" | "no_change"; undoBatchId: string | null }
  | { status: "invalid" }
  /** A likely typo of a service name the owner hasn't fixed or kept. Nothing sent for this part. */
  | { status: "spelling"; flags: import("@/lib/serviceSpelling").SpellingFlag[] }
  | { status: "error"; error: string };

/** Spelling flags for text the owner is about to send, against the dictionary and the listing's own service names. */
async function flagsFor(c: Ctx, text: string, keep: string[], listed: { names: string[] | null }, prose = false): Promise<import("@/lib/serviceSpelling").SpellingFlag[]> {
  const { spellingFlags } = await import("@/lib/serviceSpelling");
  const ownerTerms = prose ? (((await c.admin.from("prices").select("service").eq("business_id", c.target.businessId).limit(50)).data ?? []) as Array<{ service: string }>).map((p) => p.service) : [];
  const first = spellingFlags(text, { keep, prose, ownerTerms });
  if (first.length === 0) return first;
  // The listing's own spellings count as right: read them once, only when something looks off.
  if (listed.names === null) {
    const [write, specs] = await Promise.all([import("@/lib/gbpFieldWrite.server"), import("@/lib/gbpListingFields.server")]);
    const read = await write.readFieldOnce(c.target, specs.SERVICES_SPEC, c.fetchImpl, "categories").catch(() => null);
    listed.names = read?.ok ? (await servicesFrom(read.data.value, serviceTypesOf(read.data.location))).map((x) => x.name) : [];
  }
  return spellingFlags(text, { keep, services: listed.names, prose, ownerTerms });
}
export interface AnswersResult {
  description?: PartResult;
  services?: PartResult;
  details?: PartResult;
}

/** One sitting: each part the owner approved, through its own writer. */
export async function applyAnswersWith(c: Ctx, payload: AnswersPayload, sittingStart: number, origin: "answers" | "approve_all"): Promise<AnswersResult> {
  const { inSitting } = await import("@/lib/gbpAttributes");
  const out: AnswersResult = {};
  const businessId = c.target.businessId;
  const keep = (payload.keep ?? []).filter((k) => typeof k === "string" && k.length <= 40).slice(0, 20);
  const listed: { names: string[] | null } = { names: null };

  if (typeof payload.description === "string") {
    const { cleanDescription, descriptionProblems } = await import("@/lib/gbpProfileEdits");
    const text = cleanDescription(payload.description) ?? "";
    const flags = descriptionProblems(text).length ? [] : await flagsFor(c, text, keep, listed, true);
    if (descriptionProblems(text).length) out.description = { status: "invalid" };
    else if (flags.length) out.description = { status: "spelling", flags };
    else {
      const server = await import("@/lib/gbpProfileEdits.server");
      const r = await server.applyProfileEdit(c.target, { field: "description", value: text }, inSitting(server.supabaseProfileEditStore(c.admin), sittingStart), { fetchImpl: c.fetchImpl, practice: c.practice });
      out.description = r.status === "error" ? { status: "error", error: r.error } : r.status === "no_change" ? { status: "no_change", undoBatchId: null } : { status: r.status === "pending_review" ? "pending_review" : "sent", undoBatchId: r.undoBatchId };
    }
  }

  const services = (payload.services ?? []).filter((s) => s && typeof s.name === "string" && s.name.trim()).slice(0, 15);
  const serviceFlags = services.length ? await flagsFor(c, services.map((s) => s.name).join(" · "), keep, listed) : [];
  if (serviceFlags.length) out.services = { status: "spelling", flags: serviceFlags };
  else if (services.length) {
    const [write, specs, attrs, fields, { usdMoney, parsePrice }] = await Promise.all([import("@/lib/gbpFieldWrite.server"), import("@/lib/gbpListingFields.server"), import("@/lib/gbpAttributes.server"), import("@/lib/gbpListingFields"), import("@/lib/googleAnswers")]);
    const entries = services.map((s) => {
      const p = parsePrice(s.price);
      return { name: s.name, price: p ? usdMoney(p) : null };
    });
    const store = inSitting(attrs.supabaseChangeStore(c.admin), sittingStart);
    const r = await write.applyField(
      c.target,
      specs.SERVICES_SPEC,
      (current, loc) => fields.addServicesWithPrices(current, serviceTypesOf(loc), ((loc.categories as Cats | undefined)?.primaryCategory?.name ?? ""), entries, c.target.locale === "es" ? "es" : "en"),
      store,
      { fetchImpl: c.fetchImpl, practice: c.practice, extraMask: "categories" }
    );
    const undo = r.status === "sent" || r.status === "pending_review" ? await write.getFieldUndo(attrs.supabaseChangeStore(c.admin), specs.SERVICES_SPEC, businessId, c.target.locationName, c.practice).catch(() => null) : null;
    out.services = r.status === "error" ? { status: "error", error: r.error } : r.status === "no_change" ? { status: "no_change", undoBatchId: null } : { status: r.status, undoBatchId: undo?.batchId ?? null };
  }

  const picks = Object.fromEntries(Object.entries(payload.details ?? {}).filter(([id, v]) => /^attributes\/[a-z0-9_]{2,80}$/.test(id) && typeof v === "boolean")) as Record<string, AttrValue>;
  if (Object.keys(picks).length) {
    const a = await import("@/lib/gbpAttributes.server");
    const r = await a.applyCustomerDetailsChange(c.target, picks, inSitting(a.supabaseChangeStore(c.admin), sittingStart), { fetchImpl: c.fetchImpl, practice: c.practice });
    out.details = r.status === "error" ? { status: "error", error: r.error } : r.status === "no_changes" ? { status: "no_change", undoBatchId: null } : { status: r.status, undoBatchId: r.batchId };
  }

  await tagOrigin(c.admin, businessId, sittingStart, origin);
  if (!c.practice) {
    const { forgetRealListing } = await import("@/lib/gbpRealListing.server");
    forgetRealListing(businessId);
  }
  return out;
}

/** Labels this sitting's changes (gbp_changes.origin) for the chart and
 * "Since you did this". Before supabase/day23e-posts-answers.sql: nothing
 * to label — they show as ordinary listing edits. */
export async function tagOrigin(admin: SupabaseClient, businessId: string, sittingStart: number, origin: "answers" | "approve_all"): Promise<void> {
  try {
    await admin.from("gbp_changes").update({ origin }).eq("business_id", businessId).gte("approved_at", new Date(sittingStart).toISOString()).is("undo_of", null).is("origin", null);
  } catch {
    // A label only — never fails the change.
  }
}
