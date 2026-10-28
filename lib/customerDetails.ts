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
// - The owner may say "No parking available" or (rarely) that they take no
//   payments on site — owner-entered ("Added by you"), and that part is
//   then left out. Accessibility always counts where any part does.

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
  return customerDetailsRuleFor(businessTypeId, pureServiceArea).parts;
}

/** Why these parts count — one line on the check row. */
export type CustomerDetailsReason = "visit_and_pay" | "office" | "no_payment";

/** What the owner told us (Customer details → "Added by you"). */
export interface CustomerDetailsOwnerFacts {
  noParking?: boolean | null;
  noPayment?: boolean | null;
}

export interface CustomerDetailsRule {
  /** The parts that count. */
  parts: CustomerDetailPart[];
  reason: CustomerDetailsReason;
  /** No storefront, so parking doesn't count. */
  serviceAreaNoParking: boolean;
  /** Removed because the owner said so ("Added by you"). */
  ownerRemoved: CustomerDetailPart[];
  /** Parts the owner may remove for this type (payment, parking). */
  ownerCanRemove: CustomerDetailPart[];
}

export function customerDetailsRuleFor(
  businessTypeId: string | null | undefined,
  pureServiceArea: boolean | null | undefined,
  owner: CustomerDetailsOwnerFacts = {}
): CustomerDetailsRule {
  const id = businessTypeId ?? "default";
  const byType: CustomerDetailPart[] = NONE_APPLY.has(id) ? [] : ACCESSIBILITY_ONLY.has(id) ? ["accessibility"] : NO_PAYMENT.has(id) ? ["accessibility", "parking"] : [...ALL];
  const reason: CustomerDetailsReason = ACCESSIBILITY_ONLY.has(id) ? "office" : NO_PAYMENT.has(id) ? "no_payment" : "visit_and_pay";
  // No storefront: there's nowhere to park.
  const serviceAreaNoParking = pureServiceArea === true && byType.includes("parking");
  const afterType = serviceAreaNoParking ? byType.filter((p) => p !== "parking") : byType;
  const ownerCanRemove: CustomerDetailPart[] = afterType.filter((p) => p !== "accessibility");
  const ownerRemoved: CustomerDetailPart[] = ownerCanRemove.filter((p) => (p === "parking" ? owner.noParking === true : owner.noPayment === true));
  return { parts: afterType.filter((p) => !ownerRemoved.includes(p)), reason, serviceAreaNoParking, ownerRemoved, ownerCanRemove };
}
