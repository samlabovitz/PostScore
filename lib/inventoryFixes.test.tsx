import { describe, expect, test, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

// The loose ends from the feature inventory: honest Google-write wording
// behind one launch switch, no photo editing claimed, the Past reports
// lock, PostStudio's "Coming soon" on the Overview, and /dev/cancel-flow
// closed outside local development.

vi.mock("server-only", () => ({}));
const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
}));
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1" }));

import { messages, t, LocaleProvider } from "./i18n";
import { GOOGLE_WRITES_COPY, GOOGLE_WRITES_FOR_EVERYONE, googleWritesCopy, postingRepliesSoon } from "./googleWritesLaunch";
import { NO_FACTS } from "./upgradePromos";
import { UpgradeProvider } from "@/components/upgrade/UpgradeContext";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Google writes: one launch switch (lib/googleWritesLaunch.ts)", () => {
  test("off until GOOGLE_WRITES_LIVE_PLACES is on for real customers", () => {
    expect(GOOGLE_WRITES_FOR_EVERYONE).toBe(false);
    expect(postingRepliesSoon()).toBe(true);
    expect(postingRepliesSoon(true)).toBe(false);
  });

  test("every wording has EN + ES both ways; until launch it says Beta (or, for the Premium replies bullet, coming soon); after, neither", () => {
    for (const [id, [beta, live]] of Object.entries(GOOGLE_WRITES_COPY)) {
      expect(googleWritesCopy(id as keyof typeof GOOGLE_WRITES_COPY, false)).toBe(beta);
      expect(googleWritesCopy(id as keyof typeof GOOGLE_WRITES_COPY, true)).toBe(live);
      for (const locale of ["en", "es"] as const) {
        const before = messages[locale][beta];
        const after = messages[locale][live];
        expect(before, `${locale} ${beta}`).toBeTruthy();
        expect(after, `${locale} ${live}`).toBeTruthy();
        if (id === "repliesBullet") expect(before).toMatch(/coming soon|próximamente/);
        else expect(before, `${locale} ${beta}`).toContain("Beta");
        // After launch: no Beta, and posting replies is no longer "coming soon"
        // (Google insights still are — they aren't built).
        expect(after, `${locale} ${live}`).not.toContain("Beta");
        expect(after, `${locale} ${live}`).not.toMatch(/(replies|respuestas)[^·.]*(coming soon|próximamente)/i);
      }
    }
  });

  test("nothing claims Google listing fixes or replies are 'done for you' / coming soon any more", () => {
    for (const locale of ["en", "es"] as const)
      for (const key of ["dashboard.googleProfile.connectBody", "dashboard.gbp.premiumUpsell", "dashboard.settings.plans.promise.premium", "dashboard.upgrade.unlock.connect", "dashboard.free.showroom.growth.p1", "dashboard.settings.plans.value.repliesUnlimited"] as const)
        expect(t(locale, key), `${locale} ${key}`).not.toMatch(/fixes are coming soon|arreglos de la ficha llegan|auto-post|automática próximamente|fix your listing for you|arregle su ficha por usted|fixes done for you|arreglos hechos por usted/i);
    // The Premium bullet keeps "coming soon" for posting replies, as decided.
    expect(t("en", "dashboard.settings.plans.bullet.premium.replies")).toContain("Posting replies to Google: coming soon");
  });

  test("photos aren't editable: no wording says they are (EN + ES)", () => {
    for (const locale of ["en", "es"] as const)
      for (const key of ["dashboard.googleProfile.editingBody", "dashboard.settings.plans.bullet.premium.fixes", "dashboard.settings.plans.bullet.premium.fixesLive", "dashboard.free.planList.googleProfile.l"] as const)
        expect(t(locale, key), `${locale} ${key}`).not.toMatch(/photo|foto/i);
    expect(t("en", "dashboard.googleProfile.editingBody")).toBe("Hours, phone and description — without leaving PostScore.");
    expect(t("es", "dashboard.googleProfile.editingBody")).toBe("Horario, teléfono y descripción — sin salir de PostScore.");
  });
});

describe("Past reports: Download is Premium in the page, like the server", () => {
  const row = { weekStart: "2026-10-19", weekEnd: "2026-10-25", score: 72, delta: 3, olderScoringVersion: null };
  const render = async (plan: "grow" | "premium" | "multi", locale: "en" | "es" = "en") => {
    const { PastReports } = await import("@/components/reports/PastReports");
    return renderToStaticMarkup(
      <LocaleProvider locale={locale} timeZone="America/New_York">
        <UpgradeProvider value={{ businessId: "b1", plan, facts: NO_FACTS, cards: [] }}>
          <PastReports businessId="b1" initial={{ rows: [row] as never, total: 1, years: [2026] }} />
        </UpgradeProvider>
      </LocaleProvider>
    );
  };

  test("Grow: a locked Premium Download; Premium and Multi: the real Download", async () => {
    const grow = await render("grow");
    expect(grow).toContain('data-testid="past-report-locked"');
    expect(text(grow)).toContain("Premium");
    for (const plan of ["premium", "multi"] as const) expect(await render(plan), plan).not.toContain("past-report-locked");
    expect(text(await render("grow", "es"))).toContain("Premium");
  });

  test("the route refuses below Premium too", () => {
    expect(readFileSync("app/api/business/[id]/weekly-report-pdf/route.ts", "utf8")).toContain('if (!isPremiumPlan(await getPlan())) return NextResponse.json({ error: "premium_only" }, { status: 403 });');
  });
});

describe("PostStudio on the paid Overview", () => {
  test("labeled Coming soon (EN + ES)", async () => {
    const { StudioComingSoon } = await import("@/components/overview/StudioComingSoon");
    for (const [locale, word] of [["en", "Coming soon"], ["es", "Próximamente"]] as const) {
      const html = renderToStaticMarkup(
        <LocaleProvider locale={locale} timeZone="America/New_York">
          <StudioComingSoon businessId="b1" />
        </LocaleProvider>
      );
      expect(html).toMatch(new RegExp(`data-testid="poststudio-soon"[^>]*>${word}<`));
    }
  });
});

describe("/dev/cancel-flow is local development only", () => {
  test("a 404 in production (and anywhere but development), before any login check", async () => {
    const { default: Page } = await import("@/app/dev/cancel-flow/page");
    const env = process.env as Record<string, string | undefined>;
    const before = env.NODE_ENV;
    try {
      for (const mode of ["production", "test"]) {
        env.NODE_ENV = mode;
        notFound.mockClear();
        await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
        expect(notFound).toHaveBeenCalledTimes(1);
      }
    } finally {
      env.NODE_ENV = before;
    }
  });
});

describe("removed: the unused report-pdf route and the devPlanSwitch props", () => {
  test("gone, and nothing points at them", () => {
    expect(existsSync("app/api/business/[id]/report-pdf/route.ts")).toBe(false);
    expect(readFileSync("lib/reports/reportPdf.server.ts", "utf8")).not.toContain("reportFileName");
  });
});
