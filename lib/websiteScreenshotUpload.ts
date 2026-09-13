// Shared "upload a real screenshot capture to storage and build the
// WebsiteAnalysisPage[]/URL to save" logic — the one thing both
// saveBusiness (app/actions/businesses.ts, a business's first scan) and
// the explicit refreshWebsiteScreenshots action
// (app/actions/websiteScreenshots.ts) need identically, so a page whose
// capture failed or whose upload fails degrades the exact same honest
// way — screenshotUrl: null, never dropped — no matter which caller
// triggered it.
//
// "server-only" (via lib/supabase/admin.ts's own guard) keeps this off
// any client bundle; every write here uses the service-role admin
// client, so every caller must have already proven ownership of
// businessId before calling in (see that admin client's own doc
// comment).
import "server-only";
import { createAdminClient } from "./supabase/admin";
import type { AdditionalPageCapture, WebsiteScreenshotCapture } from "./websiteAnalysis";
import type { WebsiteAnalysisPage } from "./scoring";

const WEBSITE_SCREENSHOTS_BUCKET = "website-screenshots";

/** Turns a discovered page's label into a safe, stable storage path
 * segment — "Contact Us" -> "contact-us". Falls back to "page" for a
 * label with no alphanumeric characters at all (shouldn't happen in
 * practice: labels come from real link text or a KEY_PAGE_KEYWORDS
 * entry, both always alphanumeric). */
function slugifyPageLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "page";
}

export interface UploadedWebsiteScreenshots {
  screenshotUrl: string | null;
  additionalPages: WebsiteAnalysisPage[];
}

async function uploadOne(
  admin: ReturnType<typeof createAdminClient>,
  path: string,
  bytes: Buffer,
  logLabel: string
): Promise<string | null> {
  const { error } = await admin.storage
    .from(WEBSITE_SCREENSHOTS_BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });

  if (error) {
    console.error(`[websiteScreenshotUpload] screenshot upload to "${path}" (${logLabel}) failed: ${error.message}`);
    return null;
  }
  return admin.storage.from(WEBSITE_SCREENSHOTS_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Uploads a fresh capture (homepage + any discovered pages) to the
 * public website-screenshots bucket and returns the public URLs to
 * store. Homepage goes to "<businessId>.png", each additional page to
 * "<businessId>/<slug>.png". A page whose bytes are null (capture
 * failed) or whose upload fails is still returned, with
 * screenshotUrl: null, so the caller can show an honest "couldn't
 * capture this page" instead of silently having fewer pages than were
 * actually discovered.
 */
export async function uploadWebsiteScreenshots(
  businessId: string,
  capture: WebsiteScreenshotCapture | { screenshotBytes: Buffer | null; additionalPages: AdditionalPageCapture[] }
): Promise<UploadedWebsiteScreenshots> {
  const admin = createAdminClient();

  const screenshotUrl = capture.screenshotBytes
    ? await uploadOne(admin, `${businessId}.png`, capture.screenshotBytes, "homepage")
    : null;

  const usedSlugs = new Set<string>();
  const additionalPages: WebsiteAnalysisPage[] = [];
  for (const page of capture.additionalPages) {
    let pageScreenshotUrl: string | null = null;
    if (page.screenshotBytes) {
      let slug = slugifyPageLabel(page.label);
      if (usedSlugs.has(slug)) slug = `${slug}-${usedSlugs.size + 1}`;
      usedSlugs.add(slug);
      pageScreenshotUrl = await uploadOne(admin, `${businessId}/${slug}.png`, page.screenshotBytes, page.label);
    }
    additionalPages.push({ label: page.label, url: page.url, screenshotUrl: pageScreenshotUrl });
  }

  return { screenshotUrl, additionalPages };
}
