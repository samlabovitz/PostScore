"use client";

// Settings page pieces: the section nav (left on desktop, tabs on
// phones), section cards, the save toast, the plan card, the
// cancel-at-period-end confirm, and "Unsubscribe from all emails". Every
// button here does something real — or isn't shown.

import { useEffect, useState, type ReactNode } from "react";
import { IconBell, IconBuildingStore, IconCheck, IconCreditCard, IconCrown, IconTag, IconUser, IconUserCircle, type Icon } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { unsubscribeFromAllEmails } from "@/app/actions/businesses";
import { SAVED_EVENT } from "@/lib/savedEvent";
import type { Plan } from "@/lib/plan";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { COMPARE_PLANS, COMPARE_ROWS, HIGHLIGHT_PLAN, PLAN_COPY, type Cell } from "@/lib/planComparison";
import { PostStudioBullets, PostStudioOptions } from "@/components/studio/PostStudioOptions";

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

/** The current plan's promise and what it includes, then "Compare plans":
 * a card per plan (Premium marked "Best value", the owner's own plan
 * labeled) and the comparison table — four columns on wider screens; on a
 * phone the cards stack with the current plan first and each carries its
 * own rows. #compare-plans opens it (every "See plans" link lands here).
 * Copy comes from lib/planComparison.ts. */
export function PlanCard({ plan }: { plan: Plan }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const sync = () => {
      if (window.location.hash !== "#compare-plans") return;
      setOpen(true);
      requestAnimationFrame(() => document.getElementById("compare-plans")?.scrollIntoView({ block: "start" }));
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const copy = PLAN_COPY[plan];
  return (
    <div data-testid="plan-card" className="flex flex-col gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_6%,white)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-soft">{t(locale, "dashboard.settings.plan.current")}</span>
        <span className="rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-semibold text-white">{t(locale, `dashboard.settings.plan.name.${plan}` as MessageKey)}</span>
        <span className="text-[12.5px] font-medium text-brass">{t(locale, copy.tagline)}</span>
      </div>
      {copy.promise && <p className="text-[13.5px] font-medium text-ink">{t(locale, copy.promise)}</p>}
      <ul className="flex flex-col gap-1.5" data-testid="plan-summary">
        {copy.bullets.map((k) => (
          <li key={k} className="flex items-start gap-2 text-[13px] text-ink">
            <IconCheck size={15} aria-hidden className="mt-0.5 shrink-0 text-green" />
            {t(locale, k)}
          </li>
        ))}
      </ul>
      <details
        id="compare-plans"
        open={open}
        onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
        className="scroll-mt-20 rounded-lg border border-paper-deep bg-white"
        data-testid="plan-compare"
      >
        <summary className="cursor-pointer list-none px-3 py-2 text-[13px] font-semibold text-ink [&::-webkit-details-marker]:hidden">{t(locale, "dashboard.settings.plans.heading")} ▾</summary>
        <div className="grid grid-cols-1 gap-3 border-t border-paper-line p-3 sm:grid-cols-2 xl:grid-cols-4">
          {COMPARE_PLANS.map((p) => (
            <PlanColumn key={p} plan={p} current={p === plan} />
          ))}
        </div>
        <PostStudioSection plan={plan} />
        {/* Wider screens: one table, four plan columns, Premium highlighted. */}
        <div className="hidden border-t border-paper-line md:block">
          <table className="w-full table-fixed border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className="w-[30%] p-2.5 text-left" scope="col">
                  <span className="sr-only">{t(locale, "dashboard.settings.plans.heading")}</span>
                </th>
                {COMPARE_PLANS.map((p) => (
                  <th
                    key={p}
                    scope="col"
                    data-current={p === plan || undefined}
                    data-highlight={p === HIGHLIGHT_PLAN || undefined}
                    className={cn("p-2.5 text-left align-top font-normal", p === HIGHLIGHT_PLAN && HIGHLIGHT_BG)}
                  >
                    <div className="text-[13.5px] font-semibold text-ink">{t(locale, `dashboard.settings.plan.name.${p}` as MessageKey)}</div>
                    <div className="text-[12px] text-ink-soft">{t(locale, PLAN_COPY[p].price)}</div>
                    {p === plan && <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-brass">{t(locale, "dashboard.settings.plans.current")}</div>}
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
                    <td key={p} className={cn("p-2.5 align-top", p === HIGHLIGHT_PLAN && HIGHLIGHT_BG)}>
                      <PlanCell cell={r.cells[p]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Under the four plan cards: PostStudio, its own option — what it is,
 * the ways to get it ($30 alone · Grow +$15 · Premium +$8 · in Multi),
 * and "Coming soon". Nothing here can be bought. */
function PostStudioSection({ plan }: { plan: Plan }) {
  const locale = useLocale();
  return (
    <section data-testid="plan-poststudio" className="flex flex-col gap-3 border-t border-paper-line p-3">
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-semibold text-ink">{t(locale, "dashboard.postStudioPlans.title")}</h3>
          <span className="rounded-full border border-paper-deep bg-paper px-2 py-0.5 text-[10.5px] font-semibold text-ink-soft">{t(locale, "dashboard.common.comingSoon")}</span>
        </div>
        <p className="text-[12.5px] text-ink-soft">{t(locale, "dashboard.postStudioPlans.sub")}</p>
      </div>
      <PostStudioBullets />
      <PostStudioOptions plan={plan} />
      <p className="text-[11.5px] text-ink-mute">{t(locale, "dashboard.postStudioPlans.footer")}</p>
    </section>
  );
}

const HIGHLIGHT_BG = "bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)]";

/** One plan's card in "Compare plans". On a phone the owner's plan comes
 * first (order-first) and the card lists the comparison rows itself. */
function PlanColumn({ plan, current }: { plan: Plan; current: boolean }) {
  const locale = useLocale();
  const copy = PLAN_COPY[plan];
  const best = plan === HIGHLIGHT_PLAN;
  return (
    <div
      data-plan={plan}
      data-current={current || undefined}
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        current && "order-first sm:order-none",
        best ? cn("border-brass", HIGHLIGHT_BG) : "border-paper-deep bg-white"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[14px] font-semibold text-ink">{t(locale, `dashboard.settings.plan.name.${plan}` as MessageKey)}</span>
          <span className="text-[12.5px] text-ink-soft">{t(locale, copy.price)}</span>
        </div>
        {best && (
          <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-semibold text-white" data-testid="best-value">
            <IconCrown size={11} aria-hidden className="text-brass" />
            {t(locale, "dashboard.settings.plans.bestValue")}
          </span>
        )}
      </div>
      <div className="text-[12px] font-semibold text-brass">{t(locale, copy.tagline)}</div>
      {current && <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{t(locale, "dashboard.settings.plans.current")}</div>}
      {copy.promise && <p className="text-[12.5px] font-medium text-ink">{t(locale, copy.promise)}</p>}
      <ul className="flex flex-col gap-1">
        {copy.bullets.map((k) => (
          <li key={k} className="flex items-start gap-1.5 text-[12.5px] text-ink">
            <IconCheck size={13} aria-hidden className="mt-0.5 shrink-0 text-green" />
            {t(locale, k)}
          </li>
        ))}
      </ul>
      {/* Phones: this plan's comparison rows (the table takes over from md). */}
      <ul className="mt-1 flex flex-col gap-1.5 border-t border-paper-line pt-2 md:hidden">
        {COMPARE_ROWS.map((r) => (
          <li key={r.key} className="flex items-start justify-between gap-3 text-[12px]">
            <span className="text-ink-soft">{t(locale, r.key)}</span>
            <span className="shrink-0 text-right">
              <PlanCell cell={r.cells[plan]} />
            </span>
          </li>
        ))}
      </ul>
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
  if (cell.kind === "soon")
    return (
      <span className="inline-flex flex-wrap items-center gap-1 text-green">
        <IconCheck size={16} aria-hidden />
        <span className="rounded-full border border-paper-deep bg-paper px-1.5 text-[11px] font-semibold text-ink-soft">{t(locale, "dashboard.settings.plans.cell.soon")}</span>
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
  return (
    <span className={cn("font-medium text-ink", cell.check && "inline-flex items-center gap-1")}>
      {cell.check && <IconCheck size={16} aria-hidden className="shrink-0 text-green" />}
      {t(locale, cell.key)}
    </span>
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

/** Settings → Email on Free: no monthly report toggle (Free gets no report
 * emails — lib/plan.ts planIncludesMonthlyReports), just where they come
 * from, linking to Compare plans. */
export function MonthlyEmailFreeNote({ businessId }: { businessId: string }) {
  const locale = useLocale();
  return (
    <Card data-testid="monthly-email-free" className="p-5">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">{t(locale, "dashboard.settings.monthlyEmailHeading")}</div>
      <p className="mt-1 text-sm text-ink-soft">
        {t(locale, "dashboard.settings.email.freeNote")}{" "}
        <a href={`/business/${businessId}/settings#compare-plans`} className="font-semibold text-ink underline-offset-2 hover:underline">
          {t(locale, "dashboard.upgrade.box.seePlans")}
        </a>
      </p>
    </Card>
  );
}

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
