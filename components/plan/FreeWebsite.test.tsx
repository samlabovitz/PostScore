import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// The download route and the preview page, with the session and the
// business row (RLS) faked: "b1" is the signed-in owner's, anything else
// isn't readable.
const plan = vi.hoisted(() => ({ current: "free" as string }));
vi.mock("@/lib/premium", () => ({ getPlan: () => plan.current }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      select: () => ({
        eq: (_col: string, id: string) => ({ maybeSingle: async () => ({ data: id === "b1" ? { id } : null }) }),
      }),
    }),
  }),
}));
vi.mock("@/app/actions/businesses", () => ({
  getBusinessSummary: async (id: string) => (id === "b1" ? { status: "ok", business: { id, language: "en" } } : { status: "not_found" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/upgradePromos.server", () => ({
  loadUpgradeContext: async (businessId: string) => ({ businessId, plan: plan.current, facts: (await import("@/lib/upgradePromos")).NO_FACTS, cards: [] }),
}));
vi.mock("@/app/actions/websiteScreenshots", () => ({ refreshWebsiteScreenshots: vi.fn() }));

import { LocaleProvider } from "@/lib/i18n";
import { NO_FACTS } from "@/lib/upgradePromos";
import { UpgradeProvider } from "@/components/upgrade/UpgradeContext";
import { DevPlanPill } from "@/components/dev/DevPlanPill";
import { starterSiteDownload } from "@/lib/starterSiteDownload";
import { POST } from "@/app/api/business/[id]/starter-site/route";
import StarterPreviewPage, { metadata } from "@/app/business/[id]/website/preview/page";
import { halfPoints, WebsiteScoreCompact } from "@/app/business/[id]/website/WebsiteScoreBreakdown";
import { WebsiteVisualAnalysis } from "@/app/business/[id]/website/WebsiteVisualAnalysis";
import type { CategoryResult, CheckResult } from "@/lib/scoring";
import { PostStudioShowcase } from "@/app/business/[id]/website/PostStudioShowcase";
import { WebsiteGeneratorSection } from "@/app/business/[id]/website/WebsiteGeneratorSection";

const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      <UpgradeProvider value={{ businessId: "b1", plan: "free", facts: NO_FACTS, cards: [] }}>{node}</UpgradeProvider>
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const SITE = "<!doctype html><html><body>Test Salon</body></html>";
const post = (id: string, body: unknown) =>
  POST({ json: async () => body } as never, { params: { id } });

afterEach(() => {
  plan.current = "free";
  vi.unstubAllEnvs();
});

describe("the starter site on Free: customize freely, download with Grow", () => {
  test("the server refuses the download on Free, even for a valid page", async () => {
    expect(starterSiteDownload("free", SITE)).toEqual({ status: "plan_required" });
    const res = await post("b1", { html: SITE });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "plan_required" });
  });

  test("Grow and up get the file; only a real page is accepted", async () => {
    plan.current = "grow";
    const res = await post("b1", { html: SITE });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe("attachment");
    expect(await res.text()).toBe(SITE);
    expect((await post("b1", { html: "<script>x</script>" })).status).toBe(400);
    expect(starterSiteDownload("premium", "x".repeat(10))).toEqual({ status: "bad_request" });
  });

  test("someone else's business: not found, whatever the plan", async () => {
    plan.current = "premium";
    expect((await post("b2", { html: SITE })).status).toBe(404);
  });

  test("the builder downloads through the route on every plan (no browser-only download)", () => {
    const src = readFileSync("app/business/[id]/website/StarterSiteBuilder.tsx", "utf8");
    expect(src).toContain("/api/business/${businessId}/starter-site");
  });
});

describe("the full preview: owner-only, watermarked, never indexed", () => {
  test("the owner gets the watermark over the whole page and the footer; no download", async () => {
    const html = renderToStaticMarkup(await StarterPreviewPage({ params: { id: "b1" } }));
    expect(html).toContain('data-testid="preview-watermark"');
    expect(html).toMatch(/aria-hidden="true" data-testid="preview-watermark" class="pointer-events-none/);
    expect(html.match(/Preview · Made with PostScore · Download with Grow/g)!.length).toBeGreaterThan(20);
    expect(text(html)).toContain("© PostScore preview");
    // The bar sits above the site, outside the watermark: back to the Website page, what this is, Download with Grow.
    const bar = html.slice(html.indexOf('data-testid="preview-bar"'), html.indexOf("</header>"));
    expect(bar).toContain('href="/business/b1/website"');
    expect(text(bar)).toContain("Back to PostScore");
    expect(text(bar)).toContain("Preview of your starter website");
    expect(bar).toContain('data-testid="preview-download"');
    expect(text(bar)).toContain("Download with Grow");
    expect(html.indexOf("preview-bar")).toBeLessThan(html.indexOf("preview-watermark"));
    // Light: small, very transparent, widely spaced; never catches a click (the map and its links work).
    expect(html).toMatch(/text-\[15px\][^"]*text-ink\/\[0\.07\]/);
    expect(html).not.toMatch(/\bdownload=|starter-site"/);
  });

  test("Grow and up see no 'Download with Grow' in the bar", async () => {
    plan.current = "grow";
    const html = renderToStaticMarkup(await StarterPreviewPage({ params: { id: "b1" } }));
    expect(html).toContain('data-testid="preview-back"');
    expect(html).not.toContain("preview-download");
  });

  test("anyone else: not found", async () => {
    await expect(StarterPreviewPage({ params: { id: "b2" } })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  test("noindex, nofollow; the site only arrives from the Website page in the same browser", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    const frame = readFileSync("app/business/[id]/website/preview/StarterPreviewFrame.tsx", "utf8");
    expect(frame).toContain("event.origin !== window.location.origin || event.source !== window.opener");
    expect(frame).toContain('sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"');
  });
});

describe("the Website page on Free", () => {
  const check = (id: string, label: string, max: number, earned: number | null, confidence = "VERIFIED"): CheckResult =>
    ({ id, label, category: "website", maxPoints: max, earnedPoints: earned, confidence, explanation: `EXPLANATION ${id} Lighthouse 39/100`, meta: null }) as CheckResult;
  const category = {
    id: "website",
    label: "Website",
    weight: 30,
    possiblePoints: 28,
    earnedPoints: 21,
    relativeScore: 75,
    checks: [check("website.https", "HTTPS", 4, 4), check("website.performance_mobile", "Mobile speed", 6, 2), check("website.meta", "Description", 3, 0), check("website.security", "Site security", 2, null, "UNCERTAIN")],
  } as unknown as CategoryResult;

  test("ONE compact score card: ring, points, grade, each check's name with a status chip and points — nothing else", () => {
    const html = wrap(<WebsiteScoreCompact websiteCategory={category} />);
    const t = text(html);
    expect(t).toContain("75/100");
    expect(t).toContain("21/28 pts");
    expect(html.match(/data-testid="compact-check"/g)).toHaveLength(4);
    for (const s of ["HTTPS Done 4 / 4", "Mobile speed Needs work 2 / 6", "Description Needs work 0 / 3", "Site security Couldn't check — / 2"]) expect(t).toContain(s);
    expect(t).not.toContain("EXPLANATION");
    expect(t).not.toContain("Lighthouse");
    expect(t).toContain("See exactly what's wrong and how to fix each one — Grow.");
    expect(html).toContain('data-testid="see-plans-link"');
    expect(text(wrap(<WebsiteScoreCompact websiteCategory={category} />, "es"))).toContain("Vea exactamente qué falla");
  });

  test("the screenshot card: shown as is, Refresh opens the promo box (no capture on Free)", () => {
    const html = wrap(<WebsiteVisualAnalysis businessId="b1" websiteAnalysis={null} siteUrl="https://example.com" locked />);
    expect(html).toMatch(/data-testid="shot-refresh-locked"/);
    expect(html).toContain('aria-haspopup="dialog"');
  });

  test("half points read as ½", () => {
    expect([halfPoints(0.5), halfPoints(2.5), halfPoints(3), halfPoints(13.6), halfPoints(null)]).toEqual(["½", "2½", "3", "13.6", "—"]);
    const half = { ...category, checks: [check("website.about_presence", "About page", 0.5, 0.5)] } as CategoryResult;
    expect(text(wrap(<WebsiteScoreCompact websiteCategory={half} />))).toContain("About page Done ½ / ½");
  });

  test("Free page order: screenshot → compact score → path A (locked how-to, Re-check) → path B", () => {
    const page = readFileSync("app/business/[id]/website/page.tsx", "utf8");
    const free = page.slice(page.indexOf("{free ? ("), page.indexOf("        ) : (\n          // Grow, Premium and Multi"));
    const order = (src: string, parts: string[]) => parts.map((p) => src.indexOf(p)).every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1]));
    expect(order(free, ["{visualAnalysis}", "<WebsiteScoreCompact", "generatorSection(", "fixGuidesTitle", 'feature="recheck"'])).toBe(true);
    expect(free).not.toContain("scoreBreakdown");
  });

  test("Grow/Premium/Multi page order: screenshot → score + full breakdown → path A (progress, guides link, working Re-check) → path B", () => {
    const page = readFileSync("app/business/[id]/website/page.tsx", "utf8");
    const paid = page.slice(page.indexOf("        ) : (\n          // Grow, Premium and Multi"), page.indexOf("    </DashboardShell>"));
    const order = (src: string, parts: string[]) => parts.map((p) => src.indexOf(p)).every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1]));
    expect(order(paid, ["{visualAnalysis}", '<div id="website-checks"', "{scoreBreakdown}", "generatorSection(", 'data-testid="checks-left"', 'href="#website-checks"', "<WebsiteRecheck"])).toBe(true);
    expect(paid).not.toMatch(/WebsiteScoreCompact|LockedPreview/);
  });

  test("the 'normally lives on your Website page' note is gone everywhere (the Website page is open on Free)", () => {
    for (const f of ["app/business/[id]/website/page.tsx", "app/business/[id]/website/WebsiteVisualAnalysis.tsx", "app/business/[id]/page.tsx", "app/business/[id]/BusinessScoreView.tsx"]) {
      expect(readFileSync(f, "utf8"), f).not.toContain("dashboard.free.shotLabel");
    }
    const html = wrap(<WebsiteVisualAnalysis businessId="b1" websiteAnalysis={null} siteUrl="https://example.com" locked />);
    expect(text(html)).not.toContain("normally lives on your Website page");
  });
});

// The generator section as each plan sees it (the real component, real FAQ).
const section = (over: { plan: "free" | "grow" | "premium" | "multi"; realSite: boolean; socialPlatform?: string | null }, locale: "en" | "es" = "en") =>
  wrap(
    <WebsiteGeneratorSection
      businessId="b1"
      businessName="Test Salon"
      businessLanguage={locale}
      category="hair_salon"
      phone="(555) 010-0100"
      address="1 Main St"
      openingHoursPeriods={null}
      starterSiteHours={null}
      starterSiteHoursEnabled={false}
      starterSiteDetails={null}
      starterSiteDetailsEnabled={false}
      timeZone="America/New_York"
      placeId={null}
      socialLinks={[]}
      year={2026}
      storefront
      mapEmbed={null}
      profileId="salon"
      builderOfferReason={over.realSite ? "backup" : "no_website"}
      faqEn={[{ question: "Is there parking?", answer: "Yes." }]}
      faqEs={[{ question: "¿Hay estacionamiento?", answer: "Sí." }]}
      free={over.plan === "free"}
      plan={over.plan}
      realSite={over.realSite}
      socialPlatform={over.socialPlatform ?? null}
      builderName="Wix"
      pathA={<p>PATH-A-TOOLS</p>}
    />,
    locale
  );

describe("PostStudio on the Website page: one card, no publishing steps on Free", () => {
  const card = (plan: "free" | "grow" | "premium" | "multi", locale: "en" | "es" = "en") =>
    wrap(<PostStudioShowcase businessId="b1" businessName="Test Salon" plan={plan} profileId="salon" storefront />, locale);

  test("the showcase (shown on Free): headline, wireframe outlines with their name, the comparison, every plan's price, Coming soon, one button", () => {
    for (const plan of ["free", "grow", "premium"] as const) {
      const html = card(plan);
      const t = text(html);
      expect(html, plan).toContain('data-mode="showcase"');
      expect(t).toContain("Want a full website? Build it with PostStudio.");
      expect(t).toContain("Multi-page, hosted for you, and it updates your rating and hours after every scan.");
      expect(html.match(/data-testid="poststudio-outlines"[\s\S]*?<\/ul>/)![0].match(/Test Salon/g)).toHaveLength(4);
      for (const page of ["Home", "About", "Services", "Contact"]) expect(t).toContain(page);
      expect(t).toContain("Page outlines — not a real site yet");
      for (const row of ["Pages", "Hosting", "Auto-updates", "Website checks", "Built to pass every check"]) expect(t).toContain(row);
      expect(t).toContain("$30/mo on its own · +$15 on Grow · +$8 on Premium · included in Multi");
      expect(t).toContain("Coming soon");
      // "Add PostStudio" opens the PostStudio box (a button, not a checkout).
      expect(html).toMatch(/<button[^>]*data-testid="poststudio-add"[^>]*>Add PostStudio<\/button>/);
      expect(html.match(/<a /g)).toHaveLength(1);
      expect(html).toContain('href="/business/b1/studio?from=%2Fbusiness%2Fb1%2Fwebsite"');
      expect(t).toContain("See PostStudio");
    }
    expect(text(card("free", "es"))).toContain("¿Quiere un sitio web completo? Créelo con PostStudio.");
    expect(text(card("free", "es"))).toContain("Agregar PostStudio");
    expect(text(card("free", "es"))).toContain("$30/mes por sí solo");
  });

  test("with PostStudio (Multi): 'Continue in PostStudio →', no upsell", () => {
    const t = text(card("multi"));
    expect(t).toContain("Continue in PostStudio");
    expect(t).not.toMatch(/\$\d|Coming soon|Want a full website/);
  });

  test("the section, rendered: Free — A (the page's locked blocks + locked FAQ) then B (generator open, PostStudio card)", () => {
    const html = section({ plan: "free", realSite: true });
    const t = text(html);
    expect(html.indexOf('data-testid="path-fix"')).toBeLessThan(html.indexOf('data-testid="path-fresh"'));
    expect(t).toContain("Keep your current website — fix it with PostScore");
    expect(t).toContain("Like your site? Fix every issue and aim for a perfect 100/100 — PostScore shows you exactly how, in Wix.");
    expect(t).toContain("PATH-A-TOOLS");
    expect(t).toContain("FAQ draft");
    expect(t).toContain("Or start fresh with a new website");
    expect(t).toContain("Rather replace your current site? Build a new one instead.");
    const fresh = html.slice(html.indexOf('data-testid="path-fresh"'));
    expect(fresh).not.toContain("Build a one-page starter site"); // open, not collapsed
    expect(fresh.indexOf('data-testid="starter-preview-column"')).toBeLessThan(fresh.indexOf('data-testid="poststudio-showcase"'));
    expect(fresh).toContain('data-testid="poststudio-line"');
    expect(html).not.toContain("build-in-poststudio");
  });

  test("Grow/Premium: A (working tools, the real FAQ draft) then B (generator COLLAPSED, the PostStudio card with the add-on price); Multi: Continue in PostStudio", () => {
    for (const plan of ["grow", "premium"] as const) {
      const html = section({ plan, realSite: true });
      const t = text(html);
      expect(t, plan).toContain("Fix every issue and aim for a perfect 100/100 — step by step, in Wix.");
      expect(t, plan).toContain("Is there parking?");
      const fresh = html.slice(html.indexOf('data-testid="path-fresh"'));
      expect(fresh, plan).toContain("Build a one-page starter site →");
      expect(fresh, plan).not.toContain('data-testid="starter-preview-column"');
      expect(fresh, plan).toContain('data-mode="showcase"');
      expect(text(fresh), plan).toContain("+$15 on Grow · +$8 on Premium");
      expect(fresh, plan).not.toContain('data-testid="poststudio-line"');
    }
    expect(section({ plan: "multi", realSite: true })).toContain('data-mode="continue"');
  });

  test("no website or a social page: no path A; B leads (social: 'A Facebook page isn't a website'), the generator open on every plan", () => {
    for (const plan of ["free", "grow", "premium"] as const) {
      const none = section({ plan, realSite: false });
      expect(none, plan).not.toContain('data-testid="path-fix"');
      expect(none, plan).toContain('data-testid="starter-preview-column"');
      expect(text(none), plan).not.toContain("Or start fresh");
      const social = text(section({ plan, realSite: false, socialPlatform: "Facebook" }));
      expect(social, plan).toContain("A Facebook page isn't a website — build a real one.");
    }
    expect(text(section({ plan: "grow", realSite: false, socialPlatform: "Facebook" }, "es"))).toContain("Una página de Facebook no es un sitio web: cree uno de verdad.");
    const page = readFileSync("app/business/[id]/website/page.tsx", "utf8");
    expect(page).toContain("const realSite = hasWebsite && socialPlatform === null;");
  });

  test("Free has no 'How to publish it' or 'Mark as published' (only once they can download)", () => {
    const builder = readFileSync("app/business/[id]/website/StarterSiteBuilder.tsx", "utf8");
    const gate = builder.indexOf("{!free && (");
    expect(gate).toBeGreaterThan(0);
    expect(builder.indexOf("howToPublishHeading")).toBeGreaterThan(gate);
    expect(builder.indexOf("handleMarkPublished}")).toBeGreaterThan(gate);
  });
});

describe("the starter site builder layout (all plans)", () => {
  const src = () => readFileSync("app/business/[id]/website/StarterSiteBuilder.tsx", "utf8");
  test("the preview comes first on a phone (fixed height, scrolls inside) and stays in view on desktop (sticky, viewport tall)", () => {
    const s = src();
    expect(s).toContain('data-testid="starter-preview-column"');
    expect(s).toContain('className="order-first nav:order-none"');
    expect(s).toContain("nav:sticky nav:top-6 nav:h-[calc(100vh-3rem)]");
    expect(s).toContain('className="h-[480px] w-full border-0 nav:h-full"');
  });
  test("ONE actions row under it: Open full preview (left), Download your site (right) — locked with a Grow chip on Free; no separate 'See plans' row", () => {
    const s = src();
    const row = s.slice(s.indexOf('data-testid="starter-actions"'), s.indexOf("{!free && downloadError"));
    expect(row.indexOf('data-testid="open-full-preview"')).toBeLessThan(row.indexOf("downloadSiteButton"));
    expect(row).toMatch(/<UpgradeButton feature="grow" testId="starter-download-locked"/);
    expect(row).toContain('"dashboard.settings.plan.name.grow"');
    expect(s).not.toContain("<UpgradeTrigger");
    expect(s.match(/data-testid="open-full-preview/g)).toHaveLength(1);
  });
});

describe("dev plan pill", () => {
  test("renders every plan, the current one highlighted (the layout decides when — lib/premium.ts canSwitchPlan)", () => {
    const html = renderToStaticMarkup(<DevPlanPill plan="grow" />);
    expect(html).toContain('data-testid="dev-plan-pill"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Grow</);
    for (const p of ["Free", "Premium", "Multi"]) expect(html).toContain(p);
    expect(readFileSync("app/layout.tsx", "utf8")).toContain("{(await canSwitchPlan()) && <DevPlanPill plan={await getPlan()} />}");
  });
});

