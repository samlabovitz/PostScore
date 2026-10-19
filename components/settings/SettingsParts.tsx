"use client";

// Settings page pieces: the section nav (left on desktop, tabs on
// phones), section cards, the save toast, the plan card, the
// cancel-at-period-end confirm, and "Unsubscribe from all emails". Every
// button here does something real — or isn't shown.

import { useEffect, useState, type ReactNode } from "react";
import { IconBell, IconBuildingStore, IconCheck, IconCreditCard, IconTag, IconUser, IconUserCircle, type Icon } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { unsubscribeFromAllEmails } from "@/app/actions/businesses";
import { SAVED_EVENT } from "@/lib/savedEvent";
import type { Plan } from "@/lib/plan";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Icons are named by a plain string key: the Settings page is a Server
 * Component, and a component (a function) can't be passed to a Client
 * Component as a prop. */
export const SETTINGS_ICONS = {
  user: IconUser,
  store: IconBuildingStore,
  card: IconCreditCard,
  bell: IconBell,
  tag: IconTag,
  account: IconUserCircle,
} satisfies Record<string, Icon>;
export type SettingsIconKey = keyof typeof SETTINGS_ICONS;

export interface SettingsSectionLink {
  id: string;
  label: string;
  icon: SettingsIconKey;
}

export function SettingsNav({ sections }: { sections: SettingsSectionLink[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  useEffect(() => {
    const onHash = () => setActive(window.location.hash.slice(1) || sections[0]?.id || "");
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [sections]);
  return (
    <nav aria-label="Settings" className="nav:sticky nav:top-6">
      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 nav:flex-col nav:overflow-visible">
        {sections.map((s) => {
          const SectionIcon = SETTINGS_ICONS[s.icon];
          return (
          <li key={s.id} className="shrink-0">
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? "true" : undefined}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                active === s.id ? "bg-white text-ink shadow-card" : "text-ink-soft hover:bg-white/60 hover:text-ink"
              )}
            >
              <SectionIcon size={16} aria-hidden className="text-brass" />
              {s.label}
            </a>
          </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SettingsSection({ id, icon, title, helper, children }: { id: string; icon: SettingsIconKey; title: string; helper: string; children: ReactNode }) {
  const SectionIcon = SETTINGS_ICONS[icon];
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-paper-deep bg-white p-5 shadow-card">
      <div className="mb-4 flex items-start gap-3">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
          <SectionIcon size={17} />
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-[18px] font-semibold text-ink">{title}</h2>
          <p className="text-[12.5px] text-ink-soft">{helper}</p>
        </div>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** "Saved" — shown briefly after any real, confirmed save on the page. */
export function SavedToast() {
  const locale = useLocale();
  const [show, setShow] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onSaved = () => {
      setShow(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShow(false), 2200);
    };
    window.addEventListener(SAVED_EVENT, onSaved);
    return () => {
      window.removeEventListener(SAVED_EVENT, onSaved);
      clearTimeout(timer);
    };
  }, []);
  if (!show) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white shadow-card">
      <IconCheck size={15} aria-hidden />
      {t(locale, "dashboard.settings.saved")}
    </div>
  );
}

// ---- Plan & billing ----

/** What each plan includes — only things that exist (or say "coming soon"). */
export const PLAN_FEATURES: Record<"free" | "grow" | "premium", MessageKey[]> = {
  free: ["dashboard.settings.plan.feature.score", "dashboard.settings.plan.feature.plan", "dashboard.settings.plan.feature.offers", "dashboard.settings.plan.feature.preview"],
  grow: ["dashboard.settings.plan.feature.everythingFree", "dashboard.settings.plan.feature.basicPrint"],
  premium: ["dashboard.settings.plan.feature.everythingGrow", "dashboard.settings.plan.feature.fullDesigners", "dashboard.settings.plan.feature.gbp"],
};

export function PlanCard({ plan }: { plan: Plan }) {
  const locale = useLocale();
  const tier = plan === "multi" ? "premium" : plan;
  return (
    <div data-testid="plan-card" className="flex flex-col gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_6%,white)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-soft">{t(locale, "dashboard.settings.plan.current")}</span>
        <span className="rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-semibold text-white">{t(locale, `dashboard.settings.plan.name.${plan}` as MessageKey)}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {PLAN_FEATURES[tier].map((k) => (
          <li key={k} className="flex items-start gap-2 text-[13px] text-ink">
            <IconCheck size={15} aria-hidden className="mt-0.5 shrink-0 text-green" />
            {t(locale, k)}
          </li>
        ))}
      </ul>
      <details className="group rounded-lg border border-paper-deep bg-white">
        <summary className="cursor-pointer list-none px-3 py-2 text-[13px] font-semibold text-ink [&::-webkit-details-marker]:hidden">{t(locale, "dashboard.settings.plan.compare")} ▾</summary>
        <div className="grid grid-cols-1 gap-3 border-t border-paper-line p-3 sm:grid-cols-3">
          {(["free", "grow", "premium"] as const).map((p) => (
            <div key={p} className={cn("rounded-lg p-2.5", p === tier && "bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)]")}>
              <div className="text-[13px] font-semibold text-ink">{t(locale, `dashboard.settings.plan.name.${p}` as MessageKey)}</div>
              <ul className="mt-1 flex flex-col gap-1">
                {PLAN_FEATURES[p].map((k) => (
                  <li key={k} className="text-[12px] leading-snug text-ink-soft">
                    {t(locale, k)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

/** Cancel at period end — rendered only for a real, paid subscription. */
export function CancelPlanButton({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  async function confirm() {
    setState("working");
    try {
      await onConfirm();
      setState("done");
      setOpen(false);
    } catch {
      setState("error");
    }
  }
  if (state === "done") return <p className="text-[13px] font-medium text-green">{t(locale, "dashboard.settings.plan.cancelled")}</p>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-fit rounded-lg border border-paper-deep bg-white px-3.5 py-2 text-[13.5px] font-medium text-ink hover:border-ink-soft">
        {t(locale, "dashboard.settings.plan.cancel")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t(locale, "dashboard.settings.plan.cancel")}>
        <p className="text-[13.5px] leading-relaxed text-ink">{t(locale, "dashboard.settings.plan.cancelConfirm")}</p>
        {state === "error" && <p className="mt-2 text-[12.5px] text-red">{t(locale, "dashboard.settings.plan.cancelError")}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-paper-deep bg-white px-3.5 py-2 text-[13.5px] font-semibold text-ink hover:border-ink-soft">
            {t(locale, "dashboard.settings.plan.keep")}
          </button>
          <button type="button" onClick={confirm} disabled={state === "working"} className="rounded-lg border border-ink bg-ink px-3.5 py-2 text-[13.5px] font-semibold text-white disabled:opacity-60">
            {t(locale, "dashboard.settings.plan.cancelAtPeriodEnd")}
          </button>
        </div>
      </Modal>
    </>
  );
}

// ---- Email ----

export function UnsubscribeAllButton() {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  async function confirm() {
    setState("working");
    const result = await unsubscribeFromAllEmails();
    if (result.status === "ok") {
      setState("done");
      setOpen(false);
      // The monthly toggle above reads from the server.
      window.location.reload();
    } else setState("error");
  }
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={() => setOpen(true)} className="w-fit rounded-lg border border-paper-deep bg-white px-3.5 py-2 text-[13.5px] font-medium text-ink hover:border-ink-soft">
        {t(locale, "dashboard.settings.email.unsubscribeAll")}
      </button>
      <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.settings.email.unsubscribeAllHelp")}</p>
      {state === "error" && <p className="text-[12.5px] text-red">{t(locale, "dashboard.settings.email.unsubscribeAllError")}</p>}
      <Modal open={open} onClose={() => setOpen(false)} title={t(locale, "dashboard.settings.email.unsubscribeAll")}>
        <p className="text-[13.5px] text-ink">{t(locale, "dashboard.settings.email.unsubscribeAllConfirm")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-paper-deep bg-white px-3.5 py-2 text-[13.5px] font-semibold text-ink">
            {t(locale, "dashboard.settings.email.keep")}
          </button>
          <button type="button" onClick={confirm} disabled={state === "working"} className="rounded-lg border border-ink bg-ink px-3.5 py-2 text-[13.5px] font-semibold text-white disabled:opacity-60">
            {t(locale, "dashboard.settings.email.unsubscribeAllYes")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
