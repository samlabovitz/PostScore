import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type { AssistantBusinessProfile } from "@/lib/assistant";
import { BusinessMemoryPanel } from "./BusinessMemoryPanel";

// BusinessMemoryPanel.tsx imports updateBusinessProfile/
// updateBusinessTypeOverride from app/actions/businesses.ts for its
// (unexercised in this static-render test) edit flow — that module
// transitively imports lib/websiteScreenshotUpload.ts's
// `import "server-only"` guard, which hard-throws outside Next's own
// build pipeline. Stubbed here since this test only renders the
// read-only confirmed-fixed list, never clicks "Edit" or saves.
// Vitest hoists vi.mock calls above the imports above at run time, so
// the static import of BusinessMemoryPanel still resolves against this
// mock despite appearing first in source.
vi.mock("@/app/actions/businesses", () => ({
  updateBusinessProfile: vi.fn(),
  updateBusinessTypeOverride: vi.fn(),
}));

const PROFILE: AssistantBusinessProfile = {
  businessType: "Restaurant & Food Service",
  businessTypeId: "restaurant",
  autoDetectedBusinessType: "Restaurant & Food Service",
  autoDetectedBusinessTypeId: "restaurant",
  businessTypeOverridden: false,
  referralOk: true,
  couponPresets: [],
  referralPresets: [],
  location: "123 River St, Springfield",
  services: [],
  avgJobValueLow: null,
  avgJobValueHigh: null,
  scoreHistory: [],
  fixedItems: [
    // The exact kind of value lib/actionPlan.ts's points math can
    // produce from ordinary binary floating-point error — never a
    // real, intentional fraction.
    { label: "Photos on listing", pointsGained: 14.399999999999999, verifiedAt: "1/15/2026" },
    { label: "Uses HTTPS", pointsGained: 5.999999999999999, verifiedAt: null },
  ],
};

describe("BusinessMemoryPanel — confirmed-fixed points rendering", () => {
  test("rounds pointsGained to one decimal, with a verified date, never a raw floating-point artifact", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <BusinessMemoryPanel businessId="biz-1" profile={PROFILE} />
      </LocaleProvider>
    );

    expect(html).not.toContain("14.399999999999999");
    expect(html).toContain("+14.4 pts");
  });

  test("rounds pointsGained to one decimal with no date too, never a raw floating-point artifact", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <BusinessMemoryPanel businessId="biz-1" profile={PROFILE} />
      </LocaleProvider>
    );

    expect(html).not.toContain("5.999999999999999");
    expect(html).toContain("+6.0 pts");
  });
});
