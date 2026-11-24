import "server-only";
import { scoreBusinessById } from "@/app/actions/scoring";
import { buildActionPlan, buildWebsiteBanner, GOOGLE_MISMATCH_CHECK_ID } from "@/lib/actionPlan";
import { businessRowToScoringInput } from "@/lib/scoring";
import { speedNotScored, websiteFixSummary } from "@/lib/fixPlan";

/** The Website page's Fix plan line (Day 25B step 3): from the saved scan
 * only (the same request-cached score the page's other parts read). */
export async function loadWebsiteFixLine(businessId: string): Promise<{ summary: ReturnType<typeof websiteFixSummary>; speedPending: boolean } | null> {
  const scored = await scoreBusinessById(businessId, "business");
  if (scored.status !== "ok") return null;
  const breakdown = scored.result.breakdown;
  const input = businessRowToScoringInput(scored.scoringBusiness ?? scored.business);
  const mismatch = buildActionPlan(breakdown, scored.result.suggestions, [], input).filter((t) => t.checkId === GOOGLE_MISMATCH_CHECK_ID);
  return {
    summary: websiteFixSummary({ breakdown, websiteBanner: buildWebsiteBanner(breakdown, input), tasks: mismatch }),
    speedPending: speedNotScored(breakdown) !== null,
  };
}
