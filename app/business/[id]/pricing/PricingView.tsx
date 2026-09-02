"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconArrowLeft,
  IconBulb,
  IconChartBar,
  IconInfoCircle,
  IconLoader2,
  IconMapPin,
  IconPlus,
  IconSparkles,
  IconTag,
  IconTrash,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/utils";
import {
  addPriceRow,
  assessPricing,
  deletePriceRow,
  updatePriceRow,
  type StoredPricingAssessment,
} from "@/app/actions/pricing";
import {
  ASSESSMENT_BASES,
  PRICE_TIERS,
  type AssessmentBasis,
  type PriceLevelComparison,
  type PriceRow,
  type PriceTierId,
} from "@/lib/pricing";
import type { BizProfile } from "@/config/bizProfiles";

/**
 * Not a value judgment (premium isn't "bad") — just five visually
 * distinct colors so the legend, tier badges, and result accents always
 * use the exact same mapping, defined once here.
 */
const TIER_PILL_VARIANT: Record<PriceTierId, "green" | "brass" | "amber" | "red" | "neutral"> = {
  under_market: "amber",
  competitive: "green",
  upper_mid: "brass",
  premium: "red",
  no_data: "neutral",
};

const TIER_DOT_COLOR: Record<PriceTierId, string> = {
  under_market: "bg-amber",
  competitive: "bg-green",
  upper_mid: "bg-brass",
  premium: "bg-red",
  no_data: "bg-ink/25",
};

const TIER_ACCENT_BORDER: Record<PriceTierId, string> = {
  under_market: "border-l-amber",
  competitive: "border-l-green",
  upper_mid: "border-l-brass",
  premium: "border-l-red",
  no_data: "border-l-ink/20",
};

/**
 * Deliberately NOT reusing tier colors here — basis (how we know) is a
 * different axis from tier (what we concluded), and giving it its own
 * quiet, neutral styling keeps the two from being visually confused.
 * Nothing renders for "no_data": the tier badge already says "No market
 * data", so a second badge would be redundant.
 */
function BasisBadge({ basis }: { basis: AssessmentBasis }) {
  if (basis === "no_data") return null;
  const label = ASSESSMENT_BASES.find((b) => b.id === basis)?.label ?? basis;
  const Icon = basis === "verified_local" ? IconMapPin : IconInfoCircle;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[10.5px] font-medium text-ink-mute">
      <Icon size={11} />
      {label}
    </span>
  );
}

function PriceLegend() {
  return (
    <div>
      <SectionHeading title="What the rankings mean" className="mb-3" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 nav:grid-cols-5">
        {PRICE_TIERS.map((tier) => (
          <div key={tier.id} className="rounded-lg border border-paper-deep bg-white p-3">
            <div className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", TIER_DOT_COLOR[tier.id])} />
              <span className="text-[12.5px] font-semibold text-ink">{tier.label}</span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-ink-mute">{tier.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceRow({
  row,
  onSave,
  onDelete,
}: {
  row: PriceRow;
  onSave: (id: string, service: string, price: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [service, setService] = useState(row.service);
  const [priceText, setPriceText] = useState(String(row.price));
  const [deleting, setDeleting] = useState(false);

  function commit() {
    const parsed = Number(priceText);
    if (!service.trim() || Number.isNaN(parsed) || parsed < 0) {
      setService(row.service);
      setPriceText(String(row.price));
      return;
    }
    if (service.trim() === row.service && parsed === row.price) return;
    void onSave(row.id, service.trim(), parsed);
  }

  return (
    <div className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
      <input
        type="text"
        value={service}
        onChange={(e) => setService(e.target.value)}
        onBlur={commit}
        className="min-w-0 flex-1 rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
      />
      <div className="flex items-center gap-1 text-sm text-ink-mute">
        <span>$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          onBlur={commit}
          className="w-[88px] rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
        />
      </div>
      <button
        type="button"
        aria-label={`Remove ${row.service}`}
        disabled={deleting}
        onClick={async () => {
          setDeleting(true);
          await onDelete(row.id);
        }}
        className="shrink-0 rounded-lg p-2 text-ink-mute hover:bg-red/10 hover:text-red disabled:opacity-50"
      >
        <IconTrash size={16} />
      </button>
    </div>
  );
}

function ServicesAndPrices({
  businessId,
  prices,
  setPrices,
  pricingExamples,
}: {
  businessId: string;
  prices: PriceRow[];
  setPrices: React.Dispatch<React.SetStateAction<PriceRow[]>>;
  pricingExamples: string[];
}) {
  const [newService, setNewService] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function handleAdd() {
    const parsed = Number(newPrice);
    if (!newService.trim()) {
      setAddError("Enter a service name.");
      return;
    }
    if (Number.isNaN(parsed) || parsed < 0) {
      setAddError("Enter a valid price.");
      return;
    }
    setAddError(null);
    const result = await addPriceRow(businessId, { service: newService.trim(), price: parsed });
    if (result.status === "ok") {
      setPrices((prev) => [...prev, result.row]);
      setNewService("");
      setNewPrice("");
    } else {
      setAddError(result.status === "error" ? result.message : "Could not add this row.");
    }
  }

  async function handleSave(id: string, service: string, price: number) {
    const result = await updatePriceRow(id, { service, price });
    if (result.status === "ok") {
      setPrices((prev) => prev.map((p) => (p.id === id ? result.row : p)));
      setRowError(null);
    } else {
      setRowError(result.status === "error" ? result.message : "Could not save this row.");
    }
  }

  async function handleDelete(id: string) {
    const result = await deletePriceRow(id);
    if (result.status === "ok") {
      setPrices((prev) => prev.filter((p) => p.id !== id));
      setRowError(null);
    } else {
      setRowError(result.status === "error" ? result.message : "Could not remove this row.");
    }
  }

  return (
    <Card className="p-5">
      {prices.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Add a service and what you charge for it below to get started.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-paper-line">
          {prices.map((row) => (
            <ServiceRow key={row.id} row={row} onSave={handleSave} onDelete={handleDelete} />
          ))}
        </div>
      )}
      {rowError && <p className="mt-2 text-[12px] text-red">{rowError}</p>}

      <div className="mt-4 flex items-center gap-2.5 border-t border-paper-line pt-4">
        <input
          type="text"
          placeholder={`e.g. ${pricingExamples[0] ?? "Standard Service"}`}
          value={newService}
          onChange={(e) => setNewService(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
        />
        <div className="flex items-center gap-1 text-sm text-ink-mute">
          <span>$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            className="w-[88px] rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
          />
        </div>
        <Button type="button" variant="default" size="sm" onClick={handleAdd} className="shrink-0">
          <IconPlus size={14} />
          Add
        </Button>
      </div>
      {pricingExamples.length > 0 && (
        <p className="mt-2 text-[12px] text-ink-mute">Examples: {pricingExamples.join(", ")}</p>
      )}
      {addError && <p className="mt-2 text-[12px] text-red">{addError}</p>}
    </Card>
  );
}

/** A clean horizontal comparison strip of real Google price levels — the
 * business's own $/$$/$$$ next to nearby competitors', never a
 * fabricated number. */
function PriceLevelStrip({ context }: { context: PriceLevelComparison }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        <IconChartBar size={13} />
        Real Google price-level context
      </div>
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="flex flex-col items-center justify-center rounded-lg bg-brass px-3.5 py-2 text-white">
          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-85">You</span>
          <span className="text-sm font-bold">{context.subjectSymbol ?? "—"}</span>
        </div>
        {context.competitors.map((c, i) => (
          <div
            key={i}
            className="flex flex-col items-center justify-center rounded-lg border border-paper-deep bg-white px-3.5 py-2"
          >
            <span className="max-w-[92px] truncate text-[10px] text-ink-mute" title={c.name}>
              {c.name}
            </span>
            <span className="text-sm font-semibold text-ink">{c.symbol ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssessmentEmptyState() {
  return (
    <Card className="flex flex-col items-center gap-2 border-dashed p-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brass/10 text-brass">
        <IconSparkles size={18} />
      </span>
      <p className="max-w-[26ch] text-sm text-ink-soft">
        Add your prices, then click &quot;Assess my pricing&quot; to see how they compare.
      </p>
    </Card>
  );
}

function AssessmentSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded-lg bg-paper-deep/40 p-3">
          <div className="h-3 w-2/5 rounded bg-paper-deep" />
          <div className="mt-2 h-2.5 w-4/5 rounded bg-paper-deep" />
        </div>
      ))}
    </Card>
  );
}

function AssessmentResults({ result }: { result: StoredPricingAssessment }) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-2.5">
        {result.assessments.map((a, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg border-l-4 bg-paper-deep/25 px-3.5 py-2.5",
              TIER_ACCENT_BORDER[a.tier]
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13.5px] font-semibold text-ink">
                {a.service} <span className="font-normal text-ink-mute">— ${a.price.toFixed(2)}</span>
              </div>
              <Pill variant={TIER_PILL_VARIANT[a.tier]} className="shrink-0">
                {PRICE_TIERS.find((t) => t.id === a.tier)?.label ?? a.tier}
              </Pill>
            </div>
            {a.basis !== "no_data" && (
              <div className="mt-1">
                <BasisBadge basis={a.basis} />
              </div>
            )}
            <p className="mt-1 text-[12.5px] text-ink-soft">{a.guidance}</p>
          </div>
        ))}
      </div>
      {result.priceLevelContext && result.priceLevelContext.competitors.length > 0 && (
        <div className="mt-5 border-t border-paper-line pt-4">
          <PriceLevelStrip context={result.priceLevelContext} />
        </div>
      )}
    </Card>
  );
}

function PricingTips({ profile }: { profile: BizProfile }) {
  return (
    <div>
      <SectionHeading title={`Pricing tips for ${profile.label.toLowerCase()}`} className="mb-3" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {profile.pricingTips.map((tip) => (
          <Card key={tip.id} className="flex items-start gap-3 p-4">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brass/10 text-brass">
              <IconBulb size={15} />
            </span>
            <div>
              <div className="text-[13.5px] font-semibold text-ink">{tip.label}</div>
              <p className="mt-0.5 text-[13px] text-ink-soft">{tip.description}</p>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-ink-mute">
        General pricing strategy for this type of business — not a data-driven analysis of your
        actual prices. For that, use &quot;Assess my pricing&quot; above.
      </p>
    </div>
  );
}

export function PricingView({
  businessId,
  businessName,
  profile,
  initialPrices,
  initialAssessment,
}: {
  businessId: string;
  businessName: string | null;
  profile: BizProfile;
  initialPrices: PriceRow[];
  initialAssessment: StoredPricingAssessment | null;
}) {
  const [prices, setPrices] = useState<PriceRow[]>(initialPrices);
  const [lastResult, setLastResult] = useState<StoredPricingAssessment | null>(initialAssessment);
  const [runState, setRunState] = useState<
    { kind: "idle" } | { kind: "working" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleAssess() {
    setRunState({ kind: "working" });
    const result = await assessPricing(businessId);
    if (result.status === "ok") {
      setLastResult({
        assessments: result.assessments,
        priceLevelContext: result.priceLevelContext,
        assessedAt: result.assessedAt,
      });
      setRunState({ kind: "idle" });
    } else if (result.status === "no_prices") {
      setRunState({ kind: "error", message: "Add at least one service and price above first." });
    } else {
      setRunState({
        kind: "error",
        message: result.status === "error" ? result.message : "Couldn't assess pricing — try again.",
      });
    }
  }

  const isWorking = runState.kind === "working";

  return (
    <div className="flex flex-col gap-8 nav:gap-10">
      <div>
        <Link
          href={`/business/${businessId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={15} />
          Back to {businessName ?? "business"}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">Price check</h1>
          <Pill variant="brass">{profile.label}</Pill>
        </div>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
          Enter your prices and see how they compare to your local market — with advice on where
          you can adjust to bring more people in.
        </p>
      </div>

      <Card className="flex items-start gap-3 p-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-ink-mute">
          <IconTag size={16} />
        </span>
        <p className="text-[13px] text-ink-soft">
          Optional and private. Prices aren&apos;t part of your score — this is just a tool. You
          type in what you charge; we compare it to local market data where we can find it, and
          give a clear estimate where we can&apos;t. We never guess a competitor&apos;s exact price.
        </p>
      </Card>

      <PriceLegend />

      <div className="grid grid-cols-1 gap-6 nav:grid-cols-2 nav:items-start">
        <div className="flex flex-col gap-4">
          <SectionHeading title="Your services & prices" />
          <ServicesAndPrices
            businessId={businessId}
            prices={prices}
            setPrices={setPrices}
            pricingExamples={profile.pricingExamples}
          />

          <div className="flex flex-col gap-2">
            <Button variant="brass" onClick={handleAssess} disabled={prices.length === 0 || isWorking} className="w-fit">
              <IconSparkles size={16} />
              {isWorking ? "Assessing…" : lastResult ? "Re-assess my pricing" : "Assess my pricing"}
            </Button>
            {runState.kind === "error" ? (
              <p className="text-[12px] text-red">{runState.message}</p>
            ) : lastResult ? (
              <p className="text-[12px] text-ink-mute">
                Last assessed {new Date(lastResult.assessedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <SectionHeading title="Your pricing assessment" />
          {lastResult ? (
            <div className="relative">
              <AssessmentResults result={lastResult} />
              {isWorking && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70">
                  <IconLoader2 size={22} className="animate-spin text-brass" />
                </div>
              )}
            </div>
          ) : isWorking ? (
            <AssessmentSkeleton />
          ) : (
            <AssessmentEmptyState />
          )}
        </div>
      </div>

      <PricingTips profile={profile} />
    </div>
  );
}
