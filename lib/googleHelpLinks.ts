// Official Google links PostScore shows next to advice. Only these — each
// was opened and checked on 2026-10-27 (EN and ES where Google has one),
// never a guessed URL.
// Google Business Profile itself opens the owner's dashboard when signed
// in (its sign-in page otherwise); the help articles are public.
import type { Locale } from "@/lib/i18n";

export const GOOGLE_LINKS = {
  /** Google Business Profile — "Edit profile" lives here. */
  businessProfile: "https://business.google.com/",
  /** The owner's reviews in Google Business Profile (asks to sign in). */
  businessProfileReviews: "https://business.google.com/reviews",
  /** Help: "Manage your business attributes" (accessibility, payments, parking). */
  attributesHelp: "https://support.google.com/business/answer/9049526",
  /** Help: "Manage customer reviews" (reading and replying). */
  reviewsHelp: "https://support.google.com/business/answer/3474050",
  /** Help: "Tips to get more reviews". */
  getReviewsHelp: "https://support.google.com/business/answer/3474122",
  /** Help: "Edit your Business Profile" (phone, address, hours, website, status). */
  editProfileHelp: "https://support.google.com/business/answer/3039617",
  /** Help: "Manage your Business Profile photos & videos". */
  photosHelp: "https://support.google.com/business/answer/6103862",
  /** Help: "Manage your business category". */
  categoryHelp: "https://support.google.com/business/answer/7249669",
  /** Google's PageSpeed Insights (the same test the mobile-speed check uses). */
  pageSpeed: "https://pagespeed.web.dev/",
  /** Google Safe Browsing site status. */
  safeBrowsing: "https://transparencyreport.google.com/safe-browsing/search",
  /** Help: "Mark your business as closed" — also how to mark it open again. */
  closedStatusHelp: "https://support.google.com/business/answer/15300196",
  /** Help: "Manage your local business links" ("Enlaces de empresas
   * locales") — Order online, Booking, Pickup and delivery links (checked
   * EN + ES on 2026-10-29). */
  localLinksHelp: "https://support.google.com/business/answer/6218037",
  /** web.dev (Google): "Why HTTPS matters" — English only. */
  httpsWhy: "https://web.dev/articles/why-https-matters",
} as const;

/** A help article in the owner's language (Google's own ?hl=). */
export function googleHelpUrl(url: string, locale: Locale): string {
  return url.startsWith("https://support.google.com/") && locale === "es" ? `${url}?hl=es` : url;
}
