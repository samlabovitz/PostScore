"use client";

// The promo cards at the bottom of the main pages (above the footer):
// Free sees Grow ("Fix it yourself, step by step") and Premium ("We do the
// work for you", "Best value") side by side, stacked on a phone — Premium
// is always shown; Grow sees the Premium card; Premium sees one PostStudio
// line on the Website page only; Multi sees nothing. Each card: 3 chips
// for this page (rotating one at a time, "soon" where not built), "See
// what's included" (the promo box) and × (hidden 14 days for this
// business, in the database when supabase/promo-dismissals.sql has run,
// and on the device).

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { IconCrown, IconRocket, IconX } from "@tabler/icons-react";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BOX_CLOSED, boxReducer, cardChips, hiddenUntilFrom, isHidden, readLocalHidden, visibleChips, writeLocalHidden, type BoxAction } from "@/lib/upgradePromos";
import type { UpgradeCard } from "@/lib/upgradePromos.server";
import { hidePromo } from "@/app/actions/upgradePromos";
import { useUpgrade } from "./UpgradeContext";
import { PromoBox } from "./PromoBox";

const ROTATE_MS = 6000;
const PREMIUM_BORDER = "border-[color:color-mix(in_srgb,var(--color-brass)_45%,white)]";

function useRotation(active: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) return;
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      // Older browsers: rotate.
    }
    if (reduced) return;
    const id = window.setInterval(() => setStep((s) => s + 1), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [active]);
  return step;
}

function HideButton({ label, onHide }: { label: string; onHide: () => void }) {
  return (
    <button type="button" onClick={onHide} aria-label={label} title={label} className="shrink-0 rounded-md p-1 text-ink-soft hover:bg-paper hover:text-ink" data-testid="card-hide">
      <IconX size={16} />
    </button>
  );
}

function PlanCard({ card, fixPoints, businessName, onHide }: { card: UpgradeCard; fixPoints: number | null; businessName: string | null; onHide: () => void }) {
  const locale = useLocale();
  const premium = card.kind === "premium";
  const chips = cardChips(card.kind, card.page, useUpgrade()?.plan ?? null);
  const step = useRotation(chips.length > 3);
  const [box, dispatch] = useReducer(boxReducer, BOX_CLOSED);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback((reason: Extract<BoxAction, { type: "close" }>["reason"]) => dispatch({ type: "close", reason }), []);
  const fixLine = !premium && fixPoints && businessName ? t(locale, "dashboard.upgrade.strip.fixPoints", { n: fixPoints, name: businessName }) : null;

  return (
    <div
      data-testid="promo-card"
      data-kind={card.kind}
      className={cn(
        "relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border p-4",
        premium ? cn(PREMIUM_BORDER, "bg-gradient-to-br from-[color:color-mix(in_srgb,var(--color-brass)_12%,white)] to-white") : "border-paper-deep bg-white"
      )}
    >
      {premium && (
        <span data-testid="best-value" className="absolute right-10 top-0 rounded-b-md bg-ink px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-white">
          {t(locale, "dashboard.settings.plans.bestValue")}
        </span>
      )}
      <div className="flex items-start gap-2.5">
        <span
          className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", premium ? "bg-[color:color-mix(in_srgb,var(--color-brass)_20%,white)] text-brass" : "bg-paper text-ink")}
          aria-hidden
        >
          {premium ? <IconCrown size={17} /> : <IconRocket size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
            {t(locale, `dashboard.settings.plan.name.${card.kind}` as MessageKey)} · {t(locale, `dashboard.settings.plans.price.${card.kind}` as MessageKey)}
          </div>
          <div className="text-[14.5px] font-semibold leading-snug text-ink">{t(locale, premium ? "dashboard.upgrade.card.premiumTitle" : "dashboard.upgrade.card.growTitle")}</div>
          {fixLine && <div className="mt-0.5 text-[12px] text-ink-soft">{fixLine}</div>}
        </div>
        <HideButton label={t(locale, premium ? "dashboard.upgrade.card.hidePremium" : "dashboard.upgrade.card.hideGrow")} onHide={onHide} />
      </div>
      <ul className="flex flex-wrap gap-1.5" data-testid="card-chips">
        {visibleChips(chips, step).map((c) => (
          <li key={c.key} className="inline-flex items-center gap-1 rounded-full border border-paper-deep bg-white px-2.5 py-1 text-[12px] font-medium text-ink">
            {t(locale, c.key)}
            {c.soon && <span className="rounded-full bg-paper px-1.5 text-[10px] font-semibold text-ink-soft">{t(locale, "dashboard.upgrade.chip.soon")}</span>}
          </li>
        ))}
      </ul>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={box.open}
        onClick={() => dispatch(box.open ? { type: "close", reason: "x" } : { type: "lockedClick", feature: premium ? "premium" : "grow" })}
        className="mt-auto inline-flex w-fit items-center rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink/90"
        data-testid="card-see-included"
      >
        {t(locale, "dashboard.upgrade.strip.seeIncluded")}
      </button>
      {box.open && <PromoBox feature={box.feature} anchorRef={anchorRef} onClose={close} />}
    </div>
  );
}

export function PromoCards() {
  const up = useUpgrade();
  const locale = useLocale();
  const cards = up?.cards ?? [];
  // The database copy decides the first render (same on server and
  // client); this device's copy is read after mount.
  const [hidden, setHidden] = useState<Record<string, boolean>>(() => Object.fromEntries(cards.map((c) => [c.key, isHidden(c.hiddenUntil, new Date())])));
  const cardKeys = cards.map((c) => c.key).join(",");
  useEffect(() => {
    if (!up) return;
    const now = new Date();
    const local = Object.fromEntries(up.cards.map((c) => [c.key, isHidden(readLocalHidden(up.businessId, c.key), now)]));
    setHidden((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(local)) if (v) next[k] = true;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKeys]);

  if (!up) return null;
  const visible = cards.filter((c) => !hidden[c.key]);
  if (visible.length === 0) return null;

  function hide(key: string) {
    if (!up) return;
    setHidden((prev) => ({ ...prev, [key]: true }));
    writeLocalHidden(up.businessId, key, hiddenUntilFrom(new Date()));
    hidePromo(up.businessId, key).catch(() => undefined);
  }

  return (
    <aside
      aria-label={t(locale, "dashboard.upgrade.strip.label")}
      data-testid="promo-cards"
      data-kinds={visible.map((c) => c.kind).join(",")}
      className={cn("mt-10 grid grid-cols-1 gap-3", visible.length > 1 && "md:grid-cols-2")}
    >
      {visible.map((card) => (
        <PlanCard key={card.key} card={card} fixPoints={up.facts.fixPoints} businessName={up.facts.businessName} onHide={() => hide(card.key)} />
      ))}
    </aside>
  );
}
