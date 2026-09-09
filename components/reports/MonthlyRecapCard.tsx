"use client";

import { useState } from "react";
import { IconDownload, IconShare2 } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { downloadDataUrl } from "@/lib/couponImage";
import { renderRecapPng } from "@/lib/reportsRecapImage";
import type { MonthlyRecap } from "@/app/actions/reports";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * A recap of what changed between the two most recent real scans — real
 * score delta, real listing changes from diffProfileSnapshots. Labeled
 * "Monthly recap" for the owner, but the subtitle always shows the real
 * gap between the two scans (which may not be exactly a month) rather
 * than pretending to a cadence the app doesn't actually enforce — scans
 * only happen when the owner clicks "Re-scan now."
 */
export function MonthlyRecapCard({
  businessName,
  recap,
}: {
  businessName: string;
  recap: MonthlyRecap | null;
}) {
  if (!recap) {
    return (
      <Card className="p-5 text-sm text-ink-soft">
        This is your first recorded scan — a recap will appear here once you have two.
      </Card>
    );
  }

  const { previous, current, scoreDelta, daysBetween, changes, changesUnavailable } = recap;
  const dateRangeLabel = `${formatDate(previous.created_at)} – ${formatDate(current.created_at)} (${daysBetween} day${daysBetween === 1 ? "" : "s"})`;

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">
            {dateRangeLabel}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-serif text-[28px] font-bold text-ink">
              {previous.total} → {current.total}
            </span>
            <Pill variant={scoreDelta > 0 ? "green" : scoreDelta < 0 ? "red" : "neutral"}>
              {scoreDelta === 0 ? "No change" : scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}
            </Pill>
          </div>
        </div>
        <RecapActions
          businessName={businessName}
          dateRangeLabel={dateRangeLabel}
          fromScore={previous.total}
          toScore={current.total}
          changes={changes.map((c) => c.description)}
        />
      </div>

      <div className="mt-5 border-t border-paper-line pt-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
          What changed
        </div>
        {changesUnavailable ? (
          <p className="mt-2 text-sm text-ink-soft">
            One of these two scans predates listing-change tracking, so a real diff isn&apos;t
            available for this period.
          </p>
        ) : changes.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">No real listing changes were detected in this period.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {changes.slice(0, 3).map((change) => (
              <li key={change.field} className="text-sm text-ink">
                {change.description}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function RecapActions({
  businessName,
  dateRangeLabel,
  fromScore,
  toScore,
  changes,
}: {
  businessName: string;
  dateRangeLabel: string;
  fromScore: number;
  toScore: number;
  changes: string[];
}) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function handleDownload() {
    setState("working");
    try {
      const png = await renderRecapPng({ businessName, dateRangeLabel, fromScore, toScore, changes });
      downloadDataUrl(png, "postscore-recap.png");
      setState("idle");
    } catch {
      setState("error");
    }
  }

  async function handleShare() {
    try {
      await navigator.share({
        title: `${businessName} — PostScore recap`,
        text: `${businessName}'s PostScore ${fromScore > toScore ? "dropped" : "rose"} ${fromScore} → ${toScore} (${dateRangeLabel}).`,
      });
    } catch {
      // Share sheet dismissed or unsupported mid-call — not an error worth surfacing.
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="default" size="sm" onClick={handleDownload} disabled={state === "working"}>
        <IconDownload size={14} />
        {state === "working" ? "Preparing…" : "Download"}
      </Button>
      {canShare && (
        <Button variant="default" size="sm" onClick={handleShare}>
          <IconShare2 size={14} />
          Share
        </Button>
      )}
      {state === "error" && <span className={cn("text-xs text-red")}>Couldn&apos;t generate image.</span>}
    </div>
  );
}
