import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// A Done check never shows a fix button, and a check PostScore couldn't
// score is never counted as a fix — so a column never says "Nothing left
// to fix here" next to "1 fix →" (the real Hair Express case: Google's
// speed test couldn't find its page's main content). The website link and
// customer details stay changeable from the Google Profile tab.

import { CategoryCard } from "@/components/scoring/CategoryCard";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { ScoreBreakdownPanel } from "@/components/overview/ScoreBreakdownPanel";
import { websiteFixSummary } from "@/app/business/[id]/website/WebsiteScoreBreakdown";
import { websiteFixPlan } from "@/lib/websiteFixes";
import { LocaleProvider, type Locale } from "@/lib/i18n";
import type { CategoryResult, CheckResult } from "@/lib/scoring";

const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);

const check = (id: string, earned: number | null, max: number, extra: Partial<CheckResult> = {}): CheckResult =>
  ({ id, label: id, explanation: "", earnedPoints: earned, maxPoints: max, confidence: earned === null ? "NOT_FOUND" : "VERIFIED", gaps: [], ...extra }) as CheckResult;

const category = (id: CategoryResult["id"], checks: CheckResult[]): CategoryResult =>
  ({
    id,
    label: id === "website" ? "Website" : id === "completeness" ? "Google Listing Completeness" : "Visibility",
    weight: 30,
    checks,
    relativeScore: 100,
    earnedPoints: checks.reduce((s, c) => s + (c.earnedPoints ?? 0), 0),
    possiblePoints: checks.reduce((s, c) => s + (c.earnedPoints === null ? 0 : c.maxPoints), 0),
  }) as unknown as CategoryResult;

// Hair Express's website column, as scored on Nov 10.
const HAIR_WEBSITE = [
  check("website.has_website", 4, 4),
  check("website.https", 5, 5),
  check("website.performance_mobile", null, 3, { gaps: ["no_main_content"] }),
  check("website.links", null, 2),
  check("website.content_depth", 5, 5),
];

describe("a check we couldn't score is something to look at, never a fix", () => {
  test("Hair Express: the speed guide (no main content) is 1 thing to look at, 0 fixes", () => {
    const plan = websiteFixPlan(HAIR_WEBSITE, null);
    expect(plan.fixes).toEqual([]);
    expect(plan.lookAt).toEqual([{ checkId: "website.performance_mobile", gap: "no_main_content", kind: "web_person", minutes: null }]);
    expect(plan.webPersonCount).toBe(0);
  });

  test("a check losing points is still a fix", () => {
    const plan = websiteFixPlan([...HAIR_WEBSITE, check("website.social_links", 0, 1)], null);
    expect(plan.fixes.map((f) => f.checkId)).toEqual(["website.social_links"]);
    expect(plan.lookAt).toHaveLength(1);
  });

  test("the Website tab's summary: “Nothing to fix · 1 thing to look at below” (EN + ES), never “1 needs a web person”", () => {
    const plan = websiteFixPlan(HAIR_WEBSITE, null);
    expect(websiteFixSummary(plan, "en")).toBe("Nothing to fix · 1 thing to look at below.");
    expect(websiteFixSummary(plan, "es")).toBe("Nada que arreglar · 1 cosa para revisar abajo.");
    expect(websiteFixSummary(websiteFixPlan([check("website.https", 5, 5)], null), "en")).toBe("Nothing to fix on the website checks we could run.");
  });

  test("Overview: the Website column says “Nothing left to fix here” and “1 thing to look at →” — never “1 fix” (EN + ES)", () => {
    const panel = (locale: Locale) =>
      wrap(
        <ScoreBreakdownPanel businessId="b1" categories={[category("website", HAIR_WEBSITE)]} hasWebsite scoreBasis={100} websiteFixCount={0} websiteLookAtCount={1} />,
        locale
      );
    const en = panel("en");
    expect(en).toContain("Nothing left to fix here");
    expect(en).toContain("1 thing to look at");
    expect(en).not.toMatch(/\b1 fix\b/);
    const es = panel("es");
    expect(es).toContain("1 cosa para revisar");
    expect(es).not.toContain("1 arreglo");
    // Nothing at all to look at: the plain "Nothing to fix".
    expect(wrap(<ScoreBreakdownPanel businessId="b1" categories={[category("website", HAIR_WEBSITE)]} hasWebsite scoreBasis={100} websiteFixCount={0} websiteLookAtCount={0} />)).toContain("Nothing to fix");
  });

  test("every column: “Nothing left to fix here” only when no check needs work; a couldn't-check row never counts", () => {
    const cats = [
      category("visibility", [check("visibility.review_replies", null, 6), check("visibility.rating", 14, 14)]),
      category("completeness", [check("completeness.website_link", 4, 4), check("completeness.photos", null, 4)]),
      category("website", HAIR_WEBSITE),
    ];
    const html = wrap(<ScoreBreakdownPanel businessId="b1" categories={cats} hasWebsite scoreBasis={100} websiteFixCount={0} websiteLookAtCount={1} />);
    expect(html.match(/Nothing left to fix here/g)).toHaveLength(3);
  });
});

describe("a Done check shows no fix button", () => {
  const premiumConnected = { premium: true, connected: true, undo: null, websiteUndo: null };
  const row = (c: CheckResult, state = premiumConnected) =>
    wrap(
      <GbpEditProvider value={state}>
        <CategoryCard category={category("completeness", [c])} embedded fixLinks={{}} businessId="b1" />
      </GbpEditProvider>
    );

  test("website link Done (4/4): no “Update website on Google” — not even for Premium + connected", () => {
    const html = row(check("completeness.website_link", 4, 4));
    expect(html).not.toContain("website-link-fix");
    expect(html).not.toContain('data-testid="row-actions"');
  });

  test("website link losing points (Colorful Yun Nan, 0/4): the button shows (Premium + connected) or the steps (other plans)", () => {
    expect(row(check("completeness.website_link", 0, 4))).toContain('data-testid="website-link-fix"');
    expect(row(check("completeness.website_link", 0, 4), { premium: false, connected: false, undo: null, websiteUndo: null })).toContain('data-testid="website-link-fix-manual"');
  });

  test("customer details Done (3/3): no “Update on Google”; needs work (1/3): it shows", () => {
    const meta = { parts: "accessibility,parking", ownerRemoved: "", ownerCanRemove: "" };
    expect(row(check("completeness.customer_details", 3, 3, { meta }))).not.toContain("gbp-edit");
    expect(row(check("completeness.customer_details", 1, 3, { meta, gaps: ["accessibility"] }))).toContain("Update on Google");
  });

  test("the Google Profile tab keeps both editors (with their Undo) for Premium + connected, under Edit on Google", () => {
    const panel = readFileSync("components/gbp/GoogleProfilePanel.tsx", "utf8");
    expect(panel).toContain('data-testid="edit-website-link"');
    expect(panel).toContain("<WebsiteLinkFix businessId={businessId} suggested={gbpEdit.websiteSuggested ?? null} autoLoad />");
    expect(panel).toContain('data-testid="edit-customer-details"');
    expect(panel).toContain("<CustomerDetailsGoogleEdit businessId={businessId} autoLoad />");
    const growth = readFileSync("app/business/[id]/growth/page.tsx", "utf8");
    expect(growth).toContain("websiteUndo: await getWebsiteLinkUndoForPage(params.id)");
  });
});
