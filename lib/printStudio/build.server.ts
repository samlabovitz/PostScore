// Server: builds a coupon / referral card PDF after deciding what the
// account's plan may print (effectiveCardDesign) and checking the owner
// has filled in their own offer and expiration. Whatever the browser
// sent: Free gets nothing, Grow its basic card, Premium/Multi the full
// design. The logo never comes here — only whether there is one.

import type { Plan } from "@/lib/plan";
import { signAccess } from "@/lib/signStudio/design";
import { createMeasurer, loadDesignFonts } from "@/lib/signStudio/fonts";
import { readSignFont } from "@/lib/signStudio/fonts.server";
import { renderPdf, type LogoSlot } from "@/lib/signStudio/pdf";
import { parseLogoShape } from "@/lib/signStudio/build.server";
import {
  cardContrastProblems,
  effectiveCardDesign,
  missingFields,
  todayIso,
  type CardBusiness,
  type CardDesign,
  type CardKind,
  type MissingField,
} from "@/lib/printStudio/design";
import { cardQrUrl, cardQrs } from "@/lib/printStudio/qr";
import { layoutCardSheets } from "@/lib/printStudio/layout";

export type BuildCardResult =
  | { status: "ok"; bytes: Uint8Array; logoSlots: LogoSlot[]; design: CardDesign; credit: boolean }
  | { status: "plan_required" }
  | { status: "missing"; fields: MissingField[] }
  | { status: "low_contrast" };

export async function resolveCard(params: { plan: Plan; kind: CardKind; requested: unknown; business: CardBusiness; locale: "en" | "es"; today?: string }) {
  const effective = effectiveCardDesign(params.plan, params.requested, params.kind, params.business, params.locale);
  if (!effective) return { status: "plan_required" } as const;
  const missing = missingFields(effective.design, params.today ?? todayIso());
  if (missing.length > 0) return { status: "missing", fields: missing } as const;
  if (cardContrastProblems(effective.design).length > 0) return { status: "low_contrast" } as const;
  return { status: "ok", ...effective } as const;
}

export async function buildCardPdf(params: {
  plan: Plan;
  kind: CardKind;
  requested: unknown;
  logo: unknown;
  business: CardBusiness;
  locale: "en" | "es";
  today?: string;
}): Promise<BuildCardResult> {
  const resolved = await resolveCard(params);
  if (resolved.status !== "ok") return resolved;
  const { design, credit } = resolved;
  // Logos are a Premium feature.
  const logo = signAccess(params.plan) === "studio" ? parseLogoShape(params.logo) : null;
  const fonts = await loadDesignFonts(design, readSignFont);
  const qrs = cardQrs(design, params.business, logo !== null);
  const sheets = layoutCardSheets({ design, business: params.business, credit, logo, hasQr: (dest) => cardQrUrl(dest, params.business) !== null }, createMeasurer(fonts));
  const { bytes, logoSlots } = await renderPdf(sheets.pages, { qrs, fontBytes: fonts, title: design.businessName || "Cards" });
  return { status: "ok", bytes, logoSlots, design, credit };
}
