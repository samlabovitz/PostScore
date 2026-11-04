// Scoring v1.13.0 dry run — every business scored from its SAVED data
// (the businesses row and its saved website analysis; no Google, PageSpeed
// or page fetches, nothing written). Run once as today (1.12.0) and once
// with the v1.13.0 flag on, then compare:
//
//   npx --no-install tsx --env-file=.env.local scripts/scoring-v113-dry-run.ts --out /tmp/old.json
//   POSTSCORE_SCORING_PREVIEW=1.13.0 npx --no-install tsx --env-file=.env.local scripts/scoring-v113-dry-run.ts --out /tmp/new.json
//   npx --no-install tsx scripts/scoring-v113-dry-run.ts --compare /tmp/old.json /tmp/new.json --report ~/Desktop/scoring-v113-dry-run.md
//
// Saved data predates the new detection, so only what saved rows hold can
// move here: the speed split ("Loads fast" from the saved real-visitor or
// lab result; "Works well on phones" from the saved viewport read) and the
// viewport tag leaving Content depth. Text size / page width from the
// page's own code, phone
// numbers shown as text, broken social icons, broken About links and the
// new call-to-action phrases need a fresh read of each site — they apply
// on each business's next scan.

/* eslint-disable no-console, @typescript-eslint/no-require-imports -- the server-only stub must load before these modules */
const Module = require("module");
const origLoad = Module._load;
Module._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return origLoad.call(this, req, ...rest);
};

import fs from "node:fs";
import os from "node:os";

interface Row {
  id: string;
  name: string;
  total: number;
  grade: string;
  checks: Record<string, { earned: number | null; max: number; explanation: string }>;
}

const argv = process.argv.slice(2);
const arg = (flag: string) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null);
const expand = (p: string) => p.replace(/^~/, os.homedir());

async function score(out: string) {
  const { createAdminClient } = require("../lib/supabase/admin");
  const { scoreBusinessWithClient } = require("../app/actions/scoring");
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("businesses").select("id, name").order("name");
  if (error) throw error;
  const rows: Row[] = [];
  for (const b of data as Array<{ id: string; name: string }>) {
    const r = await scoreBusinessWithClient(supabase, b.id, "en");
    if (r.status !== "ok") continue;
    const breakdown = r.result.breakdown;
    rows.push({
      id: b.id,
      name: b.name,
      total: breakdown.total,
      grade: breakdown.grade,
      checks: Object.fromEntries(
        breakdown.checks.filter((c: { id: string }) => c.id.startsWith("website.")).map((c: { id: string; earnedPoints: number | null; maxPoints: number; explanation: string }) => [c.id, { earned: c.earnedPoints, max: c.maxPoints, explanation: c.explanation }])
      ),
    });
  }
  fs.writeFileSync(expand(out), JSON.stringify(rows, null, 1));
  console.log(`${rows.length} businesses → ${out}`);
}

const NAMES: Record<string, string> = {
  "website.performance_mobile": "speed",
  "website.mobile_friendly": "Works well on phones",
  "website.content_depth": "Content depth",
};

/** One line: what moved, and why the grade did. */
function reason(o: Row, n: Row): string {
  const parts: string[] = [];
  const sp = (c: Row["checks"][string] | undefined) => (!c ? "—" : c.earned === null ? "left out" : `${c.earned}/${c.max}`);
  for (const id of Object.keys(NAMES)) {
    const a = o.checks[id];
    const b = n.checks[id];
    if (sp(a) !== sp(b)) parts.push(`${NAMES[id]} ${sp(a)} → ${sp(b)}`);
  }
  const phones = n.checks["website.mobile_friendly"];
  const why =
    phones && phones.earned === null
      ? "the phone check can't run on this site (it blocks automated checks), so it's left out of Website"
      : n.total > o.total
        ? "a faster-than-Slow speed plus the phone-ready site add up to more than before"
        : n.total < o.total
          ? "speed now earns less (Average 50%, Slow 0%) and/or the missing viewport tag costs its phone point"
          : "no change overall";
  return `${parts.join("; ")} — ${why}.`;
}

function compare(oldPath: string, newPath: string, report: string) {
  const old: Row[] = JSON.parse(fs.readFileSync(expand(oldPath), "utf8"));
  const neu: Row[] = JSON.parse(fs.readFileSync(expand(newPath), "utf8"));
  const byId = new Map(old.map((r) => [r.id, r]));
  const pts = (c: { earned: number | null; max: number } | undefined) => (!c ? "—" : c.earned === null ? "n/a" : `${c.earned}/${c.max}`);
  const lines: string[] = [
    "# Scoring v1.13.0 — dry run",
    "",
    `Generated ${new Date().toISOString()} from saved data only (no Google, PageSpeed or page fetches; nothing saved).`,
    "",
    "What moves here: **Performance & mobile (5)** split into **Loads fast** and **Works well on phones**. Until the fuller phone check (text size, page width, touch targets) has run on a site, phones only checks the viewport tag and is worth **1**, speed **4**; once it has run, **2** and **3**. Speed earns Fast 100% / Average 50% / Slow 0%. Saved rows hold only the viewport read, so every site here is on 1 + 4. The viewport tag no longer counts in **Content depth** (title 1.5 / meta 1.25 / headings 1.5 / text 0.75). Website stays 30.",
    "",
    "What doesn't move yet (needs each site read again — applies on the next scan): text size and page width from the page's own HTML/inline CSS, Google's touch-target audit, phone numbers shown as text (partial contact credit), broken social icons, broken About links / non-About pages under /about/, and the new call-to-action phrases.",
    "",
  ];
  const changed = neu.map((n) => ({ n, o: byId.get(n.id) })).filter((x): x is { n: Row; o: Row } => !!x.o);
  const moved = changed.filter(({ n, o }) => n.total !== o.total || n.grade !== o.grade).sort((a, b) => Math.abs(b.n.total - b.o.total) - Math.abs(a.n.total - a.o.total));
  const gradeChanges = changed.filter(({ n, o }) => n.grade !== o.grade);
  const slow = changed.filter(({ n }) => /^Slow\b/.test(n.checks["website.performance_mobile"]?.explanation ?? "")).sort((a, b) => a.n.name.localeCompare(b.n.name));
  const deltas = changed.map(({ n, o }) => n.total - o.total);
  lines.push(
    "## Summary",
    "",
    `- Businesses: ${changed.length}`,
    `- Score changed: ${moved.length} · grade changed: ${gradeChanges.length}`,
    `- Biggest rise: ${Math.max(0, ...deltas)} · biggest drop: ${Math.min(0, ...deltas)} · average change: ${(deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length)).toFixed(2)}`,
    "",
    "## Slow sites never go up",
    "",
    `Every business whose “Loads fast” reads Slow (${slow.length}): ${slow.filter(({ n, o }) => n.total > o.total).length === 0 ? "none goes up." : "**SOME GO UP — see below.**"}`,
    "",
    "| Business | Old | New | Change | Was: Performance & mobile | Now: Loads fast | Now: Works well on phones |",
    "|---|---:|---:|---:|---|---|---|",
    ...slow.map(({ n, o }) => `| ${n.name.replace(/\|/g, "/")} | ${o.total} | ${n.total} | ${n.total - o.total > 0 ? `+${n.total - o.total}` : n.total - o.total} | ${pts(o.checks["website.performance_mobile"])} | ${pts(n.checks["website.performance_mobile"])} | ${pts(n.checks["website.mobile_friendly"])} |`),
    "",
    "## Grade changes",
    "",
    ...(gradeChanges.length === 0 ? ["None."] : gradeChanges.map(({ n, o }) => `- **${n.name}** ${o.grade} → ${n.grade} (${o.total} → ${n.total}): ${reason(o, n)}`)),
    "",
    "## Every business (old → new)",
    "",
    "| Business | Old | New | Change | Grade | Was: Performance & mobile | Now: Loads fast | Now: Works well on phones | Content depth |",
    "|---|---:|---:|---:|---|---|---|---|---|"
  );
  for (const { n, o } of changed.sort((a, b) => a.n.name.localeCompare(b.n.name))) {
    const d = n.total - o.total;
    lines.push(
      `| ${n.name.replace(/\|/g, "/")} | ${o.total} | ${n.total} | ${d > 0 ? `+${d}` : d} | ${o.grade === n.grade ? n.grade : `${o.grade} → ${n.grade}`} | ${pts(o.checks["website.performance_mobile"])} | ${pts(n.checks["website.performance_mobile"])} | ${pts(n.checks["website.mobile_friendly"])} | ${pts(o.checks["website.content_depth"])} → ${pts(n.checks["website.content_depth"])} |`
    );
  }
  lines.push("", "## What owners would read (a few examples)", "");
  for (const { n } of changed.filter(({ n }) => n.checks["website.performance_mobile"]?.earned != null).slice(0, 8)) {
    lines.push(`- **${n.name}** — Loads fast: ${n.checks["website.performance_mobile"].explanation} · Works well on phones: ${n.checks["website.mobile_friendly"]?.explanation ?? "—"}`);
  }
  fs.writeFileSync(expand(report), `${lines.join("\n")}\n`);
  console.log(`${changed.length} businesses, ${moved.length} changed → ${report}`);
}

(async () => {
  const cmp = argv.indexOf("--compare");
  if (cmp >= 0) return compare(argv[cmp + 1], argv[cmp + 2], arg("--report") ?? "~/Desktop/scoring-v113-dry-run.md");
  const out = arg("--out");
  if (!out) return console.log("Pass --out <file.json>, or --compare old.json new.json --report <file.md>.");
  await score(out);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
