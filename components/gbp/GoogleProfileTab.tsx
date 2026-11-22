"use client";

// The Growth page's Google Profile tab for Premium (Day 22B step 1; design:
// docs/mockups/google-profile-mockup.html). Six sections under a pinned
// "On this page" menu:
//   1 Last month on Google — the conversion rate (monthly Google insights
//     arrive in step 2: an empty state until then, the mockup's sample in
//     practice mode only), the five levers that raise it (real data), and
//     "Last month you: …" from the real logs;
//   2 Searches → customers, 3 What people searched, 5 Show up for more —
//     the same: empty until the first monthly Google report;
//   4 Your listing — the saved listing, row by row, each opening the
//     existing editor (preview → approve → read back → 7-day undo, the
//     GOOGLE_WRITES_LIVE_PLACES lock and wording all their own);
//   6 Protection & changes — what changed between scans that PostScore
//     didn't do, and the latest changes made from PostScore.
// Not connected (and not practice): one card, what connecting unlocks.
// The wording never says PostScore caused a change in the rate.

import { gbpResultText } from "@/components/gbp/GbpResultMessage";
import { GBP_PROFILE_ANCHOR } from "@/lib/gbpLanding";
import { t, useLocale } from "@/lib/i18n";
import { SAMPLE_INSIGHTS } from "@/lib/googleProfileTab";
import { audience, SAMPLE_AUDIENCE } from "@/lib/gbpInsights";
import { cn } from "@/lib/utils";
import { K, type GoogleProfileTabProps, SyncContext, useSync, NotConnectedCard, JumpMenu, PartHeader } from "@/components/gbp/googleTabParts";
import { FunnelSection, LastMonthSection, SearchesSection } from "@/components/gbp/GoogleResults";
import { GoogleEditsBanner, ListingSection, NextSection, ProtectionSection } from "@/components/gbp/GoogleListingPage";

// Moved in Day 25B step 2; re-exported so existing imports keep working.
export type { GoogleProfileTabProps, GoogleTabListing } from "@/components/gbp/googleTabParts";
export { thisWeekRecs } from "@/components/gbp/googleTabParts";
export { eventLine, eventText, howCalculated, leverShort, leverText, recapSentence } from "@/components/gbp/GoogleResults";
export { GoogleEditItem, GoogleEditsBanner, googleEditsLine, rowText, type LiveValues } from "@/components/gbp/GoogleListingPage";

export function GoogleProfileTab(props: GoogleProfileTabProps) {
  if (!props.connected && !props.practice) return <NotConnectedCard {...props} />;
  return <ConnectedTab {...props} />;
}

function ConnectedTab(props: GoogleProfileTabProps) {
  const locale = useLocale();
  const sync = useSync(props.businessId, props.connected ? props.insightsState : undefined);
  const sample = props.practice && !(props.insights && props.insights.length > 0);
  const months = props.insights && props.insights.length > 0 ? props.insights : sample ? SAMPLE_INSIGHTS : [];
  const who = sample ? SAMPLE_AUDIENCE : audience(months);
  return (
    // Bottom room for the floating "Ask PostAI" button (44px + 24px), so the
    // last rows scroll above it — rows themselves have no right margin.
    <SyncContext.Provider value={sync}>
    <div className="flex flex-col pb-[68px]" data-testid="google-profile-tab" data-sync={sync.status}>
      {props.result && (
        <p id={GBP_PROFILE_ANCHOR} role="status" className={cn("mb-3 scroll-mt-20 text-[13px] font-medium", props.result === "connected" ? "text-green" : "text-red")}>
          {gbpResultText(locale, props.result, props.business)}
        </p>
      )}
      <GoogleEditsBanner businessId={props.businessId} saved={props.saved} scan={{ website: props.listing.website, phone: props.listing.phone }} />
      <JumpMenu sample={sample} />
      <PartHeader part="performance" />
      <LastMonthSection {...props} months={months} sample={sample} />
      <FunnelSection months={months} sample={sample} who={who} props={props} />
      <SearchesSection months={months} sample={sample} />
      <PartHeader part="edit" />
      <ListingSection {...props} />
      <NextSection {...props} sample={sample} />
      <PartHeader part="protection" />
      <ProtectionSection {...props} />
      {/* The research behind the levers: a small link at the very bottom. */}
      <details className="mt-8 text-[13px] text-ink-mute" data-testid="google-tab-sources">
        <summary className="inline-flex min-h-[44px] cursor-pointer items-center font-semibold text-ink-soft">{t(locale, K("sourcesToggle"))}</summary>
        <p className="mt-1 max-w-[720px] leading-snug">{t(locale, K("sources"))}</p>
      </details>
    </div>
    </SyncContext.Provider>
  );
}
