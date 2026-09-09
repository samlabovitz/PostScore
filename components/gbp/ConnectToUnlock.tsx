import Link from "next/link";
import { IconLock } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * The one honest gate every GBP-dependent feature in the app shows
 * instead of fabricated data or a dead "coming soon": a real, actionable
 * link to the connect flow. Never rendered for a feature that's simply
 * unbuilt — only for one that's real and waiting on a real Google
 * Business Profile connection (see the callers' own doc comments for
 * which is which).
 */
export function ConnectToUnlockCard({
  businessId,
  title,
  description,
}: {
  businessId: string;
  title: string;
  description: string;
}) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brass/10 text-brass">
        <IconLock size={16} />
      </span>
      <div className="flex-1">
        <div className="text-[13px] font-semibold text-ink">{title}</div>
        <p className="mt-0.5 text-[12.5px] text-ink-mute">{description}</p>
        <Link href={`/business/${businessId}/connect-gbp`} className="mt-2.5 inline-block">
          <Button size="sm" variant="brass">
            Connect Google Business Profile
          </Button>
        </Link>
      </div>
    </Card>
  );
}

/** The compact form for a stat-grid tile (e.g. Reports' "verified
 * fixes" grid) — same honest gate, sized to sit next to a StatTile. */
export function ConnectToUnlockTile({ businessId, label }: { businessId: string; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">{label}</span>
      <Link
        href={`/business/${businessId}/connect-gbp`}
        className="inline-flex w-fit items-center gap-1 rounded-full bg-brass/10 px-2.5 py-1 text-xs font-medium text-brass hover:bg-brass/15"
      >
        <IconLock size={11} />
        Connect to unlock
      </Link>
      <span className="text-[11px] text-ink-mute">Needs a connected Google Business Profile.</span>
    </div>
  );
}
