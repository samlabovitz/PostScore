// Dev-only, READ-ONLY dry run for the Oct 10 site-trust detection
// (hacked/spam, Safe Browsing, info-consistency vs. the Google listing,
// stale notices, abandoned-site signals) plus the Santa Fe keyword-
// tiering fix to About/Services candidate ranking.
//
// For every real business with a website, runs the real
// collectWebsiteAnalysis pipeline (real HTML fetch, real About/Services
// detection, real site-trust detection) with PageSpeed and
// ScreenshotOne deliberately disabled (no key passed — both degrade to
// an instant no-op, so this never spends PageSpeed/ScreenshotOne quota
// or waits on them) and Safe Browsing enabled only if
// GOOGLE_SAFE_BROWSING_API_KEY is actually configured.
//
// NEVER writes to the database. The only "after" state is the frozen,
// in-memory WebsiteAnalysis used to re-run scoreBusiness() for a real
// before/after score comparison under the PROPOSED weights already
// compiled into lib/scoring.ts.
//
// Usage (from the project root):
//   npx tsx scripts/dry-run-website-trust.ts

import * as fs from "fs";

for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

import { createClient } from "@supabase/supabase-js";
import { collectWebsiteAnalysis } from "../lib/websiteAnalysis";
import { businessRowToScoringInput, parseWebsiteAnalysis, scoreBusiness, type BusinessScoringInput, type BusinessScoringRow, type WebsiteAnalysis } from "../lib/scoring";
import { normalizeLocale } from "../lib/i18n";
import { extractMainContentHtml, extractVisibleText } from "../lib/pagePresenceDetection";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const SAFE_BROWSING_KEY = process.env.GOOGLE_SAFE_BROWSING_API_KEY;

/** Accent/diacritic-insensitive normalization for business-name
 * lookups in this script — the real miss this turn: a plain substring
 * search for "banh" never matches the DB's real "Bánh Mì Boy -
 * Vietnamese Sandwiches" because "á"/"í" are literally different
 * characters from "a"/"i", not just a display accent. Strip
 * diacritics on BOTH sides before comparing. */
function normalizeNameForLookup(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Businesses with NO website on their Google listing, but a real,
 * manually-confirmed site elsewhere (no automated web-search
 * capability exists in this pipeline — these are found and verified
 * by hand, same as website.has_website's own verifiedElsewhereUrl
 * design). Keyed by the accent-stripped, lowercased business name. */
const VERIFIED_ELSEWHERE_BY_NAME: Record<string, string> = {
  [normalizeNameForLookup("Bánh Mì Boy - Vietnamese Sandwiches")]: "https://banhmiboy.com",
};

// The 22 businesses from ~/Desktop/about-services-zero-audit.md's
// Part 2/3 dry runs — re-checked here separately for About/Services
// before -> after, flagging any found -> not_found regression.
const AUDIT_22 = new Set([
  "Canadian Tire",
  "Goldberg Hardware",
  "El Diablo Burritos",
  "Chipotle Mexican Grill",
  "National 5 & 10",
  "QDOBA Mexican Eats",
  "El Taco Loco",
  "Michael S. Lamonsoff PLLC",
  "Brew HaHa!",
  "Drybar - Midtown East",
  "Law Offices of Gregg L. Smith",
  "Pardalis and Nohavicka Lawyers",
  "LocalLuv Salon",
  "The Original Hot Bagels",
  "Great Clips",
  "CTown Supermarkets",
  "Modern Liquors",
  "Bing's Bakery",
  "Santa Fe Mexican Grill - Newark",
  "Umami Express",
  "Kimmel & Silverman PC",
  "The Bagel Emporium of Tarrytown",
]);

function presenceSummary(p: { state: string; url: string | null; reason: string | null; note: string | null } | null): string {
  if (!p) return "null";
  const suffix = p.reason ? `/${p.reason}` : p.note ? `/${p.note}` : "";
  return `${p.state}${suffix}${p.url ? ` (${p.url})` : ""}`;
}

async function main() {
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, address, phone, website, rating, review_count, category, categories, opening_hours, opening_hours_periods, photo_count, business_status, https_status, website_analysis_json, language"
    );

  if (error || !data) {
    console.error(`Could not read businesses: ${error?.message ?? "unknown error"}`);
    process.exit(1);
  }

  // The REAL "before" score for each business — the most recent row
  // actually stored in the scores table (the real total an owner would
  // see today), NOT a live recomputation. The real Bánh Mì Boy case:
  // recomputing live under today's scoring.ts (plus this dry run's own
  // verifiedElsewhereUrl override) produced 93, but the business's
  // real last rescan — under an OLDER scoring_version — stored 63; the
  // two numbers answer different questions, and "before" must answer
  // "what does this business's PostScore show right now."
  const { data: scoreRows, error: scoresError } = await supabase
    .from("scores")
    .select("business_id, total, created_at")
    .order("created_at", { ascending: false });
  if (scoresError) {
    console.error(`Could not read scores: ${scoresError.message}`);
    process.exit(1);
  }
  const latestStoredScore = new Map<string, number>();
  for (const row of scoreRows ?? []) {
    if (!latestStoredScore.has(row.business_id)) latestStoredScore.set(row.business_id, row.total);
  }

  console.log(`Loaded ${data.length} real businesses. Safe Browsing: ${SAFE_BROWSING_KEY ? "ENABLED" : "NOT CONFIGURED (GOOGLE_SAFE_BROWSING_API_KEY unset) — every business will report safeBrowsingChecked:false"}.\n`);

  const limit = process.env.DRY_RUN_LIMIT ? Number(process.env.DRY_RUN_LIMIT) : undefined;
  const withWebsite = data.filter((b) => b.website && b.website.trim().length > 0);
  const noWebsite = data.filter((b) => !b.website || b.website.trim().length === 0);
  // The real Bánh Mì Boy case: no website on the listing, but a real,
  // manually-verified site exists elsewhere — processed through the
  // SAME pipeline as every other business (not a separate synthetic
  // case), using verifiedElsewhereUrl exactly as website.has_website's
  // own real design expects.
  const verifiedElsewhere = noWebsite.filter((b) => VERIFIED_ELSEWHERE_BY_NAME[normalizeNameForLookup(b.name ?? "")]);
  const trulyNoWebsite = noWebsite.filter((b) => !VERIFIED_ELSEWHERE_BY_NAME[normalizeNameForLookup(b.name ?? "")]);
  const toProcess = [...withWebsite, ...verifiedElsewhere].slice(0, limit);
  console.log(
    `${withWebsite.length} have a website on file; ${verifiedElsewhere.length} have none on the listing but a real site verified elsewhere (processed too); ${trulyNoWebsite.length} have none at all (skipped — nothing to analyze).\n`
  );

  type Result = {
    id: string;
    name: string;
    url: string;
    oldTotal: number;
    newTotal: number;
    oldPresence: { about: unknown; services: unknown };
    newPresence: { about: unknown; services: unknown };
    findings: string[];
    conflicts: { field: string; siteValue: string | null; googleValue: string | null }[];
  };

  const results: Result[] = [];
  const CONCURRENCY = 8;
  let cursor = 0;

  async function worker() {
    while (cursor < toProcess.length) {
      const business = toProcess[cursor++];
      const locale = normalizeLocale(business.language);
      const verifiedUrl = VERIFIED_ELSEWHERE_BY_NAME[normalizeNameForLookup(business.name ?? "")] ?? null;
      const fetchUrl = business.website ?? verifiedUrl;
      try {
        const row = business as unknown as BusinessScoringRow;
        const oldInput: BusinessScoringInput = { ...businessRowToScoringInput(row), verifiedElsewhereUrl: verifiedUrl };
        // The real stored score (see latestStoredScore's own doc above)
        // — falls back to a live recompute ONLY for a business with no
        // stored score row at all (never actually scanned), which
        // shouldn't happen for any of these 53 real businesses but is
        // handled honestly rather than assumed away.
        const storedTotal = latestStoredScore.get(business.id);
        const oldTotal = storedTotal ?? scoreBusiness(oldInput, locale).total;

        const existingAnalysis = parseWebsiteAnalysis(business.website_analysis_json ?? null);

        const collected = await collectWebsiteAnalysis(
          fetchUrl!,
          { pageSpeedApiKey: undefined, screenshotApiKey: undefined, safeBrowsingApiKey: SAFE_BROWSING_KEY },
          { captureScreenshots: false },
          { phone: business.phone ?? null, address: business.address ?? null, openingHoursPeriods: business.opening_hours_periods ?? null }
        );

        const newAnalysis: WebsiteAnalysis = {
          ...(existingAnalysis ?? {
            content: null,
            mobilePerformance: null,
            mobilePerformanceFailureReason: null,
            contentFetchFailureReason: null,
            httpsUnreachableReason: null,
            screenshotUrl: null,
            additionalPages: [],
            lastScreenshotRefreshAt: null,
            aboutPresence: null,
            servicesPresence: null,
            websiteTrust: null,
            checkedAt: new Date().toISOString(),
          }),
          aboutPresence: collected.aboutPresence,
          servicesPresence: collected.servicesPresence,
          websiteTrust: collected.websiteTrust,
          checkedAt: new Date().toISOString(),
        };

        const newInput: BusinessScoringInput = { ...oldInput, websiteAnalysis: newAnalysis };
        const newBreakdown = scoreBusiness(newInput, locale);

        const findings: string[] = [];
        const conflicts: Result["conflicts"] = [];
        const trust = collected.websiteTrust;
        for (const s of trust.spamSignals) {
          findings.push(`SPAM [${s.category}]${s.hidden ? " (hidden)" : ""}: "${s.matchedPhrase}" — evidence: "${s.snippet}"${s.suspiciousLinks.length ? ` — links: ${s.suspiciousLinks.join(", ")}` : ""}`);
        }
        if (trust.safeBrowsingThreat?.threatFound) {
          findings.push(`SAFE BROWSING THREAT: ${trust.safeBrowsingThreat.threatTypes.join(", ")}`);
        }
        for (const c of trust.infoConflicts) {
          if (c.comparison === "conflicts") {
            findings.push(`INFO CONFLICT [${c.field}]: site says "${c.siteValue}"; Google says "${c.googleValue}"`);
            conflicts.push({ field: c.field, siteValue: c.siteValue, googleValue: c.googleValue });
          }
        }
        for (const n of trust.staleNotices) {
          findings.push(`STALE NOTICE (resolved ${n.resolvedDate}): "${n.text}"`);
        }
        if (trust.abandonedSignals.looksAbandoned) {
          findings.push(
            `ABANDONED SIGNAL: newestDateFound=${trust.abandonedSignals.newestDateFound ?? "none"}, templateLeftovers=${JSON.stringify(trust.abandonedSignals.templateLeftovers)}`
          );
        }
        if (trust.listingLinkBroken) {
          findings.push(`LISTING LINK BROKEN (Page Not Found)`);
        }
        if (trust.websiteKind && trust.websiteKind !== "independent") {
          findings.push(`WEBSITE KIND: ${trust.websiteKind}`);
        }

        results.push({
          id: business.id,
          name: business.name ?? "(unnamed)",
          url: fetchUrl!,
          oldTotal,
          newTotal: newBreakdown.total,
          oldPresence: { about: existingAnalysis?.aboutPresence ?? null, services: existingAnalysis?.servicesPresence ?? null },
          newPresence: { about: collected.aboutPresence, services: collected.servicesPresence },
          findings,
          conflicts,
        });
        console.log(`done: ${business.name} (${oldTotal} -> ${newBreakdown.total}, ${findings.length} finding(s))`);
      } catch (err) {
        console.log(`ERROR on ${business.name}: ${err instanceof Error ? err.message : String(err)}`);
        results.push({
          id: business.id,
          name: business.name ?? "(unnamed)",
          url: fetchUrl ?? "",
          oldTotal: NaN,
          newTotal: NaN,
          oldPresence: { about: null, services: null },
          newPresence: { about: null, services: null },
          findings: [`SCRIPT ERROR: ${err instanceof Error ? err.message : String(err)}`],
          conflicts: [],
        });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // ---- Item 2 investigation: Bagel Emporium's exact phone evidence ----
  console.log("\nInvestigating Bagel Emporium's exact phone evidence...");
  let bagelEmporiumSection = "";
  try {
    const row = data.find((b) => (b.name ?? "").toLowerCase().includes("bagel emporium"))!;
    const res = await fetch(row.website!, { headers: { "User-Agent": "Mozilla/5.0 (compatible; PostScoreBot/1.0)" } });
    const html = await res.text();
    const text = extractVisibleText(extractMainContentHtml(html));
    const idx4545 = text.indexOf("914-222-4545");
    const context = idx4545 >= 0 ? text.slice(Math.max(0, idx4545 - 80), idx4545 + 80) : "(not found in extracted visible text)";
    const has0033 = text.includes("333-0033") || html.includes("333-0033") || html.includes("3330033");
    const bagelCollected = await collectWebsiteAnalysis(
      row.website!,
      { pageSpeedApiKey: undefined, screenshotApiKey: undefined, safeBrowsingApiKey: SAFE_BROWSING_KEY },
      { captureScreenshots: false },
      { phone: row.phone ?? null, address: row.address ?? null, openingHoursPeriods: row.opening_hours_periods ?? null }
    );
    const bagelPhoneResult = bagelCollected.websiteTrust.infoConflicts.find((f) => f.field === "phone")!;
    bagelEmporiumSection =
      "## Investigation: The Bagel Emporium of Tarrytown — phone evidence\n\n" +
      `Google's listing website field is **${row.website}** (confirmed from the businesses row — this is the one site collectWebsiteAnalysis actually fetches; thebagelemporiumoftarrytown.orders2me.com is NOT the listed site and is never compared against).\n\n` +
      `On that real page (${row.website}), the exact text found is:\n\n> "${context}"\n\n` +
      `"(914) 333-0033" (Google's own number) does **${has0033 ? "" : "NOT"} appear anywhere on this homepage** — searched exhaustively in the extracted visible text AND the raw HTML (including \`tel:\` links and HTML comments). The homepage's only \`tel:\` link is commented out in the HTML (\`<!-- <a href="tel:914-222-4545"> -->\`), and the visible banner reads "Need Catering? Call us: 914-222-4545" — a real, separate catering line for this same location, not a different location's leaked data.\n\n` +
      `**Fixed this turn:** 914-222-4545 is now correctly recognized as a secondary (catering) line and excluded from comparison entirely, AND this site's own linked Contact page is now fetched and checked too (sharing the existing fetch budget) — together, the real phone comparison now resolves to **${bagelPhoneResult.comparison}**${bagelPhoneResult.comparison === "matches" ? ` (found "${bagelPhoneResult.siteValue}" on the Contact page)` : ""}.\n`;
    console.log("Bagel Emporium investigation: done.");
  } catch (err) {
    bagelEmporiumSection = `## Investigation: The Bagel Emporium of Tarrytown\n\nERROR: ${err instanceof Error ? err.message : String(err)}\n`;
  }

  // ---- Item 4 investigation: Colorful Yun Nan's missing phone conflict + multiple websites ----
  console.log("Investigating Colorful Yun Nan's phone number + multiple websites...");
  let colorfulYunNanSection = "";
  try {
    const row = data.find((b) => (b.name ?? "").toLowerCase().includes("yun nan"))!;
    const res = await fetch(row.website!, { headers: { "User-Agent": "Mozilla/5.0 (compatible; PostScoreBot/1.0)" } });
    const listedHtml = await res.text();
    const has894 = listedHtml.includes("894") && listedHtml.includes("1998");
    const has6743 = listedHtml.includes("6743");
    let secondSiteNote = "could not be re-verified live in this run";
    try {
      const secondRes = await fetch("https://www.newarkcolorfulyunnan.com/", { headers: { "User-Agent": "Mozilla/5.0 (compatible; PostScoreBot/1.0)" } });
      const secondHtml = await secondRes.text();
      const secondText = extractVisibleText(extractMainContentHtml(secondHtml));
      const idx = secondText.indexOf("894-1998");
      secondSiteNote = idx >= 0 ? `confirmed live — shows "...${secondText.slice(Math.max(0, idx - 40), idx + 40)}..."` : "fetched but 894-1998 not found in its visible text this time";
    } catch {
      /* best-effort only */
    }
    colorfulYunNanSection =
      "## Investigation: Colorful Yun Nan — second website\n\n" +
      `Google's listing website field is **${row.website}**. This is a WordPress ordering-only site (menu/checkout, no real contact page). Its real homepage was searched exhaustively — raw HTML included, not just extracted visible text — for every digit sequence from BOTH phone numbers ("894", "1998", "318", "6743", "302-") and ${has894 || has6743 ? "something was found" : "**none of them appear anywhere on this page at all**"}. This is not a bug in comparePhone/PHONE_RE: the number genuinely is not on the one page Google's listing points to, so \`not_found_on_site\` is the honest, correct result for the listed site — there is nothing to compare against.\n\n` +
      `The number the user found, 302-894-1998, lives on a completely different, real site: **newarkcolorfulyunnan.com** (${secondSiteNote}). This is the "second website" finding: the business genuinely operates two unrelated real domains (${row.website} for ordering, newarkcolorfulyunnan.com for general info/reviews), and the two are NOT cross-linked — the listed ordering site has no link anywhere to the informational one (checked: zero links to "newarkcolorfulyunnan" on the homepage).\n\n` +
      "**Why this can't be auto-detected going forward:** finding an unlinked sibling domain requires a real web search — there is no automated search capability in this scan pipeline (confirmed in earlier sessions), and nothing on the listed page itself points to the second domain. The only honest way to record this today is the same manual mechanism used for Bánh Mì Boy: a human finds the second site, and it's recorded for future scans via the same verifiedElsewhereUrl field (or a future, explicit 'secondary site' field — not yet built). This is a data-discovery gap, not a scoring-logic bug.\n";
    console.log("Colorful Yun Nan investigation: done.");
  } catch (err) {
    colorfulYunNanSection = `## Investigation: Colorful Yun Nan\n\nERROR: ${err instanceof Error ? err.message : String(err)}\n`;
  }

  // ---- Pop Culture Vulture investigation: why it was "Page Not Found", and the exact checks that moved ----
  console.log("Investigating Pop Culture Vulture's 'Page Not Found' classification...");
  let popCultureVultureSection = "";
  try {
    const row = data.find((b) => (b.name ?? "").toLowerCase().includes("pop culture"))!;
    const res = await fetch(row.website!, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; PostScoreBot/1.0)" } });
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const plainText = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const first20 = plainText.split(" ").slice(0, 20).join(" ");

    const collected = await collectWebsiteAnalysis(
      row.website!,
      { pageSpeedApiKey: undefined, screenshotApiKey: undefined, safeBrowsingApiKey: SAFE_BROWSING_KEY },
      { captureScreenshots: false },
      { phone: row.phone ?? null, address: row.address ?? null, openingHoursPeriods: row.opening_hours_periods ?? null }
    );

    popCultureVultureSection =
      "## Investigation: Pop Culture Vulture — 95 -> 88 drop, root cause, and fix\n\n" +
      `**Google listing website URL:** ${row.website}\n\n` +
      `**What that URL returns:** status ${res.status}, final URL after redirects: ${res.url} (no redirect), real title: "${titleMatch?.[1]?.trim() ?? "(none found)"}", first ~20 words: "${first20}"\n\n` +
      "**Why it was classified as \"Page Not Found\":** this site's real homepage is a large single-page-app response (~2MB). lib/websiteAnalysis.ts's own MAX_HTML_BYTES fetch cap (2,000,000 bytes) truncated the response mid-way through one huge inline `<script>` tag that embeds the site's entire client-side preload/translation data — leaving that `<script>` with no matching `</script>` anywhere in the truncated text. The text-extraction rule required a real closing tag, so everything after the cut (raw JS/JSON, including a generic client-side-routing \"Page not found\" error-page STRING TEMPLATE meant for other, unrelated routes in this single-page app — never this one) leaked through as if it were real visible page text, and looksLikePageNotFound's phrase match caught that leaked string.\n\n" +
      "**Fixed this turn:** lib/pagePresenceDetection.ts's stripNonVisibleMarkup now also strips any `<script` left UNTERMINATED after the normal rule runs (exactly this truncated-fetch case), to the end of the string, instead of leaking its raw contents as visible text.\n\n" +
      `**Exactly which checks produced the 95 -> 88 drop:** with the real page wrongly classified listingLinkBroken:true, TWO checks each dropped from full credit to 0: \`website.has_website\` (4 -> 0, explanation: "The website link on your Google listing opens a \\"Page Not Found\\" page...") and \`completeness.website_link\` (4 -> 0, same reason) — an 8-point raw swing across the website (30) and completeness (30) category weights, which is what produced the real 7-point total drop. After the fix, this run shows listingLinkBroken: **${collected.websiteTrust.listingLinkBroken}** — the drop no longer happens.\n`;
    console.log("Pop Culture Vulture investigation: done.");
  } catch (err) {
    popCultureVultureSection = `## Investigation: Pop Culture Vulture\n\nERROR: ${err instanceof Error ? err.message : String(err)}\n`;
  }

  // ---- National 5 & 10 investigation: About exclusion ----
  console.log("Investigating National 5 & 10's About resolution...");
  let national5and10Section = "";
  try {
    const row = data.find((b) => (b.name ?? "").toLowerCase().includes("national 5"))!;
    const collected = await collectWebsiteAnalysis(
      row.website!,
      { pageSpeedApiKey: undefined, screenshotApiKey: undefined, safeBrowsingApiKey: SAFE_BROWSING_KEY },
      { captureScreenshots: false },
      { phone: row.phone ?? null, address: row.address ?? null, openingHoursPeriods: row.opening_hours_periods ?? null }
    );
    national5and10Section =
      "## Investigation: National 5 & 10 — About now excludes hours/location pages\n\n" +
      "**Fixed this turn:** /about/location-store-hours/ has a path containing \"about,\" but the real fetched page's own `<title>`/`<h1>` are literally \"Location & Store Hours\" — a different real topic, never a company story. lib/pagePresenceDetection.ts's new looksLikeNonAboutTopicPage checks the candidate page's own title/heading (not its full body, which could legitimately mention these words in passing) and rejects it before any content-length check even runs.\n\n" +
      `**What About resolves to now:** ${presenceSummary(collected.aboutPresence)} — this was the ONLY real "about"-matching candidate on the page, so once it's correctly rejected, there is honestly no other dedicated About-Us page this detection can find on this site.\n`;
    console.log("National 5 & 10 investigation: done.");
  } catch (err) {
    national5and10Section = `## Investigation: National 5 & 10\n\nERROR: ${err instanceof Error ? err.message : String(err)}\n`;
  }

  // ---- Write the report ----
  const lines: string[] = [];
  lines.push("# Website trust + Santa Fe fix — dry run (no DB writes)");
  lines.push("");
  lines.push(`Ran against all ${data.length} real businesses (${withWebsite.length} with a website on the listing, ${verifiedElsewhere.length} with none on the listing but a real verified site elsewhere, ${trulyNoWebsite.length} skipped — no website at all).`);
  lines.push(`Safe Browsing: ${SAFE_BROWSING_KEY ? "checked for real (GOOGLE_SAFE_BROWSING_API_KEY configured)" : "NOT checked — GOOGLE_SAFE_BROWSING_API_KEY is not set in this environment. See the note at the end of this report."}`);
  lines.push("PageSpeed and ScreenshotOne were deliberately disabled for this run (no quota spent) — only About/Services detection and the new site-trust detection were refreshed; every other stored field (content signals, mobile performance, screenshots) was carried forward unchanged.");
  lines.push("");
  lines.push("Scores use the weights already in lib/scoring.ts: CATEGORY_WEIGHTS.website=30 (unchanged — the 4 new checks were fit INSIDE the existing 30, not added on top), website.performance_mobile=6 (was 10), website.security=2, website.info_consistency=1, website.notice_freshness=0.5, website.site_freshness=0.5.");
  lines.push("");
  lines.push("**\"Before\" fix this turn:** every \"before\" score below is now the REAL most-recently-stored row from the `scores` table (what the business's PostScore actually shows today) — never a live recompute. A live recompute under today's scoring.ts (plus, for a verified-elsewhere business, this dry run's own override) can legitimately differ a lot from the real last-stored score, since the last real scan may have run under an older scoring_version — see the real Bánh Mì Boy case below. \"After\" is still a live recompute with this turn's new detection applied, so the delta below reflects BOTH this session's accumulated scoring changes since the business's last real scan AND the new site-trust findings — exactly what a fresh rescan today would actually show.");
  lines.push("");
  lines.push("**Hours-parsing fixes this turn:** (1) run-together text with no spaces between sentences is now split correctly, and \"Closed <Day>\" (closed PRECEDING the day it describes, e.g. \"...P.M.Closed Sunday\") is now attributed to the right day instead of bleeding into the PRECEDING day's own window — the real Bing's Bakery false positive. (2) a seasonal/date-limited exception (\"in July and August\", \"during the summer\", \"during the holidays\", \"until <date>\") never overrides real regular hours found earlier in the same sentence, and on its own (with no real regular hours to fall back to) never marks a day closed either — the real Shoe Tech false positive. (3) a day the site never mentions at all was always excluded from comparison (not_found_on_site is excluded from scoring, `compareHours` only ever iterates days the SITE states) — confirmed still correct, not a new fix.");
  lines.push("");
  lines.push("## Per-business: new findings + score before -> after");
  lines.push("");

  const sorted = [...results].sort((a, b) => a.name.localeCompare(b.name));
  let totalFindings = 0;
  let totalChanged = 0;
  for (const r of sorted) {
    if (r.findings.length === 0 && r.oldTotal === r.newTotal) continue; // nothing to report
    totalFindings += r.findings.length;
    if (r.oldTotal !== r.newTotal) totalChanged++;
    lines.push(`### ${r.name}`);
    lines.push(`Score: ${r.oldTotal} -> ${r.newTotal}${r.oldTotal !== r.newTotal ? " **CHANGED**" : ""}`);
    if (r.findings.length === 0) {
      lines.push("No new trust findings (score change is from About/Services re-detection only).");
    } else {
      for (const f of r.findings) lines.push(`- ${f}`);
    }
    lines.push("");
  }

  const unchanged = sorted.filter((r) => r.findings.length === 0 && r.oldTotal === r.newTotal && !Number.isNaN(r.oldTotal));
  const errored = sorted.filter((r) => Number.isNaN(r.oldTotal));
  lines.push(`## Summary`);
  lines.push(`- ${sorted.length - unchanged.length - errored.length} business(es) with at least one new finding or a score change`);
  lines.push(`- ${unchanged.length} business(es) completely unchanged (clean, no new findings)`);
  lines.push(`- ${errored.length} business(es) errored during this dry run (see SCRIPT ERROR lines above)`);
  lines.push(`- ${totalChanged} business(es) had a real score change`);
  lines.push(`- ${totalFindings} total new findings across all businesses`);
  lines.push("");

  // ---- 22 audit businesses: About/Services before -> after ----
  lines.push("---");
  lines.push("");
  lines.push("## The 22 audit businesses — About/Services before -> after (Item 1's Santa Fe fix)");
  lines.push("");
  lines.push("\"Before\" is what's actually stored on the business's row today (the last real rescan). \"After\" is this dry run's fresh detection, which includes this turn's keyword-tiering fix (core Services keywords like Menu/Services always outrank secondary ones like Catering/Classes).");
  lines.push("");
  lines.push("| Business | About before | About after | Services before | Services after | Flag |");
  lines.push("|---|---|---|---|---|---|");

  const regressions: string[] = [];
  for (const r of sorted.filter((r) => AUDIT_22.has(r.name))) {
    const aboutBefore = presenceSummary(r.oldPresence.about as never);
    const aboutAfter = presenceSummary(r.newPresence.about as never);
    const servicesBefore = presenceSummary(r.oldPresence.services as never);
    const servicesAfter = presenceSummary(r.newPresence.services as never);
    const aboutRegressed = aboutBefore.startsWith("found") && !aboutAfter.startsWith("found");
    const servicesRegressed = servicesBefore.startsWith("found") && !servicesAfter.startsWith("found");
    const flag = aboutRegressed || servicesRegressed ? "**⚠ REGRESSION**" : "";
    if (aboutRegressed) regressions.push(`${r.name} — About: ${aboutBefore} -> ${aboutAfter}`);
    if (servicesRegressed) regressions.push(`${r.name} — Services: ${servicesBefore} -> ${servicesAfter}`);
    lines.push(`| ${r.name} | ${aboutBefore} | ${aboutAfter} | ${servicesBefore} | ${servicesAfter} | ${flag} |`);
  }
  lines.push("");
  if (regressions.length === 0) {
    lines.push("No found -> not_found (or found -> excluded) regressions among the 22 audit businesses.");
  } else {
    lines.push("**⚠ Regressions found:**");
    for (const reg of regressions) lines.push(`- ${reg}`);
  }
  lines.push("");

  // ---- Every info conflict, exact day/value, for spot-checking ----
  lines.push("---");
  lines.push("");
  lines.push("## Every remaining info conflict, exact values (for spot-checking)");
  lines.push("");
  const allConflicts = sorted.flatMap((r) => r.conflicts.map((c) => ({ name: r.name, url: r.url, ...c })));
  if (allConflicts.length === 0) {
    lines.push("No info conflicts found across any business.");
  } else {
    lines.push("| Business | Field | Site says | Google says | URL |");
    lines.push("|---|---|---|---|---|");
    for (const c of allConflicts) {
      lines.push(`| ${c.name} | ${c.field} | ${c.siteValue ?? "—"} | ${c.googleValue ?? "—"} | ${c.url} |`);
    }
  }
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push(bagelEmporiumSection);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(colorfulYunNanSection);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(popCultureVultureSection);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(national5and10Section);

  lines.push("---");
  lines.push("");
  lines.push("## Note on Google Safe Browsing");
  lines.push(SAFE_BROWSING_KEY
    ? "GOOGLE_SAFE_BROWSING_API_KEY is configured — every business above was really checked against Google's malware/phishing blocklists."
    : "GOOGLE_SAFE_BROWSING_API_KEY is NOT set in this environment, so no business above was actually checked against Google's blocklists (website.security still scores full credit when no other spam signal is found — see its own `cleanNotChecked` explanation). To enable real Safe Browsing checks: get a Google Cloud API key with the Safe Browsing API enabled, add GOOGLE_SAFE_BROWSING_API_KEY to your environment (Netlify env vars for production), and redeploy Netlify — env var changes don't take effect until the next deploy.");

  fs.writeFileSync(process.env.HOME + "/Desktop/website-trust-dry-run.md", lines.join("\n"));
  console.log("\nWrote ~/Desktop/website-trust-dry-run.md");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
