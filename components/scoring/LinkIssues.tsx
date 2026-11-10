"use client";

// Scoring 1.15.0 "No broken links or dead pages": "X links need fixing —
// see them" opens the list — a centred box on a computer, a bottom sheet
// on a phone. Each link: what it is, where it points, what happened, how
// to fix it, "Copy link"; order / book / contact links carry "Urgent".

import { useCallback, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { t, tPlural, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { URGENT_LINK_KINDS, type LinkProblem } from "@/lib/linkProblems";
import type { CheckResult } from "@/lib/scoring";

/** The check's saved problems (meta.linkProblems), or [] when unreadable. */
export function linkProblemsOf(check: Pick<CheckResult, "id" | "meta">): LinkProblem[] {
  if (check.id !== "website.links" || !check.meta?.linkProblems) return [];
  try {
    const parsed = JSON.parse(check.meta.linkProblems);
    return Array.isArray(parsed) ? (parsed as LinkProblem[]).filter((p) => p && typeof p.url === "string" && typeof p.problem === "string") : [];
  } catch {
    return [];
  }
}

export function linkWhat(p: LinkProblem, locale: Locale): string {
  return t(locale, `dashboard.links.kind.${p.kind}` as MessageKey, { label: p.label || p.url });
}

export function linkWhatHappened(p: LinkProblem, locale: Locale): string {
  const platform = p.platform ?? p.label;
  if (p.problem === "loops_home" && p.kind === "social") return t(locale, "dashboard.links.problem.loops_home_social", { platform });
  return t(locale, `dashboard.links.problem.${p.problem}` as MessageKey, { status: p.status ?? "", platform });
}

export function linkFix(p: LinkProblem, locale: Locale): string {
  if (p.kind === "social") return t(locale, "dashboard.links.fix.social", { platform: p.platform ?? p.label });
  if (p.kind === "order" || p.kind === "book" || p.kind === "contact") return t(locale, `dashboard.links.fix.${p.kind}` as MessageKey);
  return t(locale, "dashboard.links.fix.page");
}

export function LinkIssues({ check, className }: { check: Pick<CheckResult, "id" | "meta">; className?: string }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const problems = linkProblemsOf(check);
  if (problems.length === 0) return null;
  // Urgent ones first.
  const ordered = [...problems].sort((a, b) => Number(URGENT_LINK_KINDS.includes(b.kind)) - Number(URGENT_LINK_KINDS.includes(a.kind)));
  return (
    <>
      <button
        type="button"
        data-testid="link-issues-open"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={className ?? "text-[12.5px] font-semibold text-ink underline-offset-2 hover:text-brass hover:underline"}
      >
        {tPlural(locale, "dashboard.links.open", problems.length, { count: problems.length })}
      </button>
      <Modal open={open} onClose={close} title={t(locale, "dashboard.links.title")} sheet>
        <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.links.intro")}</p>
        <ul data-testid="link-issues-list" className="mt-3 divide-y divide-paper-line">
          {ordered.map((p, i) => (
            <LinkIssueRow key={`${p.url}-${i}`} problem={p} locale={locale} />
          ))}
        </ul>
      </Modal>
    </>
  );
}

function LinkIssueRow({ problem: p, locale }: { problem: LinkProblem; locale: Locale }) {
  const [copied, setCopied] = useState(false);
  const urgent = URGENT_LINK_KINDS.includes(p.kind);
  async function copy() {
    try {
      await navigator.clipboard.writeText(p.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard (an old browser): the address is on screen to select.
    }
  }
  return (
    <li data-testid="link-issue" className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13.5px] font-semibold text-ink">{linkWhat(p, locale)}</span>
        {urgent && (
          <span data-testid="link-issue-urgent" className="rounded-full bg-red/10 px-2 py-px text-[11px] font-semibold uppercase tracking-wide text-red">
            {t(locale, "dashboard.links.urgent")}
          </span>
        )}
      </div>
      {p.url && (
        <p className="mt-1 break-all text-[12.5px] text-ink-mute">
          {t(locale, "dashboard.links.pointsTo")}: <span className="text-ink-soft">{p.url}</span>
        </p>
      )}
      <p className="mt-1 text-[13px] text-ink">{linkWhatHappened(p, locale)}</p>
      <p className="mt-1 text-[12.5px] text-ink-soft">{linkFix(p, locale)}</p>
      {p.url && (
        <button
          type="button"
          onClick={copy}
          className="mt-1.5 rounded-md border border-paper-deep px-2 py-0.5 text-[12px] font-medium text-ink-soft hover:bg-paper hover:text-ink"
        >
          <span aria-live="polite">{copied ? t(locale, "dashboard.links.copied") : t(locale, "dashboard.links.copy")}</span>
        </button>
      )}
    </li>
  );
}
