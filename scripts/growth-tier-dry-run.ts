// Day 25B step 6 (docs/plans/day25a-spec.md §6.7): the Growth tier dry run.
// Computes every business's tier as of each of the last 12 Mondays — reads
// only, saves nothing, shows nothing in the app — and writes a report to the
// Desktop: the spread per tier, drops and why, neutral weeks and why, the
// test rows each rule removed, and Hair Express week by week (as the dev test
// account, and as if it were a real owner). No billing exists yet, so every
// business is computed as if it were on a paid plan.
//
//   npx --no-install tsx --env-file=.env.local scripts/growth-tier-dry-run.ts [--out=<file>]
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { allowServerOnly } from "./allowServerOnly";

const HAIR_EXPRESS = "e011e16d-9747-4608-ad1a-bd9475f004f6";
setTimeout(() => {
  console.error("timed out");
  process.exit(1);
}, 10 * 60_000);

async function main() {
  allowServerOnly();
  const { loadGrowthFacts, loadInternalAccounts } = await import("../lib/growthTier.server");
  const { addDays, computeTiers, localDate, mondayOf, TIER_NAMES } = await import("../lib/growthTier");
  type MondayTier = import("../lib/growthTier").MondayTier;
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const internal = await loadInternalAccounts(admin);
  const { data: businesses } = await admin.from("businesses").select("id, listing_mode, archived_at").is("archived_at", null);
  const { shownNamesFor } = await import("../lib/ownerDetails.server");
  const ids = (businesses ?? []).filter((b) => b.listing_mode !== "website_only").map((b) => String(b.id));
  const names = await shownNamesFor(admin as never, ids, { live: false } as never).catch(() => new Map());

  const lastMonday = mondayOf(localDate(new Date().toISOString(), "America/New_York"));
  const mondays = Array.from({ length: 12 }, (_, i) => addDays(lastMonday, -7 * (11 - i)));
  // The tier starts at 1 twelve weeks before the first reported Monday, so the windows have history.
  const firstMonday = addDays(mondays[0], -7 * 12);

  type Run = { id: string; name: string; ownerKind: string; tiers: MondayTier[]; removed: Record<string, number> };
  const runs: Run[] = [];
  for (const id of ids) {
    const loaded = await loadGrowthFacts(admin, id, internal);
    if (!loaded) continue;
    const tiers = computeTiers(loaded.facts, firstMonday, lastMonday).filter((t) => mondays.includes(t.monday));
    runs.push({ id, name: (names.get(id) as { name?: string } | undefined)?.name ?? id.slice(0, 8), ownerKind: loaded.ownerKind, tiers, removed: loaded.removed as never });
  }
  // Hair Express both ways: the dev exception on, and as a real owner.
  const heDev = await loadGrowthFacts(admin, HAIR_EXPRESS, internal, { countTestRows: true });
  const heReal = await loadGrowthFacts(admin, HAIR_EXPRESS, internal, { countTestRows: false });

  const L: string[] = [];
  const tierName = (n: number) => `${n} ${TIER_NAMES[n]}`;
  L.push(`# Growth tier dry run`, ``, `Computed ${new Date().toISOString().slice(0, 10)} for ${runs.length} businesses (every active business with a Google listing), as of each of the last 12 Mondays (${mondays[0]} → ${lastMonday}). Reads only: nothing saved, nothing shown. No billing exists yet, so every business is computed as if on a paid plan.`, ``);
  const byKind = (k: string) => runs.filter((r) => r.ownerKind === k).length;
  L.push(`Owners: ${byKind("dev")} businesses of the dev test login (its exception: test rows count, undone changes never), ${byKind("internal")} of other internal accounts (test rows never count), ${byKind("owner")} of real owners.`, ``);

  // Spread per tier on the latest Monday, and over all 12.
  L.push(`## Spread per tier`, ``, `| Tier | On ${lastMonday} | Business-Mondays (all 12) |`, `|---|---:|---:|`);
  for (let t = 1; t <= 5; t++) {
    const now = runs.filter((r) => r.tiers.at(-1)?.tier === t).length;
    const all = runs.reduce((s, r) => s + r.tiers.filter((x) => x.tier === t).length, 0);
    L.push(`| ${tierName(t)} | ${now} | ${all} |`);
  }
  const latest = runs.map((r) => r.tiers.at(-1)?.tier ?? 1);
  const allStart = latest.every((t) => t === 1);
  const allTop = latest.every((t) => t === 5);
  L.push(``, `Pass checks: not everyone at Starting out: **${allStart ? "FAIL" : "pass"}** · not everyone at Local favorite: **${allTop ? "FAIL" : "pass"}** · drops caused by a Google or PostScore failure: **0** (those weeks are neutral by rule; no outage is recorded in our data).`, ``);

  // Drops and why.
  const drops = runs.flatMap((r) => r.tiers.filter((x) => x.change === "down_quiet" || x.change === "down_results").map((x) => ({ r, x })));
  L.push(`## Drops: ${drops.length}`, ``);
  if (drops.length) {
    L.push(`| Business | Monday | To | Why |`, `|---|---|---|---|`);
    for (const { r, x } of drops) L.push(`| ${r.name} | ${x.monday} | ${tierName(x.tier)} | ${x.change === "down_quiet" ? `two quiet weeks (${x.reason.quietWeeks?.join(", ")})` : `results bar missed ${x.reason.missedMondays} Mondays in a row`} |`);
  }
  const ups = runs.reduce((s, r) => s + r.tiers.filter((x) => x.change === "up").length, 0);
  const restored = runs.reduce((s, r) => s + r.tiers.filter((x) => x.change === "restored").length, 0);
  const warnings = runs.reduce((s, r) => s + r.tiers.filter((x) => x.warning).length, 0);
  L.push(``, `Also: ${ups} moves up, ${restored} quick comebacks, ${warnings} one-quiet-week warnings (shown on Growth plan and the Overview line; no notification or email yet).`, ``);

  // Neutral weeks and why.
  const neutral: Record<string, number> = {};
  for (const r of runs) for (const x of r.tiers) if (x.week.neutral) neutral[x.week.neutral] = (neutral[x.week.neutral] ?? 0) + 1;
  L.push(`## Neutral weeks: ${Object.values(neutral).reduce((a, b) => a + b, 0)}`, ``);
  L.push(`| Reason | Weeks |`, `|---|---:|`);
  for (const [k, v] of Object.entries(neutral)) L.push(`| ${k} | ${v} |`);
  L.push(``, `Not checkable in past weeks (left out, never guessed): "nothing to suggest" weeks (past weekly plans aren't saved) and holiday hours closing the whole week (Google data, never saved). The first 2 weeks on a paid plan: no plan history yet.`, ``);

  // Results seen.
  const resultCount = (id: string, status: string) => runs.reduce((s, r) => s + r.tiers.filter((x) => (x.results as Record<string, string>)[id] === status).length, 0);
  L.push(`## Results across all business-Mondays`, ``, `| Result | Met | Not met | Not checked | Can't count yet |`, `|---|---:|---:|---:|---:|`);
  for (const id of ["R1", "R2", "R3", "R4", "R5"]) L.push(`| ${id} | ${resultCount(id, "met")} | ${resultCount(id, "not_met")} | ${resultCount(id, "not_checked")} | ${resultCount(id, "unavailable")} |`);
  L.push(``, `R3 (QR scans) can't count until QR tracking (37-Core): "Counts once QR tracking is on", never failed. R4 (offer uses) is "not checked" until dated +1 logging has 30 days of history (it starts today). R5 waits for Day 37.`, ``);

  // Test rows removed per rule.
  L.push(`## Test rows removed, per rule (rows that would count for a real owner)`, ``, `| Business | Owner | Practice | Internal account | Offer is_test | Undone change |`, `|---|---|---:|---:|---:|---:|`);
  for (const r of runs.filter((x) => Object.values(x.removed).some((n) => n > 0))) L.push(`| ${r.name} | ${r.ownerKind === "dev" ? "dev test login (counted anyway, except undone)" : r.ownerKind} | ${r.removed.practice} | ${r.removed.internal} | ${r.removed.isTest} | ${r.removed.undone} |`);
  L.push(``);

  // Hair Express week by week.
  for (const [label, loaded] of [["as the dev test account (test rows count, undone changes never)", heDev], ["as if it were a real owner (every test row removed)", heReal]] as const) {
    if (!loaded) continue;
    const t = computeTiers(loaded.facts, firstMonday, lastMonday).filter((x) => mondays.includes(x.monday));
    L.push(`## Hair Express, ${label}`, ``, `| Monday | Week of | Verified | You told us | Week | Tier | Change | R1 | R2 | R4 |`, `|---|---|---:|---:|---|---|---|---|---|---|`);
    for (const x of t) {
      const wk = x.week.active ? "active" : x.week.neutral ? `neutral (${x.week.neutral})` : "quiet";
      L.push(`| ${x.monday} | ${x.week.weekStart} | ${x.week.verified} | ${x.week.told} | ${wk} | ${tierName(x.tier)}${x.warning ? " ⚠ warning" : ""} | ${x.change} | ${x.results.R1} | ${x.results.R2} | ${x.results.R4} |`);
    }
    L.push(``);
  }

  // Every business on the latest Monday.
  L.push(`## Every business on ${lastMonday}`, ``, `| Business | Owner | Tier | Active weeks (last 12) |`, `|---|---|---|---:|`);
  for (const r of [...runs].sort((a, b) => (b.tiers.at(-1)?.tier ?? 0) - (a.tiers.at(-1)?.tier ?? 0))) {
    L.push(`| ${r.name} | ${r.ownerKind} | ${tierName(r.tiers.at(-1)?.tier ?? 1)} | ${r.tiers.filter((x) => x.week.active).length} |`);
  }

  const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? path.join(homedir(), "Desktop", "growth-tier-dry-run.md");
  writeFileSync(out, L.join("\n") + "\n");
  console.log(`wrote ${out}: ${runs.length} businesses, latest spread ${[1, 2, 3, 4, 5].map((t) => latest.filter((x) => x === t).length).join("/")}, ${drops.length} drops`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
