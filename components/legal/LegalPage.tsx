// The public /terms and /refund-policy pages: plain, readable, EN + ES
// (?lang=es), no login needed.

import Link from "next/link";
import { legalHref, type PolicyLocale } from "@/lib/legal/policies";
import { BackLink } from "./BackLink";
import { backLabel } from "@/lib/backLink";

interface Section {
  readonly heading: string;
  readonly body: readonly string[];
  readonly link?: "refund";
}

export function LegalPage({ locale, title, updated, intro, sections }: { locale: PolicyLocale; title: string; updated: string; intro?: string; sections: readonly Section[] }) {
  const other = locale === "es" ? "en" : "es";
  return (
    <main className="min-h-screen bg-paper px-4 py-6 sm:py-10">
      <div className="mx-auto mb-3 max-w-2xl">
        <BackLink label={backLabel(locale)} />
      </div>
      <article className="mx-auto max-w-2xl rounded-2xl border border-paper-deep bg-white p-6 shadow-card sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-ink sm:text-[28px]">{title}</h1>
            <p className="mt-1 text-[12.5px] text-ink-mute">{updated}</p>
          </div>
          <Link href={`?lang=${other}`} className="shrink-0 text-[12.5px] font-medium text-ink-soft underline hover:text-ink">
            {other === "es" ? "Español" : "English"}
          </Link>
        </div>
        {intro && <p className="mt-5 rounded-xl bg-paper p-4 text-[14px] leading-relaxed text-ink">{intro}</p>}
        <div className="mt-6 flex flex-col gap-5">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-[15px] font-semibold text-ink">{s.heading}</h2>
              {s.body.map((p) => (
                <p key={p} className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
                  {p}
                </p>
              ))}
              {s.link === "refund" && (
                <Link href={legalHref("refund", locale)} className="mt-1.5 inline-block text-[14px] font-medium text-ink underline decoration-brass underline-offset-2">
                  {locale === "es" ? "Política de reembolsos y cancelación →" : "Refund & cancellation policy →"}
                </Link>
              )}
            </section>
          ))}
        </div>
        <LegalLinks locale={locale} className="mt-8 border-t border-paper-line pt-4" />
      </article>
    </main>
  );
}

/** "Terms · Refund policy" — the footer and Settings link here. */
export function LegalLinks({ locale, className }: { locale: PolicyLocale; className?: string }) {
  return (
    <nav aria-label={locale === "es" ? "Legal" : "Legal"} className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-mute ${className ?? ""}`}>
      <Link href={legalHref("terms", locale)} className="hover:text-ink hover:underline">
        {locale === "es" ? "Términos" : "Terms"}
      </Link>
      <span aria-hidden>·</span>
      <Link href={legalHref("refund", locale)} className="hover:text-ink hover:underline">
        {locale === "es" ? "Política de reembolsos" : "Refund policy"}
      </Link>
    </nav>
  );
}
