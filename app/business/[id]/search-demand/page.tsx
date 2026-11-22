import { googleResultsHref } from "@/lib/routes";
import { redirect } from "next/navigation";

/**
 * Search demand lives in the Growth page's Google Profile tab now (shown
 * in full on Premium; listed as a Premium feature on Free and Grow). The
 * section itself is components/gbp/SearchDemandSection.tsx; see
 * docs/search-demand.md.
 */
export default function SearchDemandPage({ params }: { params: { id: string } }) {
  redirect(googleResultsHref(params.id, { hash: "searches" }));
}
