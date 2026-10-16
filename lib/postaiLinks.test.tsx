import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider, t } from "@/lib/i18n";
import { CHECKS, scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { AssistantMessageContent } from "@/components/assistant/AssistantMessageContent";
import { WebsiteScoreBreakdown } from "@/app/business/[id]/website/WebsiteScoreBreakdown";
import { ASSISTANT_SYSTEM_RULES } from "@/lib/assistant";
import { checkAnchorId, parseReplyLinks, POSTAI_LINK_TARGETS, resolveLinkTarget } from "./postaiLinks";

const BIZ = "6d81975c-c576-4947-ae38-83575013c10c";

function renderReply(content: string, locale: "en" | "es" = "en", referralOk = true): string {
  return renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <AssistantMessageContent content={content} links={{ businessId: BIZ, referralOk }} />
    </LocaleProvider>
  );
}

describe("markers → links for the current business", () => {
  test("website check marker → the Website page row", () => {
    expect(resolveLinkTarget("website.performance_mobile", BIZ)?.href).toBe(`/business/${BIZ}/website#check-performance_mobile`);
    const html = renderReply("Your site is slow on phones. [[link:website.performance_mobile]]");
    expect(html).toContain(`href="/business/${BIZ}/website#check-performance_mobile"`);
    expect(html).toContain("Fix this on the Website page →");
    expect(html).not.toContain("[[");
  });

  test("other targets: reviews, pricing, coupon tab, mismatch, starter site, Overview photos row", () => {
    const href = (id: string) => resolveLinkTarget(id, BIZ)?.href;
    expect(href("reviews")).toBe(`/business/${BIZ}/website-reviews#get-more-reviews`);
    expect(href("pricing")).toBe(`/business/${BIZ}/pricing`);
    expect(href("growth.coupon")).toBe(`/business/${BIZ}/growth?tab=coupons`);
    expect(href("listing.mismatch")).toBe(`/business/${BIZ}/website#check-info_consistency`);
    expect(href("website.starter_site")).toBe(`/business/${BIZ}/website#starter-site`);
    expect(href("listing.photos")).toBe(`/business/${BIZ}#check-photos`);
  });

  test("links are same-tab (no target=_blank) and each target shows once per paragraph", () => {
    const html = renderReply("Fix speed [[link:website.performance_mobile]] and again [[link:website.performance_mobile]].");
    expect(html).not.toContain("target=");
    expect(html.match(/check-performance_mobile/g)).toHaveLength(1);
  });

  test("referral link is dropped when referrals aren't offered for this business type", () => {
    expect(renderReply("Try a referral card. [[link:growth.referral]]", "en", false)).not.toContain("href=");
    expect(renderReply("Try a referral card. [[link:growth.referral]]", "en", true)).toContain("tab=referral");
  });
});

describe("never a broken link", () => {
  test("unknown or malformed markers are dropped silently", () => {
    const html = renderReply("Do this. [[link:website.made_up]] [[link:]] [[link:../../admin]]");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("[[");
    expect(html).toContain("Do this.");
  });

  test("raw outside URLs are stripped; markdown links keep only their words", () => {
    const segments = parseReplyLinks("See https://evil.example/x or www.foo.com and [Google](https://google.com).", BIZ);
    const text = segments.map((s) => (s.kind === "text" ? s.text : "")).join("");
    expect(text).not.toMatch(/https?:|www\.|evil|foo\.com|google\.com/);
    expect(text).toContain("Google");
    expect(segments.some((s) => s.kind === "link")).toBe(false);
  });

  test("a raw in-app path for THIS business becomes the link; another business's path is stripped", () => {
    const own = parseReplyLinks(`Go to /business/${BIZ}/pricing now.`, BIZ);
    expect(own.find((s) => s.kind === "link")).toMatchObject({ id: "pricing" });
    const other = parseReplyLinks("Go to /business/someone-else/pricing now.", BIZ);
    expect(other.some((s) => s.kind === "link")).toBe(false);
    expect(other.map((s) => (s.kind === "text" ? s.text : "")).join("")).not.toContain("/business/");
  });

  test("no business id → markers are dropped, never a link to /business//…", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <AssistantMessageContent content="Fix it. [[link:website]]" />
      </LocaleProvider>
    );
    expect(html).not.toContain("href=");
  });
});

describe("labels", () => {
  test("every target has an EN and a distinct ES label", () => {
    for (const target of Object.values(POSTAI_LINK_TARGETS)) {
      const en = t("en", target.label);
      const es = t("es", target.label);
      expect(en).not.toBe(target.label);
      expect(es).not.toBe(en);
      expect(en.endsWith("→")).toBe(true);
    }
  });
  test("Spanish reply renders the Spanish label", () => {
    expect(renderReply("Su sitio es lento. [[link:website.performance_mobile]]", "es")).toContain("Arréglelo en la página Sitio web →");
  });
});

describe("anchors exist where links point", () => {
  test("the Website page has a row anchor for every website check", () => {
    const category = scoreBusiness(scoringInput()).categories.find((c) => c.id === "website")!;
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <WebsiteScoreBreakdown websiteCategory={category} websiteAnalysis={scoringInput().websiteAnalysis} websiteSuggestions={[]} />
      </LocaleProvider>
    );
    const websiteChecks = CHECKS.filter((c) => c.id.startsWith("website."));
    expect(websiteChecks.length).toBeGreaterThan(10);
    for (const check of websiteChecks) {
      expect(html).toContain(`id="${checkAnchorId(check.id)}"`);
      expect(Object.prototype.hasOwnProperty.call(POSTAI_LINK_TARGETS, check.id)).toBe(true);
    }
  });

  test("PostAI's prompt only names markers that are on the allowlist", () => {
    const named = Array.from(ASSISTANT_SYSTEM_RULES.matchAll(/\[\[link:([a-z_.]+)\]\]/g)).map((m) => m[1]);
    expect(named.length).toBeGreaterThan(20);
    for (const id of named) expect(Object.prototype.hasOwnProperty.call(POSTAI_LINK_TARGETS, id)).toBe(true);
  });
});
