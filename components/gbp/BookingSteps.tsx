"use client";

// "Turn on Google booking" (case B in lib/bookingPartners.ts): the owner's
// own Book online link goes to a booking partner whose "Reserve with
// Google" isn't on, so Google counts 0 bookings. Fixed steps per partner
// (Square's own; a generic line for the rest), and "I turned it on", which
// hides the reminder for 14 days. Plus the one-time task card in the Growth
// recap. Never shown for a partner-added link (case A: already connected).

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { snoozeBookingReminder } from "@/app/actions/bookingReminder";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const K = (key: string) => `dashboard.booking.${key}` as MessageKey;

export function BookingStepsPanel({ businessId, provider, partnerId, still = false }: { businessId: string; provider: string; partnerId: string | null; still?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function turnedOn() {
    setBusy(true);
    const r = await snoozeBookingReminder(businessId).catch(() => ({ ok: false }));
    setBusy(false);
    if (r.ok) {
      setDone(true);
      router.refresh();
    }
  }
  return (
    <div className="flex flex-col gap-2 text-[13px] text-ink" data-testid="booking-steps">
      {still && <p className="font-semibold text-amber">{t(locale, K("still"))}</p>}
      {partnerId === "square" ? (
        <>
          <ol className="list-decimal space-y-1 pl-5">
            {[1, 2, 3, 4].map((n) => (
              <li key={n}>{t(locale, K(`square.${n}`))}</li>
            ))}
          </ol>
          <p className="text-[12px] text-ink-mute">{t(locale, K("square.note"))}</p>
        </>
      ) : (
        <p>{t(locale, K("generic"), { partner: provider })}</p>
      )}
      {done ? (
        <p role="status" className="text-[12.5px] text-green">
          {t(locale, K("snoozed"))}
        </p>
      ) : (
        <button type="button" disabled={busy} onClick={turnedOn} data-testid="booking-turned-on" className="inline-flex h-[30px] w-fit items-center rounded-lg border border-ink bg-ink px-3 text-[12.5px] font-semibold text-paper disabled:opacity-60">
          {t(locale, K("turnedOn"))}
        </button>
      )}
    </div>
  );
}

/** The Growth recap's one-time task (not a weekly one): shown until the status changes. */
export function BookingTaskCard({ businessId, provider, still }: { businessId: string; provider: string; still: boolean }) {
  const locale = useLocale();
  return (
    <div data-testid="booking-task" className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--color-amber)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_8%,white)] px-4 py-3")}>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-ink">{t(locale, K("taskTitle"), { partner: provider })}</p>
        <p className="text-[12.5px] text-ink-soft">{still ? t(locale, K("still")) : t(locale, K("taskBody"), { partner: provider })}</p>
      </div>
      <Link href={`/business/${businessId}/growth?tab=google#edit-booking-steps`} className="inline-flex h-[30px] items-center rounded-lg border border-ink bg-ink px-3 text-[12.5px] font-semibold text-paper">
        {t(locale, K("taskButton"))}
      </Link>
    </div>
  );
}
