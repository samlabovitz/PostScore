// Server: builds a review sign PDF for a request, after deciding what
// the account's plan may print (effectiveDesign). Whatever the browser
// sent, Free gets nothing, Grow gets its basic sign, and only Premium /
// Multi get Sign Studio designs. The logo itself never comes here — only
// whether there is one and its shape, so the PDF can leave room for it.

import type { Plan } from "@/lib/plan";
import { reviewQrGeometry } from "@/lib/reviewQr";
import { buildGoogleReviewUrl } from "@/lib/reviews";
import { contrastProblems, designColors, effectiveDesign, qrStyleOf, signAccess, type SignContent, type SignDesign } from "@/lib/signStudio/design";
import { createMeasurer, loadDesignFonts } from "@/lib/signStudio/fonts";
import { readSignFont } from "@/lib/signStudio/fonts.server";
import { layoutSign } from "@/lib/signStudio/layout";
import { signPdf, type LogoSlot } from "@/lib/signStudio/pdf";

export type BuildSignResult =
  | { status: "ok"; bytes: Uint8Array; logoSlots: LogoSlot[]; design: SignDesign; credit: boolean }
  | { status: "plan_required" }
  | { status: "low_contrast" }
  | { status: "no_place_id" };

/** The logo's shape as the browser reports it (never the image). */
export function parseLogoShape(input: unknown): { aspect: number } | null {
  const v = input && typeof input === "object" ? (input as { aspect?: unknown }) : null;
  const aspect = typeof v?.aspect === "number" && Number.isFinite(v.aspect) ? v.aspect : null;
  return aspect !== null && aspect >= 0.1 && aspect <= 10 ? { aspect } : null;
}

export async function buildSignPdf(params: {
  plan: Plan;
  /** The request body's design (untrusted). */
  requested: unknown;
  logo: unknown;
  placeId: string | null;
  content: SignContent;
  locale: "en" | "es";
}): Promise<BuildSignResult> {
  const effective = effectiveDesign(params.plan, params.requested, params.content, params.locale);
  if (!effective) return { status: "plan_required" };
  if (!params.placeId) return { status: "no_place_id" };
  const { design, credit } = effective;
  if (contrastProblems(designColors(design)).length > 0) return { status: "low_contrast" };
  // Logos are a Sign Studio (Premium) feature.
  const logo = signAccess(params.plan) === "studio" ? parseLogoShape(params.logo) : null;
  const fonts = await loadDesignFonts(design, readSignFont);
  const layout = layoutSign({ design, content: params.content, credit, logo }, createMeasurer(fonts));
  const qr = reviewQrGeometry(buildGoogleReviewUrl(params.placeId), qrStyleOf(design, logo !== null));
  const { bytes, logoSlots } = await signPdf(layout, qr, design, fonts, params.content.businessName ?? "Review sign");
  return { status: "ok", bytes, logoSlots, design, credit };
}
