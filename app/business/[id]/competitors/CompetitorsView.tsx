"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconStar, IconMessageCircle, IconWorld, IconWorldOff, IconMapPin } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { cn } from "@/lib/utils";
import { saveCompetitorScan } from "@/app/actions/competitors";
import type { CompetitorScanResult, RankedCompetitor } from "@/lib/competitors";

function milesLabel(meters: number): string {
  const mi = meters / 1609.34;
  return `${mi < 0.1 ? "<0.1" : mi.toFixed(1)} mi`;
}

function SignalChips({ entry }: { entry: RankedCompetitor }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill variant="neutral" className="gap-1">
        <IconStar size={12} className={entry.rating !== null ? "text-brass" : "text-ink-mute"} />
        {entry.rating !== null ? entry.rating.toFixed(1) : "No rating"}
      </Pill>
      <Pill variant="neutral" className="gap-1">
        <IconMessageCircle size={12} />
        {entry.reviewCount !== null ? `${entry.reviewCount.toLocaleString()} reviews` : "No review count"}
      </Pill>
      <Pill variant={entry.hasWebsite ? "green" : "amber"} className="gap-1">
        {entry.hasWebsite ? <IconWorld size={12} /> : <IconWorldOff size={12} />}
        {entry.hasWebsite ? "Has website" : "No website"}
      </Pill>
      {entry.distanceMeters !== null && (
        <Pill variant="neutral" className="gap-1">
          <IconMapPin size={12} />
          {milesLabel(entry.distanceMeters)}
        </Pill>
      )}
    </div>
  );
}

function RankedRow({ entry, rank }: { entry: RankedCompetitor; rank: number }) {
  const row = (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        entry.isSubject
          ? "border-brass bg-brass/[.06]"
          : "border-paper-deep bg-white"
      )}
    >
      <div className="flex items-center gap-3.5">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-serif text-sm font-semibold",
            entry.isSubject ? "bg-brass text-white" : "bg-paper-deep text-ink-soft"
          )}
        >
          {rank}
        </span>
        <GradeBadge grade={entry.breakdown.grade} />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">{entry.name}</span>
            {entry.isSubject && (
              <Pill variant="brass" className="shrink-0">
                Your business
              </Pill>
            )}
          </div>
          <div className="mt-0.5 text-[12px] text-ink-mute">{entry.address ?? "No address on file"}</div>
          <div className="mt-2">
            <SignalChips entry={entry} />
          </div>
        </div>
      </div>
      <div className="text-right sm:pl-3">
        <div className="font-serif text-2xl font-bold text-ink">{entry.breakdown.total}</div>
        <div className="text-[11px] uppercase tracking-[0.06em] text-ink-mute">PostScore / 100</div>
      </div>
    </div>
  );

  if (entry.googleMapsUri) {
    return (
      <a href={entry.googleMapsUri} target="_blank" rel="noreferrer" className="block">
        {row}
      </a>
    );
  }
  return row;
}

function SaveScanControl({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleSave() {
    setState({ kind: "saving" });
    const result = await saveCompetitorScan(businessId);
    if (result.status === "saved") {
      setState({ kind: "saved" });
      router.refresh();
    } else if (result.status === "no_data") {
      setState({ kind: "error", message: "Nothing to save — no comparable competitors were found." });
    } else if (result.status === "error") {
      setState({ kind: "error", message: result.message });
    } else {
      setState({ kind: "error", message: "Could not save this scan." });
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="brass" size="sm" onClick={handleSave} disabled={state.kind === "saving"}>
        {state.kind === "saving" ? "Saving scan..." : "Save this scan to history"}
      </Button>
      {state.kind === "saved" && <span className="text-sm text-green">Saved.</span>}
      {state.kind === "error" && <span className="text-sm text-red">{state.message}</span>}
    </div>
  );
}

export function CompetitorsView({
  businessId,
  businessName,
  result,
}: {
  businessId: string;
  businessName: string | null;
  result: CompetitorScanResult;
}) {
  const competitorCount = result.ranked.filter((r) => !r.isSubject).length;

  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div>
        <Link
          href={`/business/${businessId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={15} />
          Back to {businessName ?? "business"}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
          Competitors
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Real nearby businesses{result.categoryLabel ? ` in the same category (${result.categoryLabel})` : ""},
          scored with the same PostScore engine and ranked strictly by that score.
        </p>
      </div>

      <Card className="p-4 text-sm text-ink-soft">{result.message}</Card>

      {result.status === "ok" && result.ranked.length > 0 && (
        <>
          <SectionHeading
            title={`Ranked by PostScore${result.subjectRank ? ` — you're #${result.subjectRank} of ${result.ranked.length}` : ""}`}
            action={<SaveScanControl businessId={businessId} />}
          />
          <div className="flex flex-col gap-3">
            {result.ranked.map((entry, i) => (
              <RankedRow key={entry.placeId} entry={entry} rank={i + 1} />
            ))}
          </div>
        </>
      )}

      {result.unscored.length > 0 && (
        <>
          <SectionHeading title="Found nearby, but couldn't be scored" />
          <Card className="p-5">
            <div className="flex flex-col divide-y divide-paper-line">
              {result.unscored.map((u) => (
                <div key={u.placeId} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div>
                    <div className="text-sm font-medium text-ink">{u.name}</div>
                    <div className="mt-0.5 text-[12px] text-ink-mute">
                      {u.address ?? "No address on file"} · {milesLabel(u.distanceMeters)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[12px] text-ink-mute">{u.reason}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {result.status === "ok" && competitorCount === 0 && result.unscored.length === 0 && (
        <Card className="p-5 text-sm text-ink-soft">
          Your PostScore ({result.ranked[0]?.breakdown.total ?? "—"}) is shown above with nothing to
          compare it to yet — widen your search area or check back later as more listings appear
          nearby.
        </Card>
      )}
    </div>
  );
}
