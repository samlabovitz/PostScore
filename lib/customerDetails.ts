// "Customer details on your listing" (scoring v1.12.0): which parts —
// accessibility, payment options, parking — apply to this kind of business.
// Only the parts that apply are counted (docs/review-scoring-plan.md). Pure.
//
// - Places customers visit and pay at (shops, food & drink, salons and
//   personal care, fitness, entertainment, auto, pets, lodging…): all three.
// - Professional offices (law, accounting, consulting, real estate,
//   medical and therapy offices): accessibility only.
// - Trades that go to the customer (plumbers, electricians, cleaners,
//   landscapers, home services): none — the check is left out.
// - Places of worship and community centers: accessibility and parking
//   (nothing is bought there).
// - A service-area-only business (no storefront): never parking.

export type CustomerDetailPart = "accessibility" | "payment" | "parking";

const ALL: CustomerDetailPart[] = ["accessibility", "payment", "parking"];

/** Professional offices: accessibility only. "default" (unknown type) too —
 * the one part that applies to any place a customer might visit. */
const ACCESSIBILITY_ONLY = new Set(["lawyer", "accountant", "real_estate", "consultant", "coach", "dentist", "medical_clinic", "practitioner", "nonprofit", "default"]);
/** Customers never come to them. */
const NONE_APPLY = new Set(["plumber", "electrician", "landscaper", "cleaning_service", "home_services"]);
/** Visited, but nothing is bought there. */
const NO_PAYMENT = new Set(["place_of_worship", "community_center"]);

export function customerDetailsPartsFor(businessTypeId: string | null | undefined, pureServiceArea: boolean | null | undefined): CustomerDetailPart[] {
  const id = businessTypeId ?? "default";
  let parts: CustomerDetailPart[] = NONE_APPLY.has(id) ? [] : ACCESSIBILITY_ONLY.has(id) ? ["accessibility"] : NO_PAYMENT.has(id) ? ["accessibility", "parking"] : [...ALL];
  // No storefront: there's nowhere to park.
  if (pureServiceArea === true) parts = parts.filter((p) => p !== "parking");
  return parts;
}
