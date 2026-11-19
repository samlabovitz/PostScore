// Day 23 2d-4 proof: the 10 businesses' scores, category points and every
// check's points, recorded before and after the change and compared check
// by check (the 2d-4 live check, removed in 2d-5). Fails loudly on an empty or
// partial snapshot. Pure.

export const DAY23_2D4_IDS = [
  "e011e16d-9747-4608-ad1a-bd9475f004f6", // Hair express on Broadway (connected)
  "b53eae12-ee1e-4eb7-85af-6471598ea266", // Centered Clay Studio
  "50fe5437-f043-4fde-9b46-e57470358917", // New Karma Salon (no website)
  "d27760e1-436d-413c-a6cf-cb8e1eb907ba", // Hudson Shears (no website)
  "a4e384bf-d4c2-4296-a3c1-1f9d22bda5b9", // Endless Nails (no website)
  "327bbd49-e439-45de-a04a-7afc5703c483", // Bánh Mì Boy (no website on the listing)
  "736d9bb7-b165-4c79-8a01-9c58771241ce", // The Taco Project
  "91e1694d-47c1-43be-982d-aea3a98c961b", // Law Office of Dana Stricker
  "480e109e-353e-436a-9f1d-d8db5fd8694b", // Westchester Wine Warehouse
  "08c9634b-762e-4436-a84c-659d1386b6a0", // JT's Sports Bar & Grill
];

export const EXPECTED_CHECKS = 26;

export interface CheckPoints {
  earned: number | null;
  max: number;
  confidence: string;
}

export interface ScoreSnapshot {
  total: number;
  grade: string;
  version: string | null;
  categories: Array<{ id: string; earned: number; possible: number }>;
  checks: Record<string, CheckPoints>;
}

interface RawBreakdown {
  checks?: Array<{ id: string; earnedPoints?: unknown; maxPoints?: unknown; confidence?: unknown }>;
  categories?: Array<{ id: string; earnedPoints?: unknown; possiblePoints?: unknown }>;
}

/** A scan's points as recorded for the proof (saved breakdown_json or a breakdown built now). */
export function snapshotOf(breakdown: unknown, total: number, grade: string, version: string | null): ScoreSnapshot {
  const b = (breakdown ?? {}) as RawBreakdown;
  return {
    total,
    grade,
    version,
    categories: (b.categories ?? []).map((c) => ({ id: c.id, earned: c.earnedPoints as number, possible: c.possiblePoints as number })),
    checks: Object.fromEntries((b.checks ?? []).map((c) => [c.id, { earned: (c.earnedPoints ?? null) as number | null, max: c.maxPoints as number, confidence: c.confidence as string }])),
  };
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Everything missing from a set of snapshots; empty = complete. */
export function snapshotProblems(rows: Array<ScoreSnapshot & { name: string }>): string[] {
  const out: string[] = [];
  if (rows.length !== DAY23_2D4_IDS.length) out.push(`${rows.length} businesses, expected ${DAY23_2D4_IDS.length}`);
  for (const r of rows) {
    if (!num(r.total) || typeof r.grade !== "string" || !r.grade) out.push(`${r.name}: no total/grade`);
    const checks = Object.entries(r.checks);
    if (checks.length < EXPECTED_CHECKS) out.push(`${r.name}: ${checks.length} checks, expected ${EXPECTED_CHECKS}`);
    for (const [id, c] of checks) {
      if (!num(c.max)) out.push(`${r.name}: check ${id} has no max points`);
      if (c.earned === null ? typeof c.confidence !== "string" || !c.confidence : !num(c.earned)) out.push(`${r.name}: check ${id} has no points`);
    }
    if (r.categories.length === 0) out.push(`${r.name}: no categories`);
    for (const c of r.categories) if (!num(c.earned) || !num(c.possible)) out.push(`${r.name}: category ${c.id} has no points`);
  }
  return out;
}

/** Every difference between two snapshots of one business: total, grade, version, each category and each check. */
export function snapshotDiff(before: ScoreSnapshot, after: ScoreSnapshot): string[] {
  const out: string[] = [];
  if (before.total !== after.total) out.push(`total ${before.total} → ${after.total}`);
  if (before.grade !== after.grade) out.push(`grade ${before.grade} → ${after.grade}`);
  if (before.version !== after.version) out.push(`version ${before.version} → ${after.version}`);
  const cats = new Map(after.categories.map((c) => [c.id, c]));
  for (const c of before.categories) {
    const a = cats.get(c.id);
    if (!a) out.push(`category ${c.id} missing`);
    else if (a.earned !== c.earned || a.possible !== c.possible) out.push(`category ${c.id} ${c.earned}/${c.possible} → ${a.earned}/${a.possible}`);
  }
  const ids = Array.from(new Set(Object.keys(before.checks).concat(Object.keys(after.checks))));
  for (const id of ids) {
    const b = before.checks[id];
    const a = after.checks[id];
    if (!b || !a) out.push(`check ${id} ${b ? "missing after" : "new after"}`);
    else if (b.earned !== a.earned || b.max !== a.max || b.confidence !== a.confidence) out.push(`check ${id} ${b.earned}/${b.max} ${b.confidence} → ${a.earned}/${a.max} ${a.confidence}`);
  }
  return out;
}
