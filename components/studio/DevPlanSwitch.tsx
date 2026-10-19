"use client";

// Local development only: switch this browser's plan to check each tier
// (Free / Grow / Premium / Multi). Pages render it only when
// NODE_ENV === "development"; /api/dev/plan answers 404 in production,
// and lib/premium.ts ignores the cookie there — production stays Free.

import { PLANS, type Plan } from "@/lib/plan";
import { t, useLocale } from "@/lib/i18n";

export function DevPlanSwitch({ plan, backPath }: { plan: Plan; backPath: string }) {
  const locale = useLocale();
  return (
    <div data-testid="dev-plan-switch" className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-ink-mute px-3 py-2 text-[12px] text-ink-soft">
      <span>{t(locale, "dashboard.websiteReviews.devPlan.label")}</span>
      {PLANS.map((p) => (
        <a
          key={p}
          href={`/api/dev/plan?plan=${p}&back=${encodeURIComponent(backPath)}`}
          aria-current={p === plan ? "true" : undefined}
          className={p === plan ? "rounded-full bg-ink px-2 py-0.5 font-semibold text-white" : "rounded-full px-2 py-0.5 underline hover:text-ink"}
        >
          {p.charAt(0).toUpperCase() + p.slice(1)}
        </a>
      ))}
    </div>
  );
}
