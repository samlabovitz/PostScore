"use client";

// "Counter tools — coming soon" (Reviews page): NFC tap-to-review stands
// and cards, QR table tents, counter signs — tools that make reviewing
// easy and never reward it. Products come from lib/counterTools.ts; until
// it lists any for this plan, there are no links and no prices.

import { IconDeviceMobile, IconLayoutBoardSplit, IconSignRight } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { formatUsd, visibleCounterProducts, type CounterToolProduct } from "@/lib/counterTools";
import type { Plan } from "@/lib/plan";
import { t, useLocale, type MessageKey } from "@/lib/i18n";

const c = (key: string) => `dashboard.websiteReviews.counter.${key}` as MessageKey;

const KINDS = [
  { icon: IconDeviceMobile, title: c("nfc"), body: c("nfcBody") },
  { icon: IconLayoutBoardSplit, title: c("tent"), body: c("tentBody") },
  { icon: IconSignRight, title: c("sign"), body: c("signBody") },
] as const;

export function CounterTools({ plan, products }: { plan: Plan; products?: CounterToolProduct[] }) {
  const locale = useLocale();
  const shop = visibleCounterProducts(plan, products);
  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="counter-tools">
      <div>
        <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, c("heading"))}</h2>
        <p className="mt-0.5 text-[13px] text-ink-soft">{t(locale, c("intro"))}</p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {KINDS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-start gap-2.5 rounded-lg border border-paper-line bg-paper p-3">
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
              <Icon size={16} />
            </span>
            <div>
              <div className="text-[13px] font-semibold text-ink">{t(locale, title)}</div>
              <p className="text-[12.5px] text-ink-soft">{t(locale, body)}</p>
            </div>
          </li>
        ))}
      </ul>

      {shop.length === 0 ? (
        <p className="text-[12.5px] text-ink-mute">{t(locale, c("shopSoon"))}</p>
      ) : (
        <div data-testid="counter-shop">
          <h3 className="mb-2 text-[13px] font-semibold text-ink">{t(locale, c("shopHeading"))}</h3>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {shop.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 rounded-lg border border-paper-line bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt={p.name[locale]} className="h-28 w-full rounded-md object-contain" loading="lazy" />
                <div className="text-[13px] font-semibold text-ink">{p.name[locale]}</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-ink-soft">{formatUsd(p.priceUsd, locale)}</span>
                  <a href={p.url} target="_blank" rel="sponsored noopener noreferrer" className="text-[13px] font-semibold text-ink underline decoration-brass underline-offset-2">
                    {t(locale, c("view"))}
                  </a>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-ink-mute">{t(locale, c("affiliateNote"))}</p>
        </div>
      )}
    </Card>
  );
}
