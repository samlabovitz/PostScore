import { redirect } from "next/navigation";
import { googleResultsHref } from "@/lib/routes";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { canOpenNewGooglePages, loadGoogleResults } from "@/lib/googlePages.server";
import { GooglePageShell } from "@/components/gbp/GooglePageShell";
import { GoogleResults } from "@/components/gbp/GoogleResults";

/** Growth → Google results (Day 25B step 2; docs/plans/day25a-spec.md §2).
 * Behind NEW_PAGES_LIVE: until then only the dev test login may open it;
 * everyone else lands on the old Google Profile tab. The numbers only: no
 * tasks here (the weekly checklist is on Growth plan; score fixes on Fix plan). */
export default async function GoogleResultsPage({ params, searchParams = {} }: { params: { id: string }; searchParams?: { gbp?: string } }) {
  if (!(await canOpenNewGooglePages())) redirect(googleResultsHref(params.id));
  const websiteOnly = await websiteOnlyGuard(params.id, "growth");
  if (websiteOnly) return websiteOnly;
  const data = await loadGoogleResults(params.id, searchParams.gbp);
  return <GooglePageShell data={data} promoPage="growth" render={(props) => <GoogleResults {...props} />} />;
}
