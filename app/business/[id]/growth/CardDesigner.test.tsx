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
import { basicCardDesign, defaultBasicCard, defaultCardDesign, type CardBusiness } from "@/lib/printStudio/design";
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
  return wrap(<CouponsSection businessId="b1" businessName="Modern Liquors" businessPhone={null} profile={bizProfileById("salon", locale)!} initialPromos={[]} plan={plan} printBusiness={BUSINESS} />, locale);
}
function referral(plan: Plan, locale: "en" | "es" = "en") {
  return wrap(<ReferralSection businessId="b1" businessName="Modern Liquors" businessPhone={null} profile={bizProfileById("salon", locale)!} initialReferral={null} plan={plan} printBusiness={BUSINESS} />, locale);
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const radios = (html: string, name: string) => Array.from(html.matchAll(new RegExp(`<input type="radio" name="${name}"[^>]*>`, "g"))).map((m) => m[0]);

/** Every tab's content, as Free/Grow (premium=false) or Premium sees it. */
function tabs(premium: boolean, kind: "coupon" | "referral" = "coupon") {
  const value = premium ? defaultCardDesign(kind, "en", "Modern Liquors", "bottle") : basicCardDesign(defaultBasicCard(kind, "en", "Modern Liquors"), "en");
  const list = cardTabs({
    locale: "en",
    value,
    update: () => {},
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
    for (const [plan, current] of [["free", "Free"], ["grow", "Grow"], ["premium", "Premium"], ["multi", "Premium"]] as const) {
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

  test("Free: preview, but Download / Print / PNG are locked — 'Print and download with Grow'", () => {
    const html = render("free");
    expect(html).toContain('data-testid="outputs-locked"');
    expect(text(html)).toContain("Print and download with Grow");
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>[\s\S]*?Download PDF/);
    expect(html).toContain("High-res (2×) for social");
  });

  test("buttons say exactly what happens", () => {
    const t = text(render("grow"));
    expect(t).toContain("Save & start tracking");
    expect(t).toMatch(/Adds it to Active (offers|referrals) so you can count redemptions — PostScore doesn't see your register\./);
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
    expect(byId.qr).toMatch(/<select[^>]*><option value="review"/);
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
  test("the choice sits at the top: Single card (default) · Tear-in-half · Share digitally", () => {
    const html = referral("grow");
    expect(html.indexOf('data-testid="pass-on"')).toBeLessThan(html.indexOf('data-testid="how-it-works"'));
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
    for (const p of ["single", "tear", "digital"] as const) expect(steps(p)).toContain("tap +1 in Active referrals");
  });

  test("Share (image + message) appears for the digital option", async () => {
    const { ReferralBuilder } = await import("./ReferralBuilder");
    const builder = (passOn: "single" | "digital") =>
      text(wrap(<ReferralBuilder businessId="b1" businessName="Modern Liquors" passOn={passOn} profile={bizProfileById("salon", "en")!} activeCount={0} maxActive={1} onStart={vi.fn()} plan="grow" printBusiness={BUSINESS} />));
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
