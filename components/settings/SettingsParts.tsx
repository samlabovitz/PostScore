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
import { COMPARE_PLANS, COMPARE_ROWS, PLAN_HEADER, PLAN_SUMMARY, type Cell } from "@/lib/planComparison";

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

/** The current plan's summary, then "Compare plans": four columns (Free ·
 * Grow · Premium · Multi) with the current plan highlighted, stacking into
 * one card per plan on a phone. Rows come from lib/planComparison.ts. */
export function PlanCard({ plan }: { plan: Plan }) {
  const locale = useLocale();
  const header = (p: Plan) => (
    <>
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-[14px] font-semibold text-ink">{t(locale, `dashboard.settings.plan.name.${p}` as MessageKey)}</span>
        <span className="text-[12.5px] text-ink-soft">{t(locale, PLAN_HEADER[p].price)}</span>
      </div>
      <div className="text-[12px] font-medium text-brass">{t(locale, PLAN_HEADER[p].tagline)}</div>
    </>
  );
  const hl = "bg-[color:color-mix(in_srgb,var(--color-brass)_12%,white)]";
  return (
    <div data-testid="plan-card" className="flex flex-col gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_6%,white)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-soft">{t(locale, "dashboard.settings.plan.current")}</span>
        <span className="rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-semibold text-white">{t(locale, `dashboard.settings.plan.name.${plan}` as MessageKey)}</span>
        <span className="text-[12.5px] font-medium text-brass">{t(locale, PLAN_HEADER[plan].tagline)}</span>
      </div>
      <ul className="flex flex-col gap-1.5" data-testid="plan-summary">
        {PLAN_SUMMARY[plan].map((k) => (
          <li key={k} className="flex items-start gap-2 text-[13px] text-ink">
            <IconCheck size={15} aria-hidden className="mt-0.5 shrink-0 text-green" />
            {t(locale, k)}
          </li>
        ))}
      </ul>
      <details className="rounded-lg border border-paper-deep bg-white" data-testid="plan-compare">
        <summary className="cursor-pointer list-none px-3 py-2 text-[13px] font-semibold text-ink [&::-webkit-details-marker]:hidden">{t(locale, "dashboard.settings.plans.heading")} ▾</summary>
        {/* Wide screens: one table, the current plan's column highlighted. */}
        <div className="hidden border-t border-paper-line md:block">
          <table className="w-full table-fixed border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className="w-[32%] p-2.5 text-left" scope="col">
                  <span className="sr-only">{t(locale, "dashboard.settings.plans.heading")}</span>
                </th>
                {COMPARE_PLANS.map((p) => (
                  <th key={p} scope="col" data-current={p === plan || undefined} className={cn("p-2.5 text-left align-top font-normal", p === plan && hl)}>
                    {header(p)}
                    {p === plan && <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{t(locale, "dashboard.settings.plans.current")}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((r) => (
                <tr key={r.key} className="border-t border-paper-line">
                  <th scope="row" className="p-2.5 text-left font-normal text-ink">
                    {t(locale, r.key)}
                  </th>
                  {COMPARE_PLANS.map((p) => (
                    <td key={p} className={cn("p-2.5 align-top", p === plan && hl)}>
                      <PlanCell cell={r.cells[p]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Phones: one card per plan, the current plan first. */}
        <div className="flex flex-col gap-3 border-t border-paper-line p-3 md:hidden">
          {[plan, ...COMPARE_PLANS.filter((p) => p !== plan)].map((p) => (
            <div key={p} className={cn("rounded-lg border p-3", p === plan ? "border-brass bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)]" : "border-paper-deep")}>
              {header(p)}
              {p === plan && <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{t(locale, "dashboard.settings.plans.current")}</div>}
              <ul className="mt-2 flex flex-col gap-1.5">
                {COMPARE_ROWS.map((r) => (
                  <li key={r.key} className="flex items-start justify-between gap-3 text-[12.5px]">
                    <span className="text-ink">{t(locale, r.key)}</span>
                    <span className="shrink-0 text-right">
                      <PlanCell cell={r.cells[p]} />
                    </span>
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

function PlanCell({ cell }: { cell: Cell }) {
  const locale = useLocale();
  if (cell.kind === "yes")
    return (
      <span className="inline-flex items-center text-green">
        <IconCheck size={16} aria-hidden />
        <span className="sr-only">{t(locale, "dashboard.settings.plans.cell.yes")}</span>
      </span>
    );
  if (cell.kind === "preview") return <span className="font-medium text-ink-soft">{t(locale, "dashboard.settings.plans.cell.preview")}</span>;
  if (cell.kind === "no")
    return (
      <span className="text-ink-mute">
        <span aria-hidden>—</span>
        <span className="sr-only">{t(locale, "dashboard.settings.plans.cell.no")}</span>
      </span>
    );
  return <span className="font-medium text-ink">{t(locale, cell.key)}</span>;
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
