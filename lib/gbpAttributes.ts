// Premium "Update on Google" for customer details (docs/gbp-actions-plan.md,
// Step 1). Pure: Google's attribute lists come in, the editor's rows, the
// owner's before → after, the one PATCH and the undo come out. Safe for
// client code (no Google calls here — lib/gbpAttributes.server.ts).
//
// Only attributes Google offers for this location (attributes.list with
// parent=locations/{id}) that are yes/no (BOOL), not deprecated, and about
// accessibility, payment or parking. Anything else is never sent.

import type { CustomerDetailPart } from "@/lib/customerDetails";

/** true = yes, false = no, null = not set on Google. */
export type AttrValue = boolean | null;

/** Google's AttributeMetadata (only the fields read). */
export interface GbpAttributeMetadata {
  parent?: string;
  valueType?: string;
  displayName?: string;
  groupDisplayName?: string;
  repeatable?: boolean;
  deprecated?: boolean;
}

/** Google's Attribute (only the fields read). */
export interface GbpAttribute {
  name?: string;
  valueType?: string;
  values?: unknown[];
}

export interface CustomerDetailsEditorRow {
  /** "attributes/has_wheelchair_accessible_entrance" */
  id: string;
  part: CustomerDetailPart;
  /** Google's own label, in the owner's language. */
  label: string;
  /** What customers see on Google now: the owner's own value when they've
   * set one, else Google's live value (Google's or customers' info —
   * locations.attributes.getGoogleUpdated). */
  current: AttrValue;
  /** The owner's own saved value only (locations.getAttributes) — what
   * Undo puts back (null = not set: Google's own info shows again). */
  merchant?: AttrValue;
}

export interface AttributeChange {
  id: string;
  part: CustomerDetailPart;
  label: string;
  /** What customers saw before (see CustomerDetailsEditorRow.current). */
  before: AttrValue;
  after: AttrValue;
  /** The owner's own value before — what Undo restores. */
  merchantBefore?: AttrValue;
}

export const PART_ORDER: CustomerDetailPart[] = ["parking", "payment", "accessibility"];
/** One approval changes at most this many fields. */
export const MAX_CHANGES_PER_APPROVAL = 40;
/** Undo is offered this long after an approval. */
export const UNDO_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Our own caps, stricter than Google's 10 edits/min per profile. */
export const MIN_SECONDS_BETWEEN_APPROVALS = 60;
export const MAX_APPROVALS_PER_DAY = 20;

/** "has_x" or "attributes/has_x" → "attributes/has_x". */
export function attributeId(name: string): string {
  return name.startsWith("attributes/") ? name : `attributes/${name}`;
}

/** The options the panel offers, per part, in order — Google's own
 * attribute IDs (checked live against attributes.list for the location
 * on Oct 28: a hair salon's accessibility, payments and parking groups).
 * Only the ones Google offers for the location are ever shown. */
export const CUSTOMER_DETAIL_OPTIONS: Record<CustomerDetailPart, string[]> = {
  parking: [
    "has_parking_street_free",
    "has_parking_street_paid",
    "has_parking_lot_free",
    "has_parking_lot_paid",
    "has_parking_garage_free",
    "has_parking_garage_paid",
    "has_valet_parking",
  ],
  payment: ["pay_credit_card", "pay_debit_card", "pay_mobile_nfc", "requires_cash_only"],
  accessibility: ["has_wheelchair_accessible_entrance", "has_wheelchair_accessible_restroom", "has_wheelchair_accessible_seating", "has_wheelchair_accessible_parking"],
};

/** Which part an attribute is, or null when the panel doesn't offer it. */
export function partOfAttribute(name: string): CustomerDetailPart | null {
  const id = attributeId(name).slice("attributes/".length);
  return PART_ORDER.find((part) => CUSTOMER_DETAIL_OPTIONS[part].includes(id)) ?? null;
}

function optionIndex(id: string): number {
  const bare = id.slice("attributes/".length);
  for (const part of PART_ORDER) {
    const i = CUSTOMER_DETAIL_OPTIONS[part].indexOf(bare);
    if (i >= 0) return i;
  }
  return 99;
}

/** "Choose all that apply": checked = yes. Unchecking a "yes" says no; an
 * option left unchecked that wasn't a yes keeps Google's value. */
export function pickFromChecked(current: AttrValue, checked: boolean): AttrValue {
  if (checked) return true;
  return current === true ? false : current;
}

function boolValue(attr: GbpAttribute | undefined): AttrValue {
  const v = attr?.values?.[0];
  return v === true ? true : v === false ? false : null;
}

/** The editor's rows: Google's offered yes/no attributes for the three
 * parts, each with the listing's current value. */
export function customerDetailsEditorRows(metadata: GbpAttributeMetadata[], current: GbpAttribute[], live: GbpAttribute[] = []): CustomerDetailsEditorRow[] {
  const byId = new Map(current.filter((a) => a.name).map((a) => [attributeId(a.name!), a]));
  const liveById = new Map(live.filter((a) => a.name).map((a) => [attributeId(a.name!), a]));
  const rows: CustomerDetailsEditorRow[] = [];
  const seen = new Set<string>();
  for (const m of metadata) {
    if (!m.parent || m.deprecated || m.valueType !== "BOOL") continue;
    const id = attributeId(m.parent);
    const part = partOfAttribute(id);
    if (!part || seen.has(id)) continue;
    seen.add(id);
    const merchant = boolValue(byId.get(id));
    rows.push({ id, part, label: m.displayName?.trim() || id.slice("attributes/".length).replace(/_/g, " "), current: merchant ?? boolValue(liveById.get(id)), merchant });
  }
  return rows.sort((a, b) => PART_ORDER.indexOf(a.part) - PART_ORDER.indexOf(b.part) || optionIndex(a.id) - optionIndex(b.id));
}

export type DiffResult =
  | { ok: true; changes: AttributeChange[] }
  /** A pick names an attribute Google doesn't offer for this listing. */
  | { ok: false; reason: "not_offered" | "too_many" };

/** before → after for every pick that differs from Google's current value.
 * The rows are always Google's, read on the server — the client's idea of
 * "before" is never used. */
export function diffCustomerDetails(rows: CustomerDetailsEditorRow[], picks: Record<string, AttrValue>): DiffResult {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const wanted = new Map<string, AttrValue>();
  for (const [rawId, after] of Object.entries(picks)) {
    const row = byId.get(attributeId(rawId));
    if (!row || (after !== true && after !== false && after !== null)) return { ok: false, reason: "not_offered" };
    wanted.set(row.id, after);
  }
  // In the panel's order (accessibility, payment, parking).
  const changes: AttributeChange[] = rows
    .filter((r) => wanted.has(r.id) && wanted.get(r.id) !== r.current)
    .map((r) => ({ id: r.id, part: r.part, label: r.label, before: r.current, after: wanted.get(r.id)!, merchantBefore: r.merchant ?? null }));
  if (changes.length > MAX_CHANGES_PER_APPROVAL) return { ok: false, reason: "too_many" };
  return { ok: true, changes };
}

/** One PATCH for the whole change: every field in the mask; a field set
 * back to "not set" is in the mask and left out of the body (Google's
 * documented way to delete an attribute). */
export function attributesPatch(locationName: string, changes: Array<Pick<AttributeChange, "id" | "after">>): { mask: string; body: { name: string; attributes: Array<{ name: string; values: boolean[] }> } } {
  return {
    mask: changes.map((c) => c.id).join(","),
    body: {
      name: `${locationName}/attributes`,
      attributes: changes.filter((c) => c.after !== null).map((c) => ({ name: c.id, values: [c.after as boolean] })),
    },
  };
}

/** The value as stored in gbp_changes: "true", "false" or null. */
export function storedValue(v: AttrValue): string | null {
  return v === null ? null : String(v);
}
export function parseStoredValue(v: unknown): AttrValue {
  return v === "true" ? true : v === "false" ? false : null;
}

/** May the owner approve another change now? From the approval times
 * (one per batch) in the last day. */
export function approvalAllowed(approvedAts: string[], now: number): "ok" | "wait_minute" | "daily_cap" {
  const times = approvedAts.map((a) => Date.parse(a)).filter((t) => Number.isFinite(t) && now - t < DAY_MS);
  if (times.some((t) => now - t < MIN_SECONDS_BETWEEN_APPROVALS * 1000)) return "wait_minute";
  if (times.length >= MAX_APPROVALS_PER_DAY) return "daily_cap";
  return "ok";
}

/** A gbp_changes row (the fields read). */
export interface GbpChangeRow {
  batch_id: string;
  field: string;
  before_value: string | null;
  after_value: string | null;
  approved_at: string;
  status: string;
  undo_of: string | null;
  undone_at: string | null;
  /** The Google location the change was made on ("locations/456"); null on
   * rows logged before supabase/gbp-changes-location.sql. */
  location_name?: string | null;
  /** Set when the owner disconnected Google: no longer undoable. */
  undo_closed_at?: string | null;
}

export interface UndoableChange {
  batchId: string;
  approvedAt: string;
  /** Undo is offered until this time. */
  undoUntil: string;
  status: "sent" | "pending_review";
  changes: Array<{ id: string; before: AttrValue; after: AttrValue }>;
}

/** The latest approval the owner may still undo: sent (not failed), not an
 * undo itself, not undone, not closed by a disconnect, at most 7 days old,
 * and made on `locationName` — the location connected NOW. A change made
 * on another location (or with no location logged) is never undone here:
 * its "before" belongs to a different listing. Rows newest first or not —
 * the latest batch wins. */
export function latestUndoable(rows: GbpChangeRow[], now: number, locationName: string): UndoableChange | null {
  // A failed attempt (approval or undo) changed nothing on Google: the
  // change before it is still the latest.
  const latest = rows.filter((r) => r.status !== "failed").sort((a, b) => Date.parse(b.approved_at) - Date.parse(a.approved_at))[0];
  if (!latest) return null;
  const batch = rows.filter((r) => r.batch_id === latest.batch_id);
  if (batch.some((r) => r.undo_of || r.undone_at || r.undo_closed_at || (r.status !== "sent" && r.status !== "pending_review"))) return null;
  if (!locationName || batch.some((r) => r.location_name !== locationName)) return null;
  const at = Date.parse(latest.approved_at);
  if (!Number.isFinite(at) || now - at > UNDO_DAYS * DAY_MS) return null;
  return {
    batchId: latest.batch_id,
    approvedAt: latest.approved_at,
    undoUntil: new Date(at + UNDO_DAYS * DAY_MS).toISOString(),
    status: batch.some((r) => r.status === "pending_review") ? "pending_review" : "sent",
    changes: batch.map((r) => ({ id: r.field, before: parseStoredValue(r.before_value), after: parseStoredValue(r.after_value) })),
  };
}

function merchantValues(current: GbpAttribute[]): Map<string, AttrValue> {
  return new Map(current.filter((a) => a.name).map((a) => [attributeId(a.name!), boolValue(a)]));
}

/** Fields whose live (merchant) value is no longer what we set — someone
 * changed them on Google since. Undo never overwrites a newer edit. */
export function undoConflicts(changes: UndoableChange["changes"], current: GbpAttribute[]): string[] {
  return undoPlan(changes, current).conflicts;
}

/**
 * What an undo must send to restore exactly the logged "before": every
 * field still at the value we set goes back (null = "not set" → removed:
 * in the mask, left out of the body). A field already back at its
 * "before" needs nothing. A field at any third value was changed on
 * Google since — a conflict: undo refuses rather than overwrite it.
 *
 * `resendRestored` (undo of a "pending_review" approval): a field that
 * already reads as its "before" is sent anyway — Google may only be
 * showing the old value while it still reviews our edit, and could apply
 * it later.
 */
export function undoPlan(
  changes: UndoableChange["changes"],
  current: GbpAttribute[],
  opts: { resendRestored?: boolean } = {}
): { send: Array<{ id: string; after: AttrValue; before: AttrValue }>; conflicts: string[] } {
  const now = merchantValues(current);
  const send: Array<{ id: string; after: AttrValue; before: AttrValue }> = [];
  const conflicts: string[] = [];
  for (const c of changes) {
    const value = now.get(c.id) ?? null;
    if (value === c.before && !opts.resendRestored) continue;
    if (value === c.after || value === c.before) send.push({ id: c.id, after: c.before, before: c.after });
    else conflicts.push(c.id);
  }
  return { send, conflicts };
}

/** After an undo: the fields Google still doesn't show at their logged
 * "before" value (read back from locations.getAttributes). */
export function undoReadbackMismatches(changes: UndoableChange["changes"], readback: GbpAttribute[]): string[] {
  const now = merchantValues(readback);
  return changes.filter((c) => (now.get(c.id) ?? null) !== c.before).map((c) => c.id);
}
