// Saved coupon / referral card designs (Campaigns → Coupons, → Referrals),
// kept on this device (localStorage, per business). Pure except the two
// storage calls at the bottom.
//
// v2 (Day 5): each saved design keeps EVERYTHING needed to bring it back —
// the look (template, size, fonts, colors, QR, extras) AND the page's own
// text (offer, fine print, code, expiry, instructions, pass-on choice) —
// plus its card type (coupons and referral cards have separate lists) and
// when it was saved. v1 (before) kept only the look in one shared list;
// it's migrated on first load: its designs keep their look and type, their
// text was never saved so it stays as the form has it, and no date.

import {
  CODE_MAX,
  FINE_PRINT_MAX,
  OFFER_MAX,
  PASS_ON,
  SAVED_DESIGNS_MAX,
  printStudioStorageKey,
  sanitizeBasicCard,
  sanitizeCardDesign,
  type BasicCard,
  type CardDesign,
  type CardKind,
  type PassOn,
} from "@/lib/printStudio/design";
import { readStorage, writeStorage } from "@/lib/signStudio/design";

/** The page's own text a saved design brings back. */
export interface SavedCardText {
  offer: string;
  friendOffer: string;
  referrerReward: string;
  expiration: string;
  code: string;
  subline: string;
  finePrint: string;
  passOn?: PassOn;
}

export interface SavedDesign {
  id: string;
  name: string;
  kind: CardKind;
  /** ISO time it was saved; null for designs saved before v2. */
  savedAt: string | null;
  design: CardDesign;
  /** null for designs saved before v2 (only the look was kept). */
  text: SavedCardText | null;
}

export interface CardStore {
  current: Partial<Record<CardKind, CardDesign>>;
  basic: Partial<Record<CardKind, BasicCard>>;
  saved: SavedDesign[];
}

export const NAME_MAX = 40;
export const EMPTY_STORE: CardStore = { current: {}, basic: {}, saved: [] };

export function storageKeyV2(businessId: string): string {
  return `postscore.printStudio.${businessId}.v2`;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, max: number): string {
  return typeof v === "string" ? Array.from(v.replace(/[\u0000-\u001f\u007f]/g, " ")).slice(0, max).join("") : "";
}

function cleanText(v: unknown): SavedCardText | null {
  if (!v || typeof v !== "object") return null;
  const o = obj(v);
  const passOn = (PASS_ON as string[]).includes(o.passOn as string) ? (o.passOn as PassOn) : undefined;
  return {
    offer: str(o.offer, OFFER_MAX),
    friendOffer: str(o.friendOffer, OFFER_MAX),
    referrerReward: str(o.referrerReward, OFFER_MAX),
    expiration: typeof o.expiration === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.expiration) ? o.expiration : "",
    code: str(o.code, CODE_MAX).toUpperCase().replace(/[^A-Z0-9-]/g, ""),
    subline: str(o.subline, FINE_PRINT_MAX),
    finePrint: str(o.finePrint, FINE_PRINT_MAX),
    ...(passOn ? { passOn } : {}),
  };
}

/** Parses a stored store (v1 or v2 shape); unusable parts are dropped. */
export function parseStore(raw: string | null, locale: "en" | "es", businessName: string): CardStore {
  if (!raw) return { current: {}, basic: {}, saved: [] };
  try {
    const v = obj(JSON.parse(raw));
    const current = obj(v.current);
    const basic = obj(v.basic);
    const out: CardStore = { current: {}, basic: {}, saved: [] };
    for (const kind of ["coupon", "referral"] as CardKind[]) {
      if (current[kind]) out.current[kind] = sanitizeCardDesign(current[kind], kind, locale, businessName);
      if (basic[kind]) out.basic[kind] = sanitizeBasicCard(basic[kind], kind, locale, businessName);
    }
    const saved = Array.isArray(v.saved) ? v.saved : [];
    const perKind: Record<CardKind, number> = { coupon: 0, referral: 0 };
    for (const s of saved) {
      const o = obj(s);
      const design = obj(o.design);
      const kind: CardKind = o.kind === "referral" || design.kind === "referral" ? "referral" : "coupon";
      if (typeof o.id !== "string" || typeof o.name !== "string" || perKind[kind] >= SAVED_DESIGNS_MAX) continue;
      perKind[kind]++;
      out.saved.push({
        id: o.id,
        name: str(o.name, NAME_MAX) || "—",
        kind,
        savedAt: typeof o.savedAt === "string" && !Number.isNaN(Date.parse(o.savedAt)) ? o.savedAt : null,
        design: sanitizeCardDesign(design, kind, locale, businessName),
        text: cleanText(o.text),
      });
    }
    return out;
  } catch {
    return { current: {}, basic: {}, saved: [] };
  }
}

/** This device's store for a business: v2, else the old v1 key migrated. */
export function loadCardStore(businessId: string, locale: "en" | "es", businessName: string): CardStore {
  const v2 = readStorage(storageKeyV2(businessId));
  if (v2) return parseStore(v2, locale, businessName);
  const v1 = readStorage(printStudioStorageKey(businessId));
  const migrated = parseStore(v1, locale, businessName);
  // The old key is left in place (nothing is lost if someone goes back).
  if (v1) writeStorage(storageKeyV2(businessId), JSON.stringify(migrated));
  return migrated;
}

export function saveCardStore(businessId: string, store: CardStore): void {
  writeStorage(storageKeyV2(businessId), JSON.stringify(store));
}

// ---- Operations (pure) ----

export function savedOfKind(store: CardStore, kind: CardKind): SavedDesign[] {
  return store.saved.filter((s) => s.kind === kind);
}

export function canSaveMore(store: CardStore, kind: CardKind): boolean {
  return savedOfKind(store, kind).length < SAVED_DESIGNS_MAX;
}

export function addSaved(store: CardStore, entry: { name: string; kind: CardKind; design: CardDesign; text: SavedCardText; now: Date; id?: string }): CardStore {
  const name = str(entry.name.trim(), NAME_MAX);
  if (!name || !canSaveMore(store, entry.kind)) return store;
  const saved: SavedDesign = { id: entry.id ?? `${entry.now.getTime()}`, name, kind: entry.kind, savedAt: entry.now.toISOString(), design: { ...entry.design, kind: entry.kind }, text: entry.text };
  return { ...store, saved: [saved, ...store.saved] };
}

export function renameSaved(store: CardStore, id: string, name: string): CardStore {
  const clean = str(name.trim(), NAME_MAX);
  if (!clean) return store;
  return { ...store, saved: store.saved.map((s) => (s.id === id ? { ...s, name: clean } : s)) };
}

export function duplicateSaved(store: CardStore, id: string, copyName: (name: string) => string, now: Date): CardStore {
  const s = store.saved.find((x) => x.id === id);
  if (!s || !canSaveMore(store, s.kind)) return store;
  const copy: SavedDesign = { ...s, id: `${now.getTime()}`, name: str(copyName(s.name), NAME_MAX), savedAt: now.toISOString() };
  const at = store.saved.indexOf(s);
  return { ...store, saved: [...store.saved.slice(0, at + 1), copy, ...store.saved.slice(at + 1)] };
}

export function deleteSaved(store: CardStore, id: string): CardStore {
  return { ...store, saved: store.saved.filter((s) => s.id !== id) };
}

/** Selecting a saved design: its look becomes the current design (one
 * update), and its text (when it has some) goes back into the form. */
export function applySaved(store: CardStore, id: string): { store: CardStore; text: SavedCardText | null; design: CardDesign } | null {
  const s = store.saved.find((x) => x.id === id);
  if (!s) return null;
  const design = { ...s.design, kind: s.kind, ...(s.text?.passOn ? { passOn: s.text.passOn } : {}) };
  return { store: { ...store, current: { ...store.current, [s.kind]: design } }, text: s.text, design };
}
