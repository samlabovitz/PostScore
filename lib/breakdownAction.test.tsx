import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// The Overview score breakdown: ONE verb button per check that's missing
// points, to where it's fixed; no inline editors; Done rows have none; and
// no raw translation key ever renders (Overview breakdown, Google Profile tab).

import { breakdownAction } from "@/lib/breakdownAction";
import { CategoryCard } from "@/components/scoring/CategoryCard";
import { GbpEditProvider, optionLabel, readableId } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { GoogleProfileTab } from "@/components/gbp/GoogleProfileTab";
import { LocaleProvider, type Locale } from "@/lib/i18n";
import { businessRowToScoringInput, scoreBusiness, type BusinessScoringRow } from "@/lib/scoring";
import { breakdownFixLinks } from "@/components/overview/ScoreBreakdownPanel";

const RAW_KEY = /\b(dashboard|content|growth)\.[a-zA-Z]+\.[a-zA-Z_.]+/;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("destination per check", () => {
  const go = (checkId: string, googleTab = true, extra = {}) => breakdownAction({ businessId: "b1", checkId, googleTab, fixHref: "/business/b1/fix", ...extra });
  test("Google Profile tab editors when the business has the tab", () => {
    expect(go("completeness.customer_details", true, { missingParts: ["parking", "accessibility"] })).toEqual({ key: "addParts", params: { parts: "parking|accessibility" }, href: "/business/b1/growth?tab=google#edit-customer-details" });
    expect(go("completeness.photos")!.href).toBe("/business/b1/growth?tab=google#edit-photos");
    expect(go("completeness.hours")!.href).toBe("/business/b1/growth?tab=google#edit-hours");
    expect(go("completeness.phone")!.href).toBe("/business/b1/growth?tab=google#edit-phone");
    expect(go("completeness.website_link")!.href).toBe("/business/b1/growth?tab=google#edit-website-link");
    expect(go("website.info_consistency", true, { hoursMismatch: true })).toEqual({ key: "compareHours", href: "/business/b1/growth?tab=google#compare-hours" });
  });
  test("reviews and the website", () => {
    expect(go("visibility.review_replies")).toEqual({ key: "replyReviews", href: "/business/b1/website-reviews#google-reviews" });
    expect(go("visibility.review_count")!.key).toBe("moreReviews");
    expect(go("website.performance_mobile")).toEqual({ key: "fixWebsite", href: "/business/b1/website#check-performance_mobile" });
  });
  test("without the Google Profile tab: the check's fix page", () => {
    expect(go("completeness.photos", false)!.href).toBe("/business/b1/fix");
    expect(go("website.info_consistency", false, { hoursMismatch: true })!.key).toBe("fixWebsite");
  });
});

const wrap = (node: ReactNode, locale: Locale = "en", gbp = { premium: true, connected: true }) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <GbpEditProvider value={{ ...gbp, undo: null, canEdit: true }}>{node}</GbpEditProvider>
    </LocaleProvider>
  );

// A listing with several gaps: no hours, no phone link, no customer details…
const GAPS = { id: "b1", name: "Test salon", place_id: "p1", listing_mode: "storefront", address: "1 Main St", phone: null, website: null, rating: 4.1, review_count: 6, category: "Hair Salon", categories: ["hair_salon"], primary_type: "hair_salon", opening_hours: null, photo_count: 2, business_status: "OPERATIONAL" } as unknown as BusinessScoringRow;

describe("the breakdown cards", () => {
  const breakdown = scoreBusiness(businessRowToScoringInput(GAPS));
  const links = breakdownFixLinks(breakdown.categories, "b1", "en");
  for (const locale of ["en", "es"] as const) {
    test(`one button per card missing points, none on Done, no inline editors, no raw keys (${locale})`, () => {
      for (const category of breakdown.categories) {
        const html = wrap(<CategoryCard category={category} embedded fixLinks={links} businessId="b1" />, locale);
        const needsWork = category.checks.filter((c) => c.earnedPoints !== null && c.earnedPoints < c.maxPoints && !(c.id === "visibility.rating" && (c.meta?.ratingBand === "excellent" || c.meta?.ratingBand === "good"))).length;
        const buttons = (html.match(/data-testid="row-action"/g) ?? []).length;
        expect([category.id, buttons <= needsWork]).toEqual([category.id, true]);
        for (const block of html.split('data-testid="row-actions"').slice(1)) expect((block.split("</div>")[0].match(/<a /g) ?? []).length).toBeLessThanOrEqual(1);
        expect(html).not.toMatch(/data-testid="(gbp-edit|website-link-fix|fix-with-postscore|row-how-to)"/);
        expect([category.id, text(html).match(RAW_KEY)?.[0] ?? null]).toEqual([category.id, null]);
      }
    });
  }
});

describe("no raw keys on the Google Profile tab", () => {
  test("customer-detail options: our labels EN + ES, Google's name otherwise, never the key", () => {
    expect(optionLabel("attributes/has_restroom", "en")).toBe("Restroom");
    expect(optionLabel("attributes/pay_check", "es")).toBe("Cheques");
    expect(optionLabel("attributes/has_mystery_feature", "en", "Mystery feature")).toBe("Mystery feature");
    expect(optionLabel("attributes/has_mystery_feature", "en", "has_mystery_feature")).toBe("Mystery feature");
    expect(optionLabel("attributes/has_mystery_feature", "en")).toBe(readableId("has_mystery_feature"));
  });

  test("the whole tab, EN + ES", () => {
    for (const locale of ["en", "es"] as const) {
      const html = wrap(
        <GoogleProfileTab
          businessId="b1" connected practice={false} needsReconnect={false} canStart result={null} business={{ name: null, address: null }}
          listing={{ rating: 5, reviewCount: 30, photoCount: 4, phone: "(914) 320-3012", website: "https://hairexpressonbroadway.com/", category: "Hair salon", categories: ["Hair salon"], openingHours: ["Monday: Closed"], googleMapsUri: null } as never}
          checks={[]} website={null} replyCounts={null} messagingOn={false} lastScanAt="2026-11-15T12:00:00Z" hoursMismatch
          media={{ photos: { count: 4, newestAt: "2026-09-09T00:00:00Z" }, posts: { last30: 0, lastAt: null, lastType: null }, checkedAt: null }}
          extras={{ specialPeriods: [], services: ["Haircut"], categories: ["Hair salon"], description: "Hair salon", attributeIds: [], verified: true, details: { payment: true, parking: false, accessibility: false, open: 14, suggest: [] } }}
          saved={{ couponsRunning: 0, lastMonth: "2026-10", recap: { did: [], notYet: ["replies"] }, made: [{ kind: "photos", status: "undo", daysLeft: 6, at: "2026-11-15T12:00:00Z", batchId: "x", value: { photos: 3 } }], others: { fields: [], since: "2026-11-01T00:00:00Z" }, businessStatus: "OPERATIONAL", googleEdits: { available: true, open: [{ id: "e1", field: "hours", owner_value: "0|c", google_value: "0|600-1020", detected_at: "2026-11-15T00:00:00Z", resolved_at: null, resolution: null }], checkedAt: null } } as never}
        />,
        locale
      );
      expect([locale, text(html).match(RAW_KEY)?.[0] ?? null]).toEqual([locale, null]);
    }
  });
});
