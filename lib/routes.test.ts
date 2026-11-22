import { describe, expect, it } from "vitest";
import {
  NEW_PAGES_LIVE,
  campaignsPageHref,
  fixPlanHref,
  getReviewsHref,
  googleListingHref,
  googlePagePaths,
  googleResultsHref,
  growthPlanHref,
  isFixPlanStepsHref,
  legacyRedirect,
  legacyRedirectIfLive,
  offersHref,
  reviewsHref,
} from "@/lib/routes";

const ID = "e011e16d-9747-4608-ad1a-bd9475f004f6";
const B = `/business/${ID}`;

describe("route helpers while the new pages are off (today's URLs)", () => {
  it("is off", () => {
    expect(NEW_PAGES_LIVE).toBe(false);
  });

  it("points every helper at the current page", () => {
    expect(fixPlanHref(ID)).toBe(`${B}/growth`);
    expect(fixPlanHref(ID, { hash: "weekly-plan" })).toBe(`${B}/growth#weekly-plan`);
    expect(fixPlanHref(ID, { query: { open: "howto" }, hash: "task-completeness-hours" })).toBe(`${B}/growth?open=howto#task-completeness-hours`);
    expect(googleListingHref(ID)).toBe(`${B}/growth?tab=google`);
    expect(googleListingHref(ID, { hash: "edit-phone" })).toBe(`${B}/growth?tab=google#edit-phone`);
    expect(googleListingHref(ID, { hash: "#edit-hours" })).toBe(`${B}/growth?tab=google#edit-hours`);
    expect(googleResultsHref(ID, { hash: "searches" })).toBe(`${B}/growth?tab=google#searches`);
    expect(googleResultsHref(ID, { query: { gbp: "denied" }, hash: "google-connection" })).toBe(`${B}/growth?tab=google&gbp=denied#google-connection`);
    expect(growthPlanHref(ID)).toBe(`${B}/growth`);
    expect(growthPlanHref(ID, { hash: "weekly-routine" })).toBe(`${B}/growth#weekly-routine`);
    expect(growthPlanHref(ID, { query: {} })).toBe(`${B}/growth`);
    expect(reviewsHref(ID, { hash: "google-reviews" })).toBe(`${B}/website-reviews#google-reviews`);
    expect(reviewsHref(ID, { query: { gbp: "error" }, hash: "reply-check" })).toBe(`${B}/website-reviews?gbp=error#reply-check`);
    expect(getReviewsHref(ID, { hash: "get-more-reviews" })).toBe(`${B}/website-reviews#get-more-reviews`);
    expect(offersHref(ID)).toBe(`${B}/campaigns`);
    expect(offersHref(ID, "coupons", { hash: "new-offer" })).toBe(`${B}/campaigns?tab=coupons#new-offer`);
    expect(offersHref(ID, "referrals")).toBe(`${B}/campaigns?tab=referrals`);
    expect(campaignsPageHref(ID)).toBe(`${B}/campaigns`);
  });

  it("revalidates the one page that shows Google data today", () => {
    expect(googlePagePaths(ID)).toEqual([`${B}/growth`]);
  });

  it("recognizes a Fix plan steps link", () => {
    expect(isFixPlanStepsHref(fixPlanHref(ID, { query: { open: "howto" }, hash: "task-x" }))).toBe(true);
    expect(isFixPlanStepsHref(googleListingHref(ID, { hash: "edit-phone" }))).toBe(false);
  });

  it("never redirects while off", () => {
    expect(legacyRedirectIfLive({ pathname: `${B}/growth`, hash: "#weekly-plan" })).toBeNull();
    expect(legacyRedirectIfLive({ pathname: `${B}/google-profile` })).toBeNull();
  });
});

// Every row of docs/plans/day25a-spec.md §3 "Redirects" (+ the Reviews split).
describe("old URLs → new pages (legacyRedirect)", () => {
  const go = (pathname: string, search = "", hash = "") => legacyRedirect({ pathname: `${B}${pathname}`, search, hash });

  it("/growth?tab=google-profile → Google results", () => {
    expect(go("/growth", "?tab=google-profile")).toBe(`${B}/google-results`);
    expect(go("/growth", "tab=google")).toBe(`${B}/google-results`);
  });
  it("Google tab listing hashes → Google listing", () => {
    for (const h of ["listing", "next", "protection", "others", "edit-phone", "edit-hours", "edit-booking-steps", "edit-photos"]) {
      expect(go("/growth", "?tab=google", `#${h}`)).toBe(`${B}/google-listing#${h}`);
    }
  });
  it("Google tab results hashes → Google results", () => {
    for (const h of ["last-month", "funnel", "searches"]) {
      expect(go("/growth", "?tab=google", `#${h}`)).toBe(`${B}/google-results#${h}`);
    }
  });
  it("keeps the connect result on the Google tab", () => {
    expect(go("/growth", "?tab=google&gbp=denied", "#google-connection")).toBe(`${B}/google-results?gbp=denied#google-connection`);
  });
  it("/google-profile → Google results", () => {
    expect(go("/google-profile")).toBe(`${B}/google-results`);
  });
  it("/search-demand → Google results #searches", () => {
    expect(go("/search-demand")).toBe(`${B}/google-results#searches`);
  });
  it("/growth#weekly-plan, #task-… and ?open=howto → Fix plan", () => {
    expect(go("/growth", "", "#weekly-plan")).toBe(`${B}/fix-plan#weekly-plan`);
    expect(go("/growth", "", "#task-completeness-hours")).toBe(`${B}/fix-plan#task-completeness-hours`);
    expect(go("/growth", "?open=howto", "#task-visibility-review_count")).toBe(`${B}/fix-plan?open=howto#task-visibility-review_count`);
  });
  it("/growth#ways-to-grow → Growth plan #more", () => {
    expect(go("/growth", "", "#ways-to-grow")).toBe(`${B}/growth#more`);
  });
  it("/growth#weekly-routine and #more-ways → Growth plan #this-week", () => {
    expect(go("/growth", "", "#weekly-routine")).toBe(`${B}/growth#this-week`);
    expect(go("/growth", "", "#more-ways")).toBe(`${B}/growth#this-week`);
  });
  it("/growth with nothing else stays (it's the Growth plan)", () => {
    expect(go("/growth")).toBeNull();
  });
  it("/campaigns?tab=all → Customer offers", () => {
    expect(go("/campaigns", "?tab=all")).toBe(`${B}/offers`);
  });
  it("/campaigns?tab=coupons / referrals → Customer offers tabs", () => {
    expect(go("/campaigns", "?tab=coupons", "#new-offer")).toBe(`${B}/offers?tab=coupons#new-offer`);
    expect(go("/campaigns", "?tab=referrals")).toBe(`${B}/offers?tab=referrals`);
    expect(go("/campaigns", "?tab=referral")).toBe(`${B}/offers?tab=referrals`);
  });
  it("/campaigns alone stays (it's the Campaigns page)", () => {
    expect(go("/campaigns")).toBeNull();
  });
  it("/growth?tab=coupons / referral(s) → Customer offers tabs", () => {
    expect(go("/growth", "?tab=coupons")).toBe(`${B}/offers?tab=coupons`);
    expect(go("/growth", "?tab=referral")).toBe(`${B}/offers?tab=referrals`);
    expect(go("/growth", "?tab=referrals")).toBe(`${B}/offers?tab=referrals`);
  });
  it("Reviews: asking → Get more reviews; replies and points stay", () => {
    expect(go("/website-reviews", "", "#get-more-reviews")).toBe(`${B}/get-reviews#get-more-reviews`);
    expect(go("/website-reviews", "", "#review-link")).toBe(`${B}/get-reviews#review-link`);
    expect(go("/website-reviews", "", "#google-reviews")).toBeNull();
    expect(go("/website-reviews", "", "#reply-to-reviews")).toBeNull();
    expect(go("/website-reviews", "?gbp=error", "#reply-check")).toBeNull();
  });
  it("ignores other pages and other businesses' paths shapes", () => {
    expect(legacyRedirect({ pathname: `${B}/website`, hash: "#x" })).toBeNull();
    expect(legacyRedirect({ pathname: "/growth" })).toBeNull();
  });
});
