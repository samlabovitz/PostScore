// The plan facts PostAI sees — read straight from the config behind
// Settings → Plan & billing → "Compare plans" (lib/planComparison.ts:
// PLAN_COPY and COMPARE_ROWS), so PostAI can never describe a plan
// differently from that page. Every feature carries its real status:
// available now, a preview, not included, or coming soon. Pure.

import { COMPARE_PLANS, COMPARE_ROWS, PLAN_COPY, type Cell } from "@/lib/planComparison";
import { t, type Locale } from "@/lib/i18n";
import type { Plan } from "@/lib/plan";

export type FactStatus = "available" | "preview" | "not included" | "coming soon";

export interface PlanFeatureFact {
  feature: string;
  status: FactStatus;
  /** The part of the Compare plans value that's available now ("Unlimited"), or null for a plain ✓. */
  value: string | null;
  /** The part that's coming soon ("auto-post coming soon"), when a value mixes both. */
  soonValue: string | null;
}

export interface PlanFact {
  plan: Plan;
  name: string;
  price: string;
  tagline: string;
  promise: string | null;
  /** The plan card's bullets; `soon` when the bullet says coming soon. */
  bullets: Array<{ text: string; soon: boolean }>;
  features: PlanFeatureFact[];
}

const saysSoon = (text: string) => /coming soon|próximamente/i.test(text);

/** One Compare plans cell. A value that mixes "available" and "coming
 * soon" parts ("Unlimited · auto-post coming soon") is split; a row whose
 * own label says coming soon (PostStudio) is coming soon whatever the
 * value; a value naming PostStudio carries it as coming soon. */
function cellFact(cell: Cell, rowLabel: string, locale: Locale): Omit<PlanFeatureFact, "feature"> {
  const rowSoon = saysSoon(rowLabel);
  switch (cell.kind) {
    case "yes":
      return { status: rowSoon ? "coming soon" : "available", value: null, soonValue: null };
    case "preview":
      return { status: "preview", value: null, soonValue: null };
    case "no":
      return { status: "not included", value: null, soonValue: null };
    case "soon":
      return { status: "coming soon", value: null, soonValue: null };
    case "text": {
      const text = t(locale, cell.key);
      if (rowSoon) return { status: "coming soon", value: null, soonValue: text };
      const parts = text.split(/\s+·\s+/);
      const now = parts.filter((part) => !saysSoon(part) && !/PostStudio/.test(part));
      const later = parts.filter((part) => saysSoon(part) || /PostStudio/.test(part)).map((part) => (/PostStudio/.test(part) && !saysSoon(part) ? `${part} (PostStudio is coming soon)` : part));
      // "Starter + PostStudio discount": the starter site now, the PostStudio part later.
      if (now.length === 0 && later.length === 1 && /^(.+?)\s*\+\s*PostStudio/.test(parts[0])) {
        return { status: "available", value: parts[0].replace(/\s*\+\s*PostStudio.*$/, ""), soonValue: later[0] };
      }
      return { status: now.length > 0 ? "available" : "coming soon", value: now.length > 0 ? now.join(" · ") : null, soonValue: later.length > 0 ? later.join(" · ") : null };
    }
  }
}

export function planFacts(locale: Locale = "en"): PlanFact[] {
  return COMPARE_PLANS.map((plan) => {
    const copy = PLAN_COPY[plan];
    return {
      plan,
      name: t(locale, `dashboard.settings.plan.name.${plan}` as Parameters<typeof t>[1]),
      price: t(locale, copy.price),
      tagline: t(locale, copy.tagline),
      promise: copy.promise ? t(locale, copy.promise) : null,
      bullets: copy.bullets.map((key) => {
        const text = t(locale, key);
        return { text, soon: saysSoon(text) };
      }),
      features: COMPARE_ROWS.map((row) => {
        const feature = t(locale, row.key);
        return { feature, ...cellFact(row.cells[plan], feature, locale) };
      }),
    };
  });
}

const STATUS: Record<FactStatus, string> = { available: "available now", preview: "preview only", "not included": "not included", "coming soon": "COMING SOON" };

/** The plan facts as a prompt section. */
export function planFactsText(locale: Locale = "en"): string {
  const lines = ['PLAN FACTS (from Settings → Plan & billing → "Compare plans" — the only plan details that exist; never add to them):'];
  for (const p of planFacts(locale)) {
    lines.push(`${p.name} — ${p.price} — "${p.tagline}"${p.promise ? ` — ${p.promise}` : ""}`);
    const now = p.features.filter((f) => f.status === "available").map((f) => `${f.feature}${f.value ? ` (${f.value})` : ""}`);
    const preview = p.features.filter((f) => f.status === "preview").map((f) => f.feature);
    const soon = [
      ...p.features.filter((f) => f.soonValue || f.status === "coming soon").map((f) => `${f.feature}${f.soonValue ? ` (${f.soonValue})` : ""}`),
      // Card bullets that are wholly coming soon (a bullet that mixes in
      // something available, e.g. "Unlimited PostAI, and PostStudio … (coming
      // soon)", is already covered by the rows above).
      ...p.bullets.filter((b) => b.soon && !/;|, and |, y /.test(b.text)).map((b) => b.text),
    ];
    lines.push(`  AVAILABLE NOW: ${now.join("; ")}.`);
    if (preview.length > 0) lines.push(`  PREVIEW ONLY: ${preview.join("; ")}.`);
    if (soon.length > 0) lines.push(`  COMING SOON (never a current benefit): ${soon.join("; ")}.`);
    void STATUS;
  }
  // What each paid plan adds over the plan below — available now only (the
  // upgrade answer's benefits come from these lines and nothing else).
  const facts = planFacts(locale);
  for (const [lower, upper] of [["free", "grow"], ["grow", "premium"]] as const) {
    const lo = facts.find((p) => p.plan === lower)!;
    const up = facts.find((p) => p.plan === upper)!;
    const adds = up.features
      .filter((f, i) => {
        const below = lo.features[i];
        if (f.status !== "available") return false;
        if (below.status !== "available") return true;
        // Same thing worded slightly differently ("Starter" / "Starter site") isn't an upgrade.
        const a = (f.value ?? "").toLowerCase();
        const b = (below.value ?? "").toLowerCase();
        return a !== b && !a.startsWith(b) && !b.startsWith(a);
      })
      .map((f) => `${f.feature}${f.value ? ` (${f.value})` : ""}`);
    lines.push(`${up.name.toUpperCase()} ADDS OVER ${lo.name.toUpperCase()} — AVAILABLE NOW (the only benefits to list for ${up.name}): ${adds.join("; ")}.`);
  }
  return lines.join("\n");
}
