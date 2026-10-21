import { describe, expect, test, vi } from "vitest";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/business/b1/growth",
}));
vi.mock("@/app/actions/promos", () => ({ startPromo: vi.fn(), incrementPromoRedemption: vi.fn(), endPromo: vi.fn() }));
vi.mock("@/app/actions/referrals", () => ({ startReferral: vi.fn(), incrementReferralRedemption: vi.fn(), endReferral: vi.fn() }));

import { LocaleProvider } from "@/lib/i18n";
import { CouponsSection } from "./CouponsSection";
import { ReferralSection } from "./ReferralSection";
import { cardTabs } from "./CardDesigner";
import { CustomizeDesign } from "@/components/studio/CustomizeDesign";
import { bizProfileById } from "@/config/bizProfiles";
import { basicCardDesign, defaultBasicCard, defaultCardDesign, referralTemplate, type CardBusiness, type CardDesign, type PassOn } from "@/lib/printStudio/design";
import type { Plan } from "@/lib/plan";

const BUSINESS: CardBusiness = {
  businessName: "Modern Liquors",
  placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
  googleMapsUri: "https://maps.google.com/?cid=1",
  website: null,
  address: "123 Main St",
  hours: null,
  icon: "bottle",
};

const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );
function coupons(plan: Plan, locale: "en" | "es" = "en") {
  return wrap(<CouponsSection businessId="b1" businessName="Modern Liquors" businessPhone={null} profile={bizProfileById("salon", locale)!} promos={[]} plan={plan} printBusiness={BUSINESS} />, locale);
}
function referral(plan: Plan, locale: "en" | "es" = "en") {
  return wrap(<ReferralSection businessId="b1" businessName="Modern Liquors" businessPhone={null} profile={bizProfileById("salon", locale)!} referral={null} plan={plan} printBusiness={BUSINESS} />, locale);
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const radios = (html: string, name: string) => Array.from(html.matchAll(new RegExp(`<input type="radio" name="${name}"[^>]*>`, "g"))).map((m) => m[0]);

/** Every tab's content, as Free/Grow (premium=false) or Premium sees it. */
function tabs(premium: boolean, kind: "coupon" | "referral" = "coupon", passOn: PassOn = "single", onPassOn: (p: PassOn) => void = () => {}, update: (patch: Partial<CardDesign>, locked: boolean) => void = () => {}) {
  const value = premium
    ? { ...defaultCardDesign(kind, "en", "Modern Liquors", "bottle"), passOn, template: kind === "referral" ? referralTemplate(passOn, null) : "voucher" as const }
    : basicCardDesign({ ...defaultBasicCard(kind, "en", "Modern Liquors"), passOn }, "en");
  const list = cardTabs({
    onPassOn,
    locale: "en",
    value,
    update,
    premium,
    onBasic: () => {},
    qrDest: "listing",
    onQrDest: () => {},
    business: BUSINESS,
    logo: null,
    onLogo: () => {},
    logoNote: null,
    fileRef: createRef<HTMLInputElement>(),
    saved: <p>saved</p>,
  });
  return list.map((t) => ({ ...t, html: wrap(<>{t.content}</>) }));
}

describe.each([
  ["coupon page", coupons],
  ["referral page", referral],
] as const)("%s", (_name, render) => {
  test("How it works (3 steps), then the plan strip with the current plan highlighted", () => {
    const html = render("grow");
    expect(html.indexOf('data-testid="how-it-works"')).toBeLessThan(html.indexOf('data-testid="plan-strip"'));
    expect(html.match(/<li class="flex items-start gap-2.5">/g)).toHaveLength(3);
    // Free sees the designer as a showroom instead (no plan strip).
    expect(render("free")).not.toContain('data-testid="plan-strip"');
    expect(render("free")).toContain('data-testid="designer-showroom"');
    for (const [plan, current] of [["grow", "Grow"], ["premium", "Premium"], ["multi", "Premium"]] as const) {
      const strip = render(plan).match(/data-testid="plan-strip"[\s\S]*?<\/div><\/div><\/div>/)![0];
      expect(text(strip)).toContain("2 styles, 2 sizes, print");
      expect(strip).toMatch(new RegExp(`aria-current="true"[^>]*><span[^>]*>${current}`));
    }
  });

  test("one 'Customize design' row with a summary — not a long stacked list", () => {
    const html = render("premium");
    expect(html).toContain('data-testid="customize-design"');
    expect(html.match(/data-testid="design-summary"[^>]*>([^<]*)</)![1]).toBe("Classic · Wallet card · Playfair Display · QR → Google listing");
    expect(html).not.toContain("<details");
  });

  test("Free: a showroom — the designer is there; Download / Print / PNG / Share / Save are locks that open the promo box", () => {
    const html = render("free");
    expect(html).toContain('data-testid="designer-showroom"');
    expect(html).toContain('data-testid="outputs-locked"');
    expect(text(html)).toContain("Print and download with Grow");
    // Without upgrade data (this test) the locks render disabled; on the page they open the promo box.
    expect(html).toMatch(/data-testid="upgrade-button" data-feature="print"[^>]*>[\s\S]*?Download PDF/);
    expect(text(html)).toContain("Save & start tracking");
    expect(html).toMatch(/data-testid="upgrade-button" data-feature="print"[^>]*>(?:(?!<\/button>)[\s\S])*Save &amp; start tracking/);
  });

  test("buttons say exactly what happens", () => {
    const t = text(render("grow"));
    expect(t).toContain("Save & start tracking");
    // One honesty line under the buttons, not three near-identical ones.
    const honesty = "You print or share it yourself and count redemptions here — PostScore doesn't see your register or text anyone.";
    expect(t.split(honesty)).toHaveLength(2);
    expect(t).not.toMatch(/Adds it to Active|You track redemptions at the register|PostScore doesn't post it to Google/);
    expect(t).not.toMatch(/scan to redeem|Start this/i);
    expect(t).not.toMatch(/studio/i);
  });
});

describe("the Customize design tabs", () => {
  test("Template · Size · Text · Colors · QR · Extras · Saved", () => {
    expect(tabs(true).map((t) => t.label)).toEqual(["Template", "Size", "Text", "Colors", "QR", "Extras", "Saved"]);
  });

  test("Grow: only Style + Size active (+ QR destination); the rest carry the Premium lock", () => {
    const grow = tabs(false);
    expect(grow.filter((t) => t.locked).map((t) => t.id)).toEqual(["template", "text", "extras", "saved"]);
    const byId = Object.fromEntries(grow.map((t) => [t.id, t.html]));
    expect(radios(byId.size, "size").filter((r) => !r.includes("data-locked"))).toHaveLength(2);
    expect(radios(byId.colors, "theme").filter((r) => !r.includes("data-locked"))).toHaveLength(2);
    expect(radios(byId.colors, "pattern").every((r) => r.includes("data-locked"))).toBe(true);
    // QR: where it goes is open; how it looks is Premium.
    expect(byId.qr).toMatch(/<select[^>]*><option value="listing"/);
    // Never the review link on a discount/referral card (Google's review policy).
    expect(byId.qr).not.toContain('<option value="review"');
    expect(radios(byId.qr, "qrDots").every((r) => r.includes("data-locked"))).toBe(true);
    expect(byId.qr).not.toContain('<option value="website"');
  });

  test("Premium: no locks anywhere", () => {
    for (const t of tabs(true)) {
      expect(t.locked, t.id).toBeFalsy();
      expect(t.html, t.id).not.toContain("data-locked");
    }
  });

  test("Free: the panel is read-only with 'Print and download with Grow'; Reset sits inside the panel", () => {
    const free = wrap(<CustomizeDesign alwaysOpen summary="x" storageKey="k" tabs={tabs(false)} readOnlyNote="Print and download with Grow" onReset={() => {}} />);
    expect(free).toContain('data-testid="panel-read-only"');
    expect(free).toMatch(/<fieldset disabled=""/);
    expect(free).not.toContain("Reset to default");
    const premium = wrap(<CustomizeDesign alwaysOpen summary="x" storageKey="k" tabs={tabs(true)} onReset={() => {}} />);
    expect(premium).toContain("Reset to default");
    expect(premium).not.toMatch(/<fieldset disabled=""/);
  });

  test("Spanish (usted)", () => {
    const t = text(coupons("free", "es"));
    expect(t).toContain("Cómo funciona");
    expect(t).toContain("Personalizar diseño");
    expect(t).toContain("Imprima y descargue con Grow");
    expect(t).toContain("Guardar y empezar a contar");
    expect(text(referral("grow", "es"))).toContain("escribe su nombre en “Referido por”");
  });
});

describe("referral: how customers pass it on", () => {
  // Imported lazily so the mocks above apply.
  test("the choice sits at the top of the form, above Customize design: Single card (default) · Tear-in-half · Share digitally", () => {
    const html = referral("grow");
    expect(html.match(/data-testid="pass-on"/g)).toHaveLength(1);
    expect(html.indexOf('data-testid="how-it-works"')).toBeLessThan(html.indexOf('data-testid="pass-on"'));
    expect(html.indexOf('data-testid="pass-on"')).toBeLessThan(html.indexOf("Reward for the referrer"));
    expect(html.indexOf('data-testid="pass-on"')).toBeLessThan(html.indexOf('data-testid="customize-design"'));
    expect(text(html)).toContain("How will customers pass it on?");
    const single = html.match(/<input[^>]*name="pass-on"[^>]*value="single"[^>]*>/)![0];
    expect(single).toContain('checked=""');
    expect(html.match(/<input[^>]*name="pass-on"[^>]*value="tear"[^>]*>/)![0]).not.toContain("checked");
    for (const s of ["Single card", "Tear-in-half card", "Share digitally"]) expect(text(html)).toContain(s);
  });

  test("the steps follow the choice — and each says how you know who referred the friend", async () => {
    const { HowItWorks } = await import("./HowItWorks");
    const steps = (passOn: "single" | "tear" | "digital") => text(wrap(<HowItWorks kind="referral" passOn={passOn} businessId="b1" />));
    expect(steps("single")).toContain("The name on the card is who referred them");
    expect(steps("tear")).toContain("Both halves carry the same code, so you know who referred them");
    expect(steps("digital")).toContain("The sender (or the name in the message) is who referred them");
    for (const p of ["single", "tear", "digital"] as const) expect(steps(p)).toContain("tap +1 on All campaigns");
  });

  test("Share (image + message) appears for the digital option", async () => {
    const { ReferralBuilder } = await import("./ReferralBuilder");
    const builder = (passOn: "single" | "digital") =>
      text(wrap(<ReferralBuilder businessId="b1" businessName="Modern Liquors" passOn={passOn} onPassOnChange={vi.fn()} profile={bizProfileById("salon", "en")!} activeCount={0} maxActive={1} onStart={vi.fn()} plan="grow" printBusiness={BUSINESS} />));
    expect(builder("digital")).toContain("Share");
    expect(builder("digital")).toContain("Send the card image (Download card PNG) with this message.");
    expect(builder("single")).not.toContain("Send the card image");
  });

  test("'Confused? Ask PostAI →' under How it works on both pages", () => {
    expect(referral("grow")).toMatch(/href="\/business\/b1\?ask=referral_cards"[^>]*>Confused\? Ask PostAI →/);
    expect(coupons("grow")).toMatch(/href="\/business\/b1\?ask=coupon_cards"[^>]*>Confused\? Ask PostAI →/);
    expect(text(coupons("grow", "es"))).toContain("¿Dudas? Pregunte a PostAI →");
  });
});

describe("referral: the Template tab", () => {
  const templateTab = (premium: boolean, passOn: PassOn, onPassOn?: (p: PassOn) => void, update?: (patch: Partial<CardDesign>, locked: boolean) => void) =>
    tabs(premium, "referral", passOn, onPassOn, update).find((t) => t.id === "template")!;
  const labels = (html: string) => text(html);

  test("all three templates show on every plan; Thank-you carries the Premium lock on Grow", () => {
    const grow = templateTab(false, "single");
    expect(grow.locked).toBe(false);
    for (const name of ["Give & Get (tear in half)", "Friend pass", "Thank-you card"]) expect(labels(grow.html)).toContain(name);
    const r = radios(grow.html, "template");
    expect(r).toHaveLength(3);
    expect(r.filter((x) => x.includes("data-locked")).length).toBe(1);
    const thankYou = grow.html.split("<label").find((l) => l.includes("Thank-you card"))!;
    expect(thankYou).toContain('data-locked="true"');
    expect(text(thankYou)).toContain("Premium");
    expect(text(grow.html.split("<label").find((l) => l.includes("Friend pass"))!)).not.toContain("Premium");
    const premium = templateTab(true, "single");
    expect(radios(premium.html, "template").some((x) => x.includes("data-locked"))).toBe(false);
  });

  test("the checked template follows the pass-on choice, and each says which choice it's for", () => {
    const checked = (passOn: PassOn) => radios(templateTab(true, passOn).html, "template").findIndex((x) => x.includes('checked=""'));
    expect(checked("tear")).toBe(0); // Give & Get
    expect(checked("single")).toBe(1); // Friend pass
    expect(labels(templateTab(true, "tear").html)).toContain("For the tear-in-half card");
  });

  test("picking Give & Get switches to the tear-in-half card; picking Friend pass from it switches back to Single", () => {
    const seen: PassOn[] = [];
    const patches: Partial<CardDesign>[] = [];
    const tab = (passOn: PassOn) => templateTab(true, passOn, (p) => seen.push(p), (patch) => patches.push(patch));
    const pick = (passOn: PassOn, i: number) => {
      const content = tab(passOn).content as React.ReactElement<{ children: React.ReactElement<{ onPick: (o: string, l: boolean) => void; options: string[] }>[] }>;
      const choices = (Array.isArray(content.props.children) ? content.props.children[0] : content.props.children) as React.ReactElement<{ onPick: (o: string, l: boolean) => void; options: string[] }>;
      choices.props.onPick(choices.props.options[i], false);
    };
    pick("single", 0);
    pick("tear", 1);
    expect(seen).toEqual(["tear", "single"]);
    expect(patches).toEqual([{ template: "giveGet" }, { template: "friendPass" }]);
  });
});
