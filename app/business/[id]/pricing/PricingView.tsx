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
  PRICE_TIERS,
  detectSize,
  formatMoney,
  formatTypicalRange,
  priceMapGeometry,
  priceMapSummary,
  type PriceAssessment,
  isPricingLanguageMismatch,
  type AssessmentBasis,
  type PriceLevelComparison,
  type PriceRow,
  type PriceTierId,
} from "@/lib/pricing";
import type { BizProfile } from "@/config/bizProfiles";
import { formatDateTime, t, useLocale, useTimeZone, type MessageKey } from "@/lib/i18n";

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
 * lib/pricing.ts's PRICE_TIERS/ASSESSMENT_BASES hold the real English
 * label/description text (single source of truth for tier IDs and the
 * AI response validation) — lib/pricing.ts itself stays untouched/
 * English-only, so this view resolves display text for each id through
 * its own key lookup instead of reading `.label`/`.description` off
 * those arrays directly. Never read this record's values as English.
 */
const TIER_LABEL_KEY: Record<PriceTierId, MessageKey> = {
  under_market: "dashboard.pricing.tier.underMarket.label",
  competitive: "dashboard.pricing.tier.competitive.label",
  upper_mid: "dashboard.pricing.tier.upperMid.label",
  premium: "dashboard.pricing.tier.premium.label",
  no_data: "dashboard.pricing.tier.noData.label",
};

const TIER_DESCRIPTION_KEY: Record<PriceTierId, MessageKey> = {
  under_market: "dashboard.pricing.tier.underMarket.description",
  competitive: "dashboard.pricing.tier.competitive.description",
  upper_mid: "dashboard.pricing.tier.upperMid.description",
  premium: "dashboard.pricing.tier.premium.description",
  no_data: "dashboard.pricing.tier.noData.description",
};

/** Only "verified_local" and "general_estimate" ever reach BasisBadge —
 * it returns null for "no_data" before any lookup — so that's the only
 * basis with no key here. */
const BASIS_LABEL_KEY: Record<Exclude<AssessmentBasis, "no_data">, MessageKey> = {
  verified_local: "dashboard.pricing.basis.verifiedLocal.label",
  general_estimate: "dashboard.pricing.basis.generalEstimate.label",
};

/**
 * Deliberately NOT reusing tier colors here — basis (how we know) is a
 * different axis from tier (what we concluded), and giving it its own
 * quiet, neutral styling keeps the two from being visually confused.
 * Nothing renders for "no_data": the tier badge already says "No market
 * data", so a second badge would be redundant.
 */
function BasisBadge({ basis }: { basis: AssessmentBasis }) {
  const locale = useLocale();
  if (basis === "no_data") return null;
  const Icon = basis === "verified_local" ? IconMapPin : IconInfoCircle;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[10.5px] font-medium text-ink-mute">
      <Icon size={11} />
      {t(locale, BASIS_LABEL_KEY[basis])}
    </span>
  );
}

/** The small legend under the price map — one row of dots; ⓘ opens what
 * each ranking means (the full text that used to be five cards). */
function PriceLegend() {
  const locale = useLocale();
  return (
    <details data-testid="price-legend" className="group text-[12px]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-ink-soft [&::-webkit-details-marker]:hidden">
        {PRICE_TIERS.map((tier) => (
          <span key={tier.id} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", TIER_DOT_COLOR[tier.id])} />
            {t(locale, TIER_LABEL_KEY[tier.id])}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 font-medium text-ink">
          <IconInfoCircle size={14} aria-hidden />
          {t(locale, "dashboard.pricing.legend.what")}
        </span>
      </summary>
      <dl className="mt-2 grid grid-cols-1 gap-1.5 rounded-lg bg-paper p-3 sm:grid-cols-2">
        {PRICE_TIERS.map((tier) => (
          <div key={tier.id}>
            <dt className="font-semibold text-ink">{t(locale, TIER_LABEL_KEY[tier.id])}</dt>
            <dd className="leading-snug text-ink-mute">{t(locale, TIER_DESCRIPTION_KEY[tier.id])}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Zone fills on the price-map bar: soft tints of the tier colors, so the
 * solid brass "your price" marker always stands out. */
const ZONE_FILL: Record<Exclude<PriceTierId, "no_data">, string> = {
  under_market: "color-mix(in srgb, var(--color-amber) 28%, white)",
  competitive: "color-mix(in srgb, var(--color-green) 26%, white)",
  upper_mid: "color-mix(in srgb, var(--color-brass) 26%, white)",
  premium: "color-mix(in srgb, var(--color-red) 22%, white)",
};

function SummaryStrip({ assessments }: { assessments: PriceAssessment[] }) {
  const locale = useLocale();
  const s = priceMapSummary(assessments);
  const parts = [
    t(locale, s.items === 1 ? "dashboard.pricing.map.items_one" : "dashboard.pricing.map.items_other", { n: s.items }),
    t(locale, "dashboard.pricing.map.competitive", { n: s.competitive }),
    t(locale, "dashboard.pricing.map.underMarket", { n: s.underMarket }),
    ...(s.upperMid ? [t(locale, "dashboard.pricing.map.upperMid", { n: s.upperMid })] : []),
    ...(s.premium ? [t(locale, "dashboard.pricing.map.premium", { n: s.premium })] : []),
    ...(s.needsDetails ? [t(locale, "dashboard.pricing.map.needsDetails", { n: s.needsDetails })] : []),
    ...(s.collectible ? [t(locale, "dashboard.pricing.map.collectible", { n: s.collectible })] : []),
  ];
  return (
    <p data-testid="price-summary" className="rounded-lg bg-paper px-3 py-2 text-[12.5px] font-medium text-ink">
      {parts.join(" · ")}
    </p>
  );
}

/** One item on the price map: typical low → high with zones and a brass
 * marker for their price. No range → a grey row saying what's missing. */
function PriceMapRow({ a }: { a: PriceAssessment }) {
  const locale = useLocale();
  const name = (
    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
      <span className="min-w-0 truncate font-medium text-ink">
        {a.service}
        {a.size ? <span className="font-normal text-ink-mute"> · {a.size}</span> : null}
      </span>
      <span className="shrink-0 font-semibold text-ink">{formatMoney(a.price)}</span>
    </div>
  );
  if (a.typicalLow === undefined || a.typicalHigh === undefined || a.tier === "no_data") {
    // "Add brand + size" only for a bottled/packaged item that really
    // lacks them — never for a menu item or service the AI couldn't price.
    const label =
      a.reason === "collectible"
        ? "dashboard.pricing.map.collectibleRow"
        : a.reason === "needs_brand_and_size"
          ? "dashboard.pricing.map.addBrandSize"
          : a.tier === "no_data"
            ? "dashboard.pricing.map.noMarketData"
            : "dashboard.pricing.map.noRange";
    return (
      <li data-testid="price-map-empty">
        {name}
        <div className="mt-1 flex h-6 items-center rounded-full bg-ink/5 px-3 text-[11.5px] font-medium text-ink-mute">
          {t(locale, label)}
        </div>
      </li>
    );
  }
  const g = priceMapGeometry(a.price, a.typicalLow, a.typicalHigh);
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const zones: Array<[Exclude<PriceTierId, "no_data">, number, number]> = [
    ["under_market", 0, g.lowAt],
    ["competitive", g.lowAt, g.upperMidAt],
    ["upper_mid", g.upperMidAt, g.highAt],
    ["premium", g.highAt, 1],
  ];
  const title = t(locale, "dashboard.pricing.map.markerTitle", {
    price: formatMoney(a.price),
    range: formatTypicalRange(a.typicalLow, a.typicalHigh),
  });
  return (
    <li data-testid="price-map-row" title={title}>
      {name}
      <div className="relative mt-1.5 h-3">
        <div className="absolute inset-0 flex gap-[2px] overflow-hidden rounded-full">
          {zones.map(([tier, from, to]) => (
            <span key={tier} data-zone={tier} className="h-full" style={{ width: pct(to - from), background: ZONE_FILL[tier] }} />
          ))}
        </div>
        <span
          role="img"
          aria-label={title}
          className="absolute top-1/2 h-5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brass shadow-[0_0_0_1px_var(--color-ink)]"
          style={{ left: pct(g.markerAt) }}
        />
      </div>
      <div className="relative mt-1 h-3.5 text-[10.5px] text-ink-mute">
        <span className="absolute -translate-x-1/2" style={{ left: pct(g.lowAt) }}>
          {formatMoney(a.typicalLow)}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(g.highAt) }}>
          {formatMoney(a.typicalHigh)}
        </span>
      </div>
    </li>
  );
}

function PriceMap({ assessments }: { assessments: PriceAssessment[] }) {
  const locale = useLocale();
  return (
    <div data-testid="price-map" className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        <IconChartBar size={13} />
        {t(locale, "dashboard.pricing.map.heading")}
      </div>
      <SummaryStrip assessments={assessments} />
      <ul className="flex flex-col gap-3.5">
        {assessments.map((a, i) => (
          <PriceMapRow key={i} a={a} />
        ))}
      </ul>
      <PriceLegend />
    </div>
  );
}

function ServiceRow({
  row,
  onSave,
  onDelete,
}: {
  row: PriceRow;
  onSave: (id: string, service: string, price: number, size: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const locale = useLocale();
  const [service, setService] = useState(row.service);
  const [size, setSize] = useState(row.size ?? "");
  // Size fills itself from the name ("Tito's Vodka 750 ml") until the
  // owner types a size of their own.
  const [sizeAuto, setSizeAuto] = useState(!row.size);
  const [priceText, setPriceText] = useState(String(row.price));
  const [deleting, setDeleting] = useState(false);

  function commit() {
    const parsed = Number(priceText);
    if (!service.trim() || Number.isNaN(parsed) || parsed < 0) {
      setService(row.service);
      setPriceText(String(row.price));
      return;
    }
    if (service.trim() === row.service && parsed === row.price && size.trim() === (row.size ?? "")) return;
    void onSave(row.id, service.trim(), parsed, size.trim());
  }

  return (
    <ItemFields
      service={service}
      onService={(v) => {
        setService(v);
        if (sizeAuto) setSize(detectSize(v) ?? "");
      }}
      size={size}
      sizeAuto={sizeAuto && size !== ""}
      onSize={(v) => {
        setSize(v);
        setSizeAuto(v === "");
      }}
      sizeAriaLabel={t(locale, "dashboard.pricing.sizeAriaLabel", { service: row.service })}
      priceText={priceText}
      onPrice={setPriceText}
      onBlur={commit}
      action={
        <button
          type="button"
          aria-label={t(locale, "dashboard.pricing.removeServiceAriaLabel", { service: row.service })}
          disabled={deleting}
          onClick={async () => {
            setDeleting(true);
            await onDelete(row.id);
          }}
          className="shrink-0 rounded-lg p-2 text-ink-mute hover:bg-red/10 hover:text-red disabled:opacity-50"
        >
          <IconTrash size={16} />
        </button>
      }
    />
  );
}

/** One item: the name gets its own full-width line; size and price sit
 * underneath, wide enough that "Size (optional)" is never cut off. */
function ItemFields({
  service,
  onService,
  servicePlaceholder,
  size,
  sizeAuto,
  onSize,
  sizeAriaLabel,
  priceText,
  onPrice,
  onBlur,
  action,
}: {
  service: string;
  onService: (v: string) => void;
  servicePlaceholder?: string;
  size: string;
  sizeAuto: boolean;
  onSize: (v: string) => void;
  sizeAriaLabel: string;
  priceText: string;
  onPrice: (v: string) => void;
  onBlur?: () => void;
  action: React.ReactNode;
}) {
  const locale = useLocale();
  const input = "rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft";
  return (
    <div className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0">
      <input
        type="text"
        value={service}
        placeholder={servicePlaceholder}
        aria-label={t(locale, "dashboard.pricing.itemLabel")}
        onChange={(e) => onService(e.target.value)}
        onBlur={onBlur}
        className={cn(input, "w-full min-w-0")}
      />
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={size}
            maxLength={40}
            onChange={(e) => onSize(e.target.value)}
            onBlur={onBlur}
            placeholder={t(locale, "dashboard.pricing.sizePlaceholder")}
            aria-label={sizeAriaLabel}
            className={cn(input, "w-full min-w-0")}
          />
        </div>
        <label className="flex shrink-0 items-center gap-1 text-sm text-ink-mute">
          <span aria-hidden>$</span>
          <span className="sr-only">{t(locale, "dashboard.pricing.priceLabel")}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={priceText}
            onChange={(e) => onPrice(e.target.value)}
            onBlur={onBlur}
            className={cn(input, "w-[92px]")}
          />
        </label>
        {action}
      </div>
      {sizeAuto && <p className="-mt-1 text-[11.5px] text-ink-mute">{t(locale, "dashboard.pricing.sizeDetected")}</p>}
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
  const locale = useLocale();
  const [newService, setNewService] = useState("");
  const [newSize, setNewSize] = useState("");
  const [newSizeAuto, setNewSizeAuto] = useState(true);
  const [newPrice, setNewPrice] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function handleAdd() {
    const parsed = Number(newPrice);
    if (!newService.trim()) {
      setAddError(t(locale, "dashboard.pricing.enterServiceName"));
      return;
    }
    if (Number.isNaN(parsed) || parsed < 0) {
      setAddError(t(locale, "dashboard.pricing.enterValidPrice"));
      return;
    }
    setAddError(null);
    const result = await addPriceRow(businessId, { service: newService.trim(), price: parsed, size: newSize.trim() });
    if (result.status === "ok") {
      setPrices((prev) => [...prev, result.row]);
      setNewService("");
      setNewSize("");
      setNewSizeAuto(true);
      setNewPrice("");
    } else {
      setAddError(result.status === "error" ? result.message : t(locale, "dashboard.pricing.couldNotAddRow"));
    }
  }

  async function handleSave(id: string, service: string, price: number, size: string) {
    const result = await updatePriceRow(id, { service, price, size });
    if (result.status === "ok") {
      setPrices((prev) => prev.map((p) => (p.id === id ? result.row : p)));
      setRowError(null);
    } else {
      setRowError(result.status === "error" ? result.message : t(locale, "dashboard.pricing.couldNotSaveRow"));
    }
  }

  async function handleDelete(id: string) {
    const result = await deletePriceRow(id);
    if (result.status === "ok") {
      setPrices((prev) => prev.filter((p) => p.id !== id));
      setRowError(null);
    } else {
      setRowError(result.status === "error" ? result.message : t(locale, "dashboard.pricing.couldNotRemoveRow"));
    }
  }

  return (
    <Card className="p-5">
      {prices.length === 0 ? (
        <p className="text-sm text-ink-soft">{t(locale, "dashboard.pricing.emptyServicesPrompt")}</p>
      ) : (
        <div className="flex flex-col divide-y divide-paper-line">
          {prices.map((row) => (
            <ServiceRow key={row.id} row={row} onSave={handleSave} onDelete={handleDelete} />
          ))}
        </div>
      )}
      {rowError && <p className="mt-2 text-[12px] text-red">{rowError}</p>}

      <div className="mt-4 border-t border-paper-line pt-4">
        <ItemFields
          service={newService}
          servicePlaceholder={t(locale, "dashboard.pricing.servicePlaceholder", {
            example: pricingExamples[0] ?? t(locale, "dashboard.pricing.standardServiceFallback"),
          })}
          onService={(v) => {
            setNewService(v);
            if (newSizeAuto) setNewSize(detectSize(v) ?? "");
          }}
          size={newSize}
          sizeAuto={newSizeAuto && newSize !== ""}
          onSize={(v) => {
            setNewSize(v);
            setNewSizeAuto(v === "");
          }}
          sizeAriaLabel={t(locale, "dashboard.pricing.sizeNewAriaLabel")}
          priceText={newPrice}
          onPrice={setNewPrice}
          action={
            <Button type="button" variant="default" size="sm" onClick={handleAdd} className="shrink-0">
              <IconPlus size={14} />
              {t(locale, "dashboard.pricing.addServiceButton")}
            </Button>
          }
        />
      </div>
      {pricingExamples.length > 0 && (
        <p className="mt-2 text-[12px] text-ink-mute">
          {t(locale, "dashboard.pricing.examplesPrefix", { examples: pricingExamples.join(", ") })}
        </p>
      )}
      <p className="mt-1 text-[12px] text-ink-mute">{t(locale, "dashboard.pricing.sizeHint")}</p>
      {addError && <p className="mt-2 text-[12px] text-red">{addError}</p>}
    </Card>
  );
}

/** A clean horizontal comparison strip of real Google price levels — the
 * business's own $/$$/$$$ next to nearby competitors', never a
 * fabricated number. */
function PriceLevelStrip({ context }: { context: PriceLevelComparison }) {
  const locale = useLocale();
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        <IconChartBar size={13} />
        {t(locale, "dashboard.pricing.priceLevelContextHeading")}
      </div>
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="flex flex-col items-center justify-center rounded-lg bg-brass px-3.5 py-2 text-white">
          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-85">
            {t(locale, "dashboard.pricing.youLabel")}
          </span>
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

function AssessmentEmptyState({ button }: { button: string }) {
  const locale = useLocale();
  return (
    <Card className="flex flex-col items-center gap-2 border-dashed p-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full ps-icon-tile">
        <IconSparkles size={18} />
      </span>
      <p className="max-w-[26ch] text-sm text-ink-soft">{t(locale, "dashboard.pricing.assessmentEmptyState", { button })}</p>
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

function AssessmentResults({ result, competitorNoun }: { result: StoredPricingAssessment; competitorNoun: string }) {
  const locale = useLocale();
  const levels = result.priceLevelContext;
  const anyLevel = !!levels && (levels.subjectSymbol !== null || levels.competitors.some((c) => c.symbol !== null));
  return (
    <Card className="flex flex-col gap-5 p-5">
      <PriceMap assessments={result.assessments} />
      <ul data-testid="assessment-list" className="flex flex-col gap-2 border-t border-paper-line pt-4">
        {result.assessments.map((a, i) => (
          <li key={i}>
            <details className={cn("group rounded-lg border-l-4 bg-paper-deep/25", TIER_ACCENT_BORDER[a.tier])}>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                  {a.service}
                  {a.size ? <span className="font-normal text-ink-soft"> ({a.size})</span> : null}
                </span>
                <span className="shrink-0 text-[13px] text-ink-soft">{formatMoney(a.price)}</span>
                <Pill variant={TIER_PILL_VARIANT[a.tier]} className="shrink-0">
                  {t(locale, TIER_LABEL_KEY[a.tier])}
                </Pill>
                <span className="shrink-0 text-[12px] font-medium text-ink-mute underline decoration-dotted underline-offset-2">
                  {t(locale, "dashboard.pricing.why")}
                </span>
              </summary>
              <div className="px-3 pb-2.5">
                {a.basis !== "no_data" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <BasisBadge basis={a.basis} />
                    {/* The tier is computed from this range (lib/pricing.ts tierFromRange). */}
                    {a.typicalLow !== undefined && a.typicalHigh !== undefined && (
                      <span className="text-[12px] font-medium text-ink-soft">
                        {t(locale, "dashboard.pricing.typicalRange", { range: formatTypicalRange(a.typicalLow, a.typicalHigh) })}
                      </span>
                    )}
                  </div>
                )}
                <p className="mt-1 text-[12.5px] text-ink-soft">{a.guidance}</p>
              </div>
            </details>
          </li>
        ))}
      </ul>
      {levels && levels.competitors.length > 0 && (
        <div className="border-t border-paper-line pt-4">
          {anyLevel ? (
            <PriceLevelStrip context={levels} />
          ) : (
            <p data-testid="no-price-levels" className="text-[12.5px] text-ink-mute">
              {t(locale, "dashboard.pricing.noPriceLevels", { noun: competitorNoun })}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function PricingTips({ profile, button }: { profile: BizProfile; button: string }) {
  const locale = useLocale();
  return (
    <div>
      <SectionHeading
        title={t(locale, "dashboard.pricing.pricingTipsHeading", { profile: profile.label.toLowerCase() })}
        className="mb-3"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {profile.pricingTips.map((tip) => (
          <Card key={tip.id} className="flex items-start gap-3 p-4">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
              <IconBulb size={15} />
            </span>
            <div>
              <div className="text-[13.5px] font-semibold text-ink">{tip.label}</div>
              <p className="mt-0.5 text-[13px] text-ink-soft">{tip.description}</p>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-ink-mute">{t(locale, "dashboard.pricing.generalStrategyFootnote", { button })}</p>
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
  const locale = useLocale();
  const timeZone = useTimeZone();
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
        locale: result.locale,
      });
      setRunState({ kind: "idle" });
    } else if (result.status === "no_prices") {
      setRunState({ kind: "error", message: t(locale, "dashboard.pricing.noPricesError") });
    } else {
      setRunState({
        kind: "error",
        message: result.status === "error" ? result.message : t(locale, "dashboard.pricing.assessErrorFallback"),
      });
    }
  }

  const isWorking = runState.kind === "working";
  // One label, used by the button, the empty state and the tips footnote.
  const assessLabel = t(locale, lastResult ? "dashboard.pricing.reassessButton" : "dashboard.pricing.assessButton");
  const showLanguageMismatch = lastResult !== null && isPricingLanguageMismatch(lastResult.locale, locale);

  return (
    <div className="flex flex-col gap-8 nav:gap-10">
      <div>
        <Link
          href={`/business/${businessId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={15} />
          {t(locale, "dashboard.competitors.backTo", {
            name: businessName ?? t(locale, "dashboard.competitors.businessFallback"),
          })}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">
            {t(locale, "dashboard.pricing.pageTitle")}
          </h1>
          <Pill variant="brass">{profile.label}</Pill>
        </div>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
          {t(locale, profile.pricingOk ? "dashboard.pricing.introText" : "dashboard.pricing.notApplicable")}
        </p>
      </div>

      {/* A place of worship (BizProfile.pricingOk false) has no price
          check — the intro above says so, and nothing below applies. */}
      {profile.pricingOk && (
        <>
        <Card className="flex items-start gap-3 p-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-ink-mute">
            <IconTag size={16} />
          </span>
          <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.pricing.disclosureText")}</p>
        </Card>

        <div className="grid grid-cols-1 gap-6 nav:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] nav:items-start">
          <div className="flex flex-col gap-4">
            <SectionHeading title={t(locale, "dashboard.pricing.servicesHeading")} />
            <ServicesAndPrices
              businessId={businessId}
              prices={prices}
              setPrices={setPrices}
              pricingExamples={profile.pricingExamples}
            />

            <div className="flex flex-col gap-2">
              <Button variant="brass" onClick={handleAssess} disabled={prices.length === 0 || isWorking} className="w-fit">
                <IconSparkles size={16} />
                {isWorking ? t(locale, "dashboard.pricing.assessingButton") : assessLabel}
              </Button>
              {runState.kind === "error" ? (
                <p className="text-[12px] text-red">{runState.message}</p>
              ) : lastResult ? (
                <p className="text-[12px] text-ink-mute">
                  {t(locale, "dashboard.pricing.lastAssessed", {
                    date: formatDateTime(lastResult.assessedAt, locale, timeZone),
                  })}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading title={t(locale, "dashboard.pricing.assessmentHeading")} />
            {lastResult ? (
              <>
                <div className="relative">
                  <AssessmentResults result={lastResult} competitorNoun={profile.competitorNoun} />
                  {isWorking && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70">
                      <IconLoader2 size={22} className="animate-spin text-brass" />
                    </div>
                  )}
                </div>
                {showLanguageMismatch && (
                  <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.pricing.languageMismatchNote")}</p>
                )}
              </>
            ) : isWorking ? (
              <AssessmentSkeleton />
            ) : (
              <AssessmentEmptyState button={assessLabel} />
            )}
          </div>
        </div>

        <PricingTips profile={profile} button={assessLabel} />
        </>
      )}
    </div>
  );
}
