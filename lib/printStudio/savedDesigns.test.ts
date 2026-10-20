import { beforeEach, describe, expect, test } from "vitest";
import { performance } from "node:perf_hooks";
import { defaultCardDesign, printStudioStorageKey, type CardDesign } from "./design";
import { addSaved, applySaved, canSaveMore, deleteSaved, duplicateSaved, loadCardStore, parseStore, renameSaved, savedOfKind, storageKeyV2, EMPTY_STORE, type SavedCardText } from "./savedDesigns";

// A tiny localStorage for the device storage the designer uses.
const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
  };
});

const coupon = (over: Partial<CardDesign> = {}): CardDesign => ({ ...defaultCardDesign("coupon", "en", "Modern Liquors", "star"), qr: "listing", ...over });
const referral = (over: Partial<CardDesign> = {}): CardDesign => ({ ...defaultCardDesign("referral", "en", "Modern Liquors", "star"), qr: "listing", ...over });
const TEXT: SavedCardText = { offer: "20% off any bottle", friendOffer: "", referrerReward: "", expiration: "2026-12-31", code: "BOTTLE20", subline: "Show this at checkout", finePrint: "One per customer", passOn: undefined };
const NOW = new Date("2026-10-20T15:00:00Z");

describe("saved designs (Campaigns → Coupons / Referrals)", () => {
  test("Save keeps the look AND the text, newest first, with the date", () => {
    const store = addSaved(EMPTY_STORE, { name: "Holiday sale", kind: "coupon", design: coupon({ template: "voucher", headlineFont: "oswald" }), text: TEXT, now: NOW });
    const [s] = savedOfKind(store, "coupon");
    expect(s).toMatchObject({ name: "Holiday sale", kind: "coupon", savedAt: NOW.toISOString(), text: TEXT });
    expect(s.design.template).toBe("voucher");
    expect(s.design.headlineFont).toBe("oswald");
  });

  test("Select brings EVERYTHING back in one update: look into the design, text into the form", () => {
    let store = addSaved(EMPTY_STORE, { name: "Holiday sale", kind: "coupon", design: coupon({ template: "voucher", size: "card4x6", qrDots: "dots", doubleSided: true }), text: TEXT, now: NOW });
    const id = savedOfKind(store, "coupon")[0].id;
    store = { ...store, current: { coupon: coupon() } };
    const applied = applySaved(store, id)!;
    expect(applied.text).toEqual(TEXT);
    expect(applied.store.current.coupon).toMatchObject({ template: "voucher", size: "card4x6", qrDots: "dots", doubleSided: true, kind: "coupon" });
  });

  test("a referral design brings its pass-on choice back", () => {
    const text: SavedCardText = { ...TEXT, offer: "", friendOffer: "$10 off", referrerReward: "a free tasting", passOn: "tear" };
    const store = addSaved(EMPTY_STORE, { name: "Tear card", kind: "referral", design: referral({ passOn: "single" }), text, now: NOW });
    const applied = applySaved(store, savedOfKind(store, "referral")[0].id)!;
    expect(applied.design.passOn).toBe("tear");
    expect(applied.text?.passOn).toBe("tear");
  });

  test("coupons and referral cards have separate lists (5 each)", () => {
    let store = EMPTY_STORE;
    for (let i = 0; i < 6; i++) store = addSaved(store, { name: `C${i}`, kind: "coupon", design: coupon(), text: TEXT, now: new Date(NOW.getTime() + i) });
    store = addSaved(store, { name: "R1", kind: "referral", design: referral(), text: TEXT, now: NOW });
    expect(savedOfKind(store, "coupon").map((s) => s.name)).toEqual(["C4", "C3", "C2", "C1", "C0"]);
    expect(canSaveMore(store, "coupon")).toBe(false);
    expect(savedOfKind(store, "referral").map((s) => s.name)).toEqual(["R1"]);
    expect(canSaveMore(store, "referral")).toBe(true);
  });

  test("rename, duplicate and delete", () => {
    let store = addSaved(EMPTY_STORE, { name: "A", kind: "coupon", design: coupon(), text: TEXT, now: NOW });
    const id = store.saved[0].id;
    store = renameSaved(store, id, "  Spring sale  ");
    expect(store.saved[0].name).toBe("Spring sale");
    expect(renameSaved(store, id, "   ").saved[0].name).toBe("Spring sale");
    store = duplicateSaved(store, id, (n) => `${n} (copy)`, new Date(NOW.getTime() + 1000));
    expect(store.saved.map((s) => s.name)).toEqual(["Spring sale", "Spring sale (copy)"]);
    expect(store.saved[1].text).toEqual(TEXT);
    store = deleteSaved(store, id);
    expect(store.saved.map((s) => s.name)).toEqual(["Spring sale (copy)"]);
  });

  test("survives reloads; designs saved before (v1, one shared list) still load and are migrated", () => {
    const v1 = { current: { coupon: coupon({ template: "voucher" }) }, basic: {}, saved: [{ id: "1", name: "Old coupon", design: coupon({ template: "voucher" }) }, { id: "2", name: "Old referral", design: referral() }] };
    mem.set(printStudioStorageKey("b1"), JSON.stringify(v1));
    const store = loadCardStore("b1", "en", "Modern Liquors");
    expect(savedOfKind(store, "coupon").map((s) => [s.name, s.savedAt, s.text])).toEqual([["Old coupon", null, null]]);
    expect(savedOfKind(store, "referral").map((s) => s.name)).toEqual(["Old referral"]);
    expect(store.current.coupon?.template).toBe("voucher");
    // Migrated to v2; the old key is left as it was.
    expect(mem.has(storageKeyV2("b1"))).toBe(true);
    expect(mem.get(printStudioStorageKey("b1"))).toBe(JSON.stringify(v1));
    // A reload reads v2.
    expect(loadCardStore("b1", "en", "Modern Liquors").saved).toHaveLength(2);
  });

  test("bad stored data never breaks the page", () => {
    expect(parseStore("{not json", "en", "X")).toEqual({ current: {}, basic: {}, saved: [] });
    expect(parseStore(JSON.stringify({ saved: [{ id: 5 }, { id: "a", name: "ok", design: {}, text: { offer: "<b>x</b>".repeat(30), expiration: "soon" } }] }), "en", "X").saved).toHaveLength(1);
  });

  test("Save and Select take well under 100 ms (measured)", () => {
    let store = EMPTY_STORE;
    for (let i = 0; i < 5; i++) store = addSaved(store, { name: `D${i}`, kind: "coupon", design: coupon(), text: TEXT, now: new Date(NOW.getTime() + i) });
    const id = savedOfKind(store, "coupon")[2].id;
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) applySaved(store, id);
    const select = (performance.now() - t0) / 100;
    const t1 = performance.now();
    for (let i = 0; i < 100; i++) addSaved(deleteSaved(store, id), { name: "X", kind: "coupon", design: coupon(), text: TEXT, now: NOW });
    const save = (performance.now() - t1) / 100;
    console.log(`TIMING select ${select.toFixed(3)} ms, save ${save.toFixed(3)} ms`);
    expect(select).toBeLessThan(5);
    expect(save).toBeLessThan(5);
  });
});
