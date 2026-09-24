import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { ConnectToUnlockTile } from "@/components/gbp/ConnectToUnlock";
import { t, useLocale } from "@/lib/i18n";

/**
 * "What we've verified so far" — deliberately NOT "what your
 * subscription bought." We don't track review replies or Google Posts
 * at all — that requires a real Google Business Profile connection
 * (Phase 1: app/actions/gbp.ts) plus the real data-sync phase that
 * comes after it — and only partially track listing edits (via the
 * action-plan confirmation flow and real profile-snapshot diffs), so
 * this only ever shows counts we can actually derive from real data.
 * Connecting alone doesn't grant these numbers yet: even a connected
 * business sees an honest "syncing soon" state here, never a fabricated
 * count, until the later phase that actually reads this data exists.
 */
export function VerifiedFixesCard({
  businessId,
  confirmedFixCount,
  listingChangesDetected,
  gbpConnected,
}: {
  businessId: string;
  confirmedFixCount: number;
  listingChangesDetected: number;
  gbpConnected: boolean;
}) {
  const locale = useLocale();
  const reviewsRepliedToLabel = t(locale, "dashboard.reports.reviewsRepliedToLabel");
  const googlePostsPublishedLabel = t(locale, "dashboard.reports.googlePostsPublishedLabel");
  return (
    <Card className="p-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <VerifiedTile
          label={t(locale, "dashboard.reports.verifiedFixesConfirmedLabel")}
          value={confirmedFixCount}
          note={t(locale, "dashboard.reports.verifiedFixesConfirmedNote")}
        />
        <VerifiedTile
          label={t(locale, "dashboard.reports.listingChangesDetectedLabel")}
          value={listingChangesDetected}
          note={t(locale, "dashboard.reports.listingChangesDetectedNote")}
        />
        {gbpConnected ? (
          <PendingSyncTile label={reviewsRepliedToLabel} />
        ) : (
          <ConnectToUnlockTile businessId={businessId} label={reviewsRepliedToLabel} />
        )}
        {gbpConnected ? (
          <PendingSyncTile label={googlePostsPublishedLabel} />
        ) : (
          <ConnectToUnlockTile businessId={businessId} label={googlePostsPublishedLabel} />
        )}
      </div>
    </Card>
  );
}

function VerifiedTile({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">{label}</span>
      <span className="font-serif text-[26px] font-semibold text-ink">{value}</span>
      <span className="text-[11px] text-ink-mute">{note}</span>
    </div>
  );
}

/** Your Google Business Profile is connected, but this specific number
 * still has no real data source — Phase 1 only establishes the
 * connection itself. Distinct from "coming soon" (which implies nothing
 * exists yet) and from a fabricated 0. */
function PendingSyncTile({ label }: { label: string }) {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">{label}</span>
      <Pill variant="brass" className="w-fit">
        {t(locale, "dashboard.reports.syncingSoonLabel")}
      </Pill>
      <span className="text-[11px] text-ink-mute">{t(locale, "dashboard.reports.connectedSyncingNote")}</span>
    </div>
  );
}
