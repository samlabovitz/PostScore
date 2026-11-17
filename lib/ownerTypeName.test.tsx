import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/actions/niches", () => ({ confirmBusinessNiche: vi.fn(), setBusinessNiche: vi.fn(), updateCompetitorsForNiche: vi.fn() }));

import { LocaleProvider, type Locale } from "./i18n";
import { NichePicker } from "@/components/niche/NichePicker";
import { ownerTypeName } from "./niches";
import { ownerCompetitorNoun } from "./competitorQuery";

const src = (f: string) => readFileSync(f, "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const settings = (nicheId: string, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <NichePicker businessId="cc" nicheId={nicheId} source="owner" suggestion={null} />
    </LocaleProvider>
  );

describe("owners see their niche as their business type", () => {
  test("Centered Clay in Settings: 'Art & pottery classes', the top-level type only small under it (EN + ES)", () => {
    const en = settings("art_classes");
    expect(text(en)).toContain("Art & pottery classes");
    expect(en).toMatch(/data-testid="niche-parent">Tutoring &amp; Education · </);
    const es = settings("art_classes", "es");
    expect(text(es)).toContain("Clases de arte y cerámica");
    expect(es).toMatch(/data-testid="niche-parent">Tutoría y educación · </);
    // A general niche is the top-level type itself: no second line.
    expect(settings("tutor_education")).not.toContain('data-testid="niche-parent"');
  });

  test("the name and the competitor words: the niche's when more specific, else the type's", () => {
    expect(ownerTypeName("art_classes", "Tutoring & Education", "en")).toBe("Art & pottery classes");
    expect(ownerTypeName("art_classes", "Tutoría y educación", "es")).toBe("Clases de arte y cerámica");
    expect(ownerTypeName("tutor_education", "Tutoring & Education", "en")).toBe("Tutoring & Education");
    expect(ownerTypeName(null, "Salon", "en")).toBe("Salon");
    expect(ownerTypeName("not_a_niche", "Salon", "en")).toBe("Salon");
    // Other niches: the full name, never a list shorthand like "Chinese".
    expect(ownerTypeName("chinese", "Restaurant & Food Service", "en")).toBe("Chinese restaurant");
    expect(ownerTypeName("chinese", "Restaurante y servicio de comida", "es")).toBe("Restaurante chino");
    expect(ownerCompetitorNoun("art_classes", "tutoring services", "en")).toBe("art & pottery studios");
    // Spanish: the sentences add "de la zona" themselves.
    expect(ownerCompetitorNoun("art_classes", "servicios de tutoría", "es")).toBe("estudios de arte y cerámica");
    expect(ownerCompetitorNoun("tutor_education", "tutoring services", "en")).toBe("tutoring services");
    expect(ownerCompetitorNoun(null, "salons", "en")).toBe("salons");
  });

  test("PostAI, the Competitors page, reports, the monthly email, Pricing and Campaigns use them", () => {
    expect(src("app/actions/assistant.ts")).toContain("nicheName: competitorScope && !isGeneralNiche(competitorScope.nicheId) ? nicheName(competitorScope.nicheId, locale) : null,");
    expect(src("lib/assistant.ts")).toContain("`Business type: ${context.profile.nicheName} (a kind of ${context.profile.businessType} business).");
    expect(src("components/assistant/BusinessMemoryPanel.tsx")).toContain('data-testid="memory-niche"');
    expect(src("app/actions/competitors.ts").match(/ownerCompetitorNoun\(/g)).toHaveLength(2);
    expect(src("lib/weekly/weeklyData.server.ts")).toContain("ownerCompetitorNoun((await loadBusinessNiche(supabase, businessId))?.resolved.nicheId, profile.competitorNoun, locale)");
    expect(src("app/api/cron/monthly-reports/route.ts").match(/competitorNoun: ownerNoun/g)).toHaveLength(2);
    expect(src("app/business/[id]/reports/page.tsx")).toContain("rankNoun={ownerCompetitorNoun(");
    expect(src("app/business/[id]/pricing/page.tsx")).toContain("label: ownerTypeName(nicheId, profile.label, locale), competitorNoun: ownerCompetitorNoun(nicheId, profile.competitorNoun, locale)");
    expect(src("app/business/[id]/campaigns/page.tsx")).toContain("label: ownerTypeName(");
  });
});
