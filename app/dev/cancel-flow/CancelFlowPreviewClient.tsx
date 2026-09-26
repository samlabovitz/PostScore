"use client";

import { CancelSubscriptionFlow } from "@/components/settings/CancelSubscriptionFlow";
import { LocaleProvider } from "@/lib/i18n";

// A sample date only, two weeks out — never a real subscription's real
// period end. Never call the real cancelSubscription/
// cancelSubscriptionAction from this preview; onConfirm below just
// resolves so CancelSubscriptionFlow shows its own real success state.
const SAMPLE_PERIOD_END_DATE = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
const SAMPLE_BUSINESS_ID = "preview-business-id";

async function fakeOnConfirm(): Promise<void> {
  // Intentionally a no-op — see the file-level comment above.
}

export function CancelFlowPreviewClient({ isLoggedIn }: { isLoggedIn: boolean }) {
  if (!isLoggedIn) {
    return <p className="text-sm text-ink-soft">Log in to view this preview.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-dashed border-brass/50 bg-brass/5 p-4 text-[13px] text-ink-soft">
        <p className="font-semibold text-ink">Preview only — not a real subscription.</p>
        <p className="mt-1">
          The date shown below (<strong>{new Date(SAMPLE_PERIOD_END_DATE).toDateString()}</strong>) is a sample,
          not a real Stripe period end. Confirming cancellation here only shows the flow&apos;s own success
          message — it never calls the real cancelSubscription action.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute">
            English (en)
          </h2>
          <LocaleProvider locale="en">
            <CancelSubscriptionFlow
              businessId={SAMPLE_BUSINESS_ID}
              periodEndDate={SAMPLE_PERIOD_END_DATE}
              onConfirm={fakeOnConfirm}
              onKeepPlan={() => {}}
            />
          </LocaleProvider>
        </div>
        <div>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute">
            Español (es)
          </h2>
          <LocaleProvider locale="es">
            <CancelSubscriptionFlow
              businessId={SAMPLE_BUSINESS_ID}
              periodEndDate={SAMPLE_PERIOD_END_DATE}
              onConfirm={fakeOnConfirm}
              onKeepPlan={() => {}}
            />
          </LocaleProvider>
        </div>
      </div>
    </div>
  );
}
