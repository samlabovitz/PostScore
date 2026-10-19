// Writes every website fix guide (lib/websiteBuilderGuides.ts) to a
// Markdown file for review: each builder × task with its steps (EN + ES),
// limitation, official article and last-verified date, which builder ×
// task pairs fall back to the generic guide, and the generic "ask your
// web person" text per check. Read-only; no network.
//
//   npx tsx scripts/write-builder-guides-review.ts [output.md]

import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BUILDER_GUIDES, GUIDES_VERIFIED_AT, webPersonAsk, webPersonMessage, type GuideTask } from "../lib/websiteBuilderGuides";
import { WEBSITE_BUILDER_NAMES, type WebsiteBuilderId } from "../lib/websiteBuilder";

const TASKS: Array<[GuideTask, string, string]> = [
  ["ssl", "HTTPS / SSL", "website.https"],
  ["seo_meta", "Page title & meta description", "website.content_depth (title, meta)"],
  ["add_page", "Add an About / Services page", "website.about_presence, website.services_presence"],
  ["phone_link", "Tap-to-call phone / call button", "website.contact_conversion"],
  ["social_links", "Social media links", "website.social_links"],
  ["speed", "Mobile speed", "website.performance_mobile"],
  ["edit_text", "Edit page text (info, notices, freshness, thin content)", "website.info_consistency, notice_freshness, site_freshness, content_depth (headings, thin)"],
];

const GENERIC: Array<[string, string | null]> = [
  ["website.https", null],
  ["website.performance_mobile", null],
  ["website.content_depth", "title"],
  ["website.content_depth", "meta"],
  ["website.content_depth", "headings"],
  ["website.content_depth", "thin"],
  ["website.content_depth", "viewport"],
  ["website.contact_conversion", "contact"],
  ["website.contact_conversion", "cta"],
  ["website.about_presence", null],
  ["website.services_presence", null],
  ["website.social_links", null],
  ["website.security", null],
  ["website.info_consistency", null],
  ["website.notice_freshness", null],
  ["website.site_freshness", null],
];

const builders = Object.keys(WEBSITE_BUILDER_NAMES) as WebsiteBuilderId[];
const out: string[] = [];
const count = builders.reduce((n, b) => n + Object.keys(BUILDER_GUIDES[b] ?? {}).length, 0);

out.push("# Website fix guides — review");
out.push("");
out.push(`Last verified: ${GUIDES_VERIFIED_AT}. ${count} builder guides; every other builder × task uses the generic guide.`);
out.push("");
out.push("**How they were sourced:** each builder guide follows that builder's own help article (linked). Where no official article was found, there is no builder guide — the page shows the generic “Ask your web person to…” guide with a copyable message instead of guessing at menus.");
out.push("");
out.push("**Please spot-check (sources weaker than a help-center article):**");
out.push("- GoDaddy → Page title & description: from GoDaddy's own site (resources/blog), not its Help Center. Menu name “Get found on Google”.");
out.push("- Squarespace → page title & description: the help article covers the SEO fields; the “gear icon → SEO tab” path is the standard page-settings route.");
out.push("- Google Sites → title & description: written as a limitation (no such setting). Google's help has no setting for it; there's no page that states it outright.");
out.push("- Webflow → SEO: Webflow University (official), not the help center.");
out.push("- Square Online: only “Social links” had an official article (UK help page). Weebly: no official articles found → generic for all.");
out.push("");

out.push("## Coverage (✓ builder guide · — generic guide)");
out.push("");
out.push(`| Task | ${builders.map((b) => WEBSITE_BUILDER_NAMES[b]).join(" | ")} |`);
out.push(`|---|${builders.map(() => "---").join("|")}|`);
for (const [task, label] of TASKS) out.push(`| ${label} | ${builders.map((b) => (BUILDER_GUIDES[b]?.[task] ? "✓" : "—")).join(" | ")} |`);
out.push("");
out.push("Mobile viewport tag and hacked-site cleanup always use the generic guide (a site-builder setting can't fix them).");
out.push("");

for (const b of builders) {
  const guides = BUILDER_GUIDES[b] ?? {};
  out.push(`## ${WEBSITE_BUILDER_NAMES[b]}`);
  out.push("");
  if (Object.keys(guides).length === 0) {
    out.push("_No official help articles found — every check uses the generic guide._");
    out.push("");
    continue;
  }
  for (const [task, label, checks] of TASKS) {
    const g = guides[task];
    if (!g) continue;
    out.push(`### ${label}`);
    out.push(`Checks: ${checks} · Source: [official help article ↗](${g.url}) · Last verified ${g.verifiedAt}`);
    out.push("");
    out.push("**EN**");
    g.steps.en.forEach((s, i) => out.push(`${i + 1}. ${s}`));
    if (g.limitation) out.push(`\n> Can't do: ${g.limitation.en}`);
    out.push("");
    out.push("**ES**");
    g.steps.es.forEach((s, i) => out.push(`${i + 1}. ${s}`));
    if (g.limitation) out.push(`\n> No permite: ${g.limitation.es}`);
    out.push("");
  }
}

out.push("## Generic guide (unknown builder, custom-built site, or no verified builder guide)");
out.push("");
out.push("“Ask your web person to:” + the item below, and a copyable message.");
out.push("");
for (const [id, gap] of GENERIC) {
  out.push(`- **${id}${gap ? ` (${gap})` : ""}**`);
  out.push(`  - EN: ${webPersonAsk(id, gap, "en")}`);
  out.push(`  - ES: ${webPersonAsk(id, gap, "es")}`);
}
out.push("");
out.push("Example message (two fixes, EN):");
out.push("");
out.push("```");
out.push(webPersonMessage([webPersonAsk("website.https", null, "en")!, webPersonAsk("website.contact_conversion", "contact", "en")!], "https://example.com", "en"));
out.push("```");

const file = process.argv[2] ?? join(homedir(), "Desktop", "builder-guides-review.md");
writeFileSync(file, out.join("\n") + "\n");
console.log(`Wrote ${file} (${count} builder guides)`);
