"use client";

// One small floating pill (bottom-left, every page) to switch this
// browser's plan — Free · Grow · Premium · Multi — via /api/dev/plan, which
// reloads the page. The root layout renders it only when the server allows
// switching (lib/premium.ts canSwitchPlan): always in local development; in
// production only for a signed-in PLAN_SWITCHER_EMAILS user. The route and
// getPlan() check the same thing, so hiding it isn't the protection.
// Collapses to a tiny icon; the collapsed state is kept on this device.

import { useEffect, useState } from "react";
import { IconAdjustmentsHorizontal, IconX } from "@tabler/icons-react";
import { PLANS, type Plan } from "@/lib/plan";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "postscore.devPlanPill.collapsed";
const LABEL: Record<Plan, string> = { free: "Free", grow: "Grow", premium: "Premium", multi: "Multi" };

function switchHref(plan: Plan): string {
  const back = typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/api/dev/plan?plan=${plan}&back=${encodeURIComponent(back)}`;
}

export function DevPlanPill({ plan }: { plan: Plan }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Storage blocked: start expanded.
    }
  }, []);
  function setAndRemember(next: boolean) {
    setCollapsed(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Not remembered — fine.
    }
  }

  if (collapsed)
    return (
      <button
        type="button"
        data-testid="dev-plan-pill"
        data-collapsed="true"
        onClick={() => setAndRemember(false)}
        aria-label="Show the plan switcher"
        title={`Plan: ${LABEL[plan]}`}
        className="fixed bottom-3 left-3 z-[60] flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white/90 shadow-lg"
      >
        <IconAdjustmentsHorizontal size={15} aria-hidden />
      </button>
    );

  return (
    <div data-testid="dev-plan-pill" className="fixed bottom-3 left-3 z-[60] flex items-center gap-1 rounded-full bg-ink py-1 pl-3 pr-1 font-mono text-[11px] text-white/80 shadow-lg">
      <span className="mr-0.5">Plan:</span>
      {PLANS.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={p === plan}
          onClick={() => window.location.assign(switchHref(p))}
          className={cn("rounded-full px-2 py-0.5", p === plan ? "bg-brass font-semibold text-ink" : "hover:bg-white/10 hover:text-white")}
        >
          {LABEL[p]}
        </button>
      ))}
      <button type="button" onClick={() => setAndRemember(true)} aria-label="Hide the plan switcher" className="ml-0.5 rounded-full p-1 hover:bg-white/10">
        <IconX size={12} aria-hidden />
      </button>
    </div>
  );
}
