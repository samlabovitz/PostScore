// A card's QR codes — front and back, each opening its real destination
// (review link, Google listing, or the business's own website).

import { reviewQrGeometry, type ReviewQrGeometry } from "@/lib/reviewQr";
import { buildGoogleReviewUrl } from "@/lib/reviews";
import { qrDestinationUrl, type CardBusiness, type CardDesign, type QrDestination } from "@/lib/printStudio/design";

export function cardQrUrl(dest: QrDestination, business: CardBusiness): string | null {
  return qrDestinationUrl(dest, business, buildGoogleReviewUrl);
}

export function cardQrs(design: CardDesign, business: CardBusiness, hasLogo: boolean): Record<string, ReviewQrGeometry> {
  const qrs: Record<string, ReviewQrGeometry> = {};
  const add = (name: string, dest: QrDestination) => {
    const url = cardQrUrl(dest, business);
    if (!url) return;
    const center = design.qrCenter === "logo" && !hasLogo ? "none" : design.qrCenter;
    qrs[name] = reviewQrGeometry(url, { dots: design.qrDots, corners: design.qrCorners, center });
  };
  add("front", design.qr);
  add("back", design.back.qr);
  return qrs;
}
