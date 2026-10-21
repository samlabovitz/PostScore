// The starter website's full one-page preview (Free: "Open full preview"
// on the Website page). Only the signed-in owner can open it — anyone else
// gets "not found" (the business row is read through RLS). It's never
// indexed, never downloadable from our UI, and always watermarked.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getBusinessSummary } from "@/app/actions/businesses";
import { normalizeLocale, t } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/i18n";
import { StarterPreviewFrame } from "./StarterPreviewFrame";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { UpgradeProvider } from "@/components/upgrade/UpgradeContext";

export const metadata: Metadata = {
  title: "PostScore preview",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default async function StarterPreviewPage({ params }: { params: { id: string } }) {
  const summary = await getBusinessSummary(params.id);
  if (summary.status === "unauthenticated") redirect("/login");
  if (summary.status !== "ok") notFound();
  const locale = normalizeLocale(summary.business.language);
  // For "Download with Grow" (the side-by-side plans box). DB only.
  const upgrade = await loadUpgradeContext(params.id, "website");
  return (
    <LocaleProvider locale={locale}>
      <UpgradeProvider value={upgrade}>
        <StarterPreviewFrame businessId={params.id} free={upgrade.plan === "free"} title={t(locale, "dashboard.free.web.previewTitle")} />
      </UpgradeProvider>
    </LocaleProvider>
  );
}
