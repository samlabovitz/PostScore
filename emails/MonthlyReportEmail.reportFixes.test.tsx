import { describe, expect, test } from "vitest";
import { render } from "@react-email/components";
import { inboxPreviewText, MonthlyReportEmail } from "./MonthlyReportEmail";
import { BASE_SNAPSHOT, scoreRow, scoringInput } from "./sampleMonthlyReportContent";
import {
  buildMonthlyReportContent,
  EMPTY_REPORT_EXTRAS,
  type MonthlyReportContent,
  type MonthlyReportFocusInputs,
  type ReportExtras,
} from "@/lib/monthlyReport";
import { buildReportExtras, reportTopTask, snapshotFromSavedRows } from "@/lib/monthlyReportExtras";
import type { ActionPlanTask } from "@/lib/actionPlan";
import type { SavedScanRow } from "@/lib/savedCompetitorScans";
import { scoreBusiness, type BusinessScoringInput, type WebsiteTrustAnalysis } from "@/lib/scoring";
import { t, type Locale } from "@/lib/i18n";

// The monthly report fixes (audit items a–g): Spanish reports carry no
// English words, a scoring update never reads as progress, a security
// problem leads the report, a partly-checked score says so, standing
// matches the Competitors page, and the focus item follows the Growth
// page's rules.

function decode(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;|&apos;/gi, "'");
}

/** The words a reader sees — tags, styles and link targets removed. */
function visibleText(html: string): string {
  return decode(
    html
      .replace(/<head[\s\S]*?<\/head>/i, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

async function renderReport(content: MonthlyReportContent, locale: Locale): Promise<string> {
  return visibleText(
    await render(
      <MonthlyReportEmail
        businessName="Riverside Cafe"
        reportDate="2026-10-01T14:00:00.000Z"
        content={content}
        unsubscribeUrl="https://postscore.app/unsubscribe?business=x&token=y"
        locale={locale}
      />
    )
  );
}

const TRUST: WebsiteTrustAnalysis = {
  spamSignals: [],
  safeBrowsingThreat: null,
  safeBrowsingChecked: true,
  infoConflicts: [
    { field: "phone", comparison: "matches", siteValue: "555-201-4000", googleValue: "555-201-4000" },
    { field: "address", comparison: "matches", siteValue: "44 Riverside Ave", googleValue: "44 Riverside Ave" },
    { field: "hours", comparison: "not_found_on_site", siteValue: null, googleValue: "Mon 7–4" },
  ],
  staleNotices: [],
  abandonedSignals: { newestDateFound: "2026-09-01", templateLeftovers: [], looksAbandoned: false },
  websiteKind: "independent",
  listingLinkBroken: false,
  checkedAt: "2026-09-01T00:00:00.000Z",
};

function inputWith(trust: Partial<WebsiteTrustAnalysis>, overrides: Partial<BusinessScoringInput> = {}): BusinessScoringInput {
  const base = scoringInput();
  return { ...base, ...overrides, websiteAnalysis: { ...base.websiteAnalysis!, websiteTrust: { ...TRUST, ...trust } } };
}

function focus(locale: Locale, task: MonthlyReportFocusInputs["topActionPlanTask"] = null): MonthlyReportFocusInputs {
  return { topActionPlanTask: task, growthMoves: [], monthIndex: 2026 * 12 + 8, routineCheckedCount: 2 };
}

/** One report of each kind, built by the real builder in `locale`. */
function everyKind(locale: Locale): Record<string, MonthlyReportContent> {
  const at = (overrides: Parameters<typeof scoreRow>[0]) => scoreRow({ scoringVersion: "1.10.0", ...overrides });
  const current = at({ id: "c", total: 84, grade: "B", createdAt: "2026-10-01T00:00:00.000Z" });
  return {
    baseline: buildMonthlyReportContent(null, current, null, null, locale, focus(locale)),
    steady: buildMonthlyReportContent(at({ id: "b", total: 84, grade: "B" }), current, null, null, locale, focus(locale)),
    improved: buildMonthlyReportContent(
      at({ id: "b", total: 70, grade: "C", profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.2, reviewCount: 118 } }),
      current,
      {
        previous: { rank: 5, totalCompetitors: 12, topCompetitorReviewCount: null },
        current: { rank: 2, totalCompetitors: 12, topCompetitorReviewCount: 190 },
      },
      null,
      locale,
      focus(locale)
    ),
    declined: buildMonthlyReportContent(at({ id: "b", total: 92, grade: "A" }), current, null, null, locale, focus(locale)),
    scoringUpdated: buildMonthlyReportContent(
      scoreRow({ id: "b", total: 63, grade: "D", scoringVersion: "1.6.0", profileSnapshot: { ...BASE_SNAPSHOT, reviewCount: 130 } }),
      current,
      null,
      null,
      locale,
      focus(locale)
    ),
  };
}

describe("Spanish reports carry no English words", () => {
  const ENGLISH = /\b(to|rating|score|here's|steady)\b/i;
  for (const [kind, content] of Object.entries(everyKind("es"))) {
    test(`${kind} (es)`, async () => {
      const text = await renderReport(content, "es");
      expect(text.match(ENGLISH)?.[0] ?? null).toBeNull();
    });
  }
});

describe("a scoring update is never reported as progress", () => {
  test("no delta, no earned tone; says PostScore updated scoring; real review change still reported", async () => {
    const content = everyKind("en").scoringUpdated;
    expect(content.comparability).toBe("scoring_updated");
    const text = await renderReport(content, "en");
    expect(text).toContain("PostScore updated how it scores since your last report");
    expect(text).not.toMatch(/great progress|\+21/i);
    expect(text).toMatch(/12 new reviews/);
  });

  test("a website check going measured ↔ couldn't check is flagged (checks_flipped)", async () => {
    const measured = scoringInput();
    const blocked = scoringInput({
      websiteAnalysis: { ...measured.websiteAnalysis!, content: null, contentFetchFailureReason: "blocked_automated_check" },
    });
    const content = buildMonthlyReportContent(
      scoreRow({ id: "b", scoringVersion: "1.10.0", breakdown: scoreBusiness(measured) }),
      scoreRow({ id: "c", scoringVersion: "1.10.0", breakdown: scoreBusiness(blocked) }),
      null,
      null,
      "en",
      focus("en")
    );
    expect(content.comparability).toBe("checks_flipped");
    expect(await renderReport(content, "en")).toContain("Some checks couldn't be measured this time");
  });

  test("newly found data (any check, e.g. review recency now measured) is never called progress — EN + ES", async () => {
    const before = scoringInput({ hasRecentReview: null });
    const after = scoringInput({ hasRecentReview: true });
    for (const locale of ["en", "es"] as const) {
      const content = buildMonthlyReportContent(
        scoreRow({ id: "b", scoringVersion: "1.12.0", breakdown: scoreBusiness(before) }),
        scoreRow({ id: "c", scoringVersion: "1.12.0", breakdown: scoreBusiness(after) }),
        null,
        null,
        locale,
        focus(locale)
      );
      expect(content.comparability).toBe("checks_flipped");
      const text = await renderReport(content, locale);
      const preview = inboxPreviewText(content.summary);
      expect(text).toContain(locale === "en" ? "Some checks were measured differently this month" : "Algunas revisiones se midieron de otra forma este mes");
      expect(preview).toContain(locale === "en" ? "isn't a like-for-like change" : "no es un cambio comparable");
      for (const s of [text, preview]) {
        expect(s).not.toMatch(/score (rose|dropped)|puntuación (subió|bajó)|great progress|since last report|desde el último informe/i);
        expect(s).not.toMatch(/\+\d+ (pts|points|puntos)/i);
      }
    }
  });
});

describe("report extras from the current scan", () => {
  test("spam on the site → a security warning at the top, EN + ES", async () => {
    const input = inputWith({
      spamSignals: [{ category: "replica", matchedPhrase: "replica watches", snippet: "replica watches", suspiciousLinks: [], hidden: true } as never],
    });
    const extras = buildReportExtras(input, scoreBusiness(input));
    expect(extras.securityAlert).toEqual({ kind: "spam", category: "replica" });
    for (const locale of ["en", "es"] as const) {
      const content = buildMonthlyReportContent(null, scoreRow({ breakdown: scoreBusiness(input) }), null, null, locale, focus(locale), true, extras);
      const text = await renderReport(content, locale);
      expect(text).toContain(locale === "en" ? "Warning: we found spam content on your website" : "Advertencia: encontramos contenido de spam");
      // The top item: above the headline, and so above the score.
      const scoreLine = t(locale, "report.score.summary", { total: content.score.current.total, grade: content.score.current.grade });
      const warning = text.indexOf(locale === "en" ? "Warning:" : "Advertencia:");
      expect(warning).toBeLessThan(text.lastIndexOf(scoreLine));
      expect(warning).toBeLessThan(text.indexOf(t(locale, "report.headline.baseline")));
    }
  });

  test("a Safe Browsing flag wins over spam; a clean site has no alert", () => {
    const flagged = inputWith({ safeBrowsingThreat: { threatFound: true, threatTypes: ["MALWARE"] } });
    expect(buildReportExtras(flagged, scoreBusiness(flagged)).securityAlert).toEqual({ kind: "safe_browsing", types: ["MALWARE"] });
    const clean = inputWith({});
    expect(buildReportExtras(clean, scoreBusiness(clean)).securityAlert).toBeNull();
  });

  test("a site that blocks our check → 'Partly checked' with the real point basis", async () => {
    const base = scoringInput();
    const blocked = { ...base, websiteAnalysis: { ...base.websiteAnalysis!, content: null, contentFetchFailureReason: "blocked_automated_check" as const } };
    const extras = buildReportExtras(blocked, scoreBusiness(blocked));
    expect(extras.scoreBasis).not.toBeNull();
    const content = buildMonthlyReportContent(null, scoreRow({ breakdown: scoreBusiness(blocked) }), null, null, "en", focus("en"), true, extras);
    expect(await renderReport(content, "en")).toContain(`this score is based on ${extras.scoreBasis} of 100 points`);
    // A fully measured site is never "partly checked".
    expect(buildReportExtras(base, scoreBusiness(base)).scoreBasis).toBeNull();
  });
});

describe("competitor standing matches the Competitors page", () => {
  function row(name: string, isSubject: boolean, total: number | null, reviews: number): SavedScanRow {
    return {
      scan_id: "s", created_at: "2026-10-01T00:00:00Z", is_subject: isSubject, place_id: name, name, address: null,
      distance_meters: isSubject ? null : 500, rating: 4.5, review_count: reviews, has_website: true, total, grade: "B",
      // Same real breakdown for everyone → equal comparable scores, so the
      // saved order (by total) decides — as before.
      scoring_version: "1.10.0", breakdown_json: scoreBusiness(scoringInput()), price_level: null, photo_count: 10,
    };
  }
  test("rank and total come from reportStanding; the #1 business's reviews are kept", () => {
    const snapshot = snapshotFromSavedRows([row("Owner", true, 70, 15), row("Top", false, 90, 200), row("Mid", false, 80, 50)]);
    expect(snapshot).toEqual({ rank: 3, totalCompetitors: 3, topCompetitorReviewCount: 200 });
  });
  test("no owner row → no standing", () => {
    expect(snapshotFromSavedRows([row("Top", false, 90, 200)])).toBeNull();
    expect(snapshotFromSavedRows([])).toBeNull();
  });
});

describe("the focus item follows the Growth page's rules", () => {
  function task(checkId: string, category: ActionPlanTask["category"], action: string): ActionPlanTask {
    return { checkId, category, label: checkId, action, why: "", fix: "", problem: "" } as unknown as ActionPlanTask;
  }
  const FALLBACK = t("en", "content.actionPlan.fallback.action");

  test("website.* tasks are left to the website pointer; the generic fallback is skipped for the next real task", () => {
    const input = inputWith({});
    const top = reportTopTask(
      [
        task("website.contact_conversion", "website", "Add a click-to-call link"),
        task("visibility.photos", "completeness", FALLBACK),
        task("visibility.review_count", "visibility", "Ask three regulars for a review"),
      ],
      input,
      "en"
    );
    expect(top?.checkId).toBe("visibility.review_count");
  });

  test("a Google mismatch names the real values, per field (EN + ES)", () => {
    const input = inputWith({
      infoConflicts: [
        { field: "phone", comparison: "conflicts", siteValue: "302-555-0100", googleValue: "302-555-0199" },
        { field: "address", comparison: "matches", siteValue: "44 Riverside Ave", googleValue: "44 Riverside Ave" },
        { field: "hours", comparison: "not_found_on_site", siteValue: null, googleValue: "Mon 7–4" },
      ],
    });
    const tasks = [task("website.info_consistency", "website", "generic")];
    expect(reportTopTask(tasks, input, "en")?.action).toBe("Your site says 302-555-0100, Google says 302-555-0199 — update whichever is wrong.");
    expect(reportTopTask(tasks, input, "es")?.action).toBe("Su sitio dice 302-555-0100 y Google dice 302-555-0199 — actualice el que esté mal.");
  });

  test("the website pointer is the Growth page's banner line", () => {
    const extras: ReportExtras = { ...EMPTY_REPORT_EXTRAS, websiteImprovement: { score: 72, improvements: 2, points: 3.5 } };
    const content = buildMonthlyReportContent(null, scoreRow(), null, null, "en", focus("en"), true, extras);
    expect(content.focus.pointers.some((p) => p.text === "Your website scores 72/100 — 2 improvements available (up to about +4 pts). See the Website page.")).toBe(true);
  });
});

describe("scoring version comes from the row or its breakdown", () => {
  test("a live breakdown (no row version) still counts as a scoring update", () => {
    const baseline = scoreRow({ id: "b", total: 63, grade: "D", breakdown: { ...scoreBusiness(scoringInput()), scoringVersion: "1.6.0" } });
    const current = scoreRow({ id: "c", total: 88, grade: "B" });
    expect(buildMonthlyReportContent(baseline, current, null, null, "en").comparability).toBe("scoring_updated");
  });
});

describe("hack signs carry a caution on 'Add your website to your Google listing'", () => {
  function listingTask(): ActionPlanTask {
    return { checkId: "completeness.website_link", category: "completeness", label: "Website link on listing", action: "x", why: "", fix: "", problem: "" } as unknown as ActionPlanTask;
  }
  const spam = [{ category: "replica", matchedPhrase: "replica", snippet: "replica", suspiciousLinks: [], hidden: true }] as never;

  test("spam on the site → clean it first (EN + ES)", () => {
    const input = inputWith({ spamSignals: spam }, { website: null, verifiedElsewhereUrl: "https://banhmiboy.example" });
    expect(reportTopTask([listingTask()], input, "en")?.action).toBe(
      "Check and clean your site first — it shows signs it may be hacked. Then add your website to your Google listing."
    );
    expect(reportTopTask([listingTask()], input, "es")?.action).toMatch(/^Primero revise y limpie su sitio — muestra señales de que puede haber sido hackeado\./);
  });

  test("a Safe Browsing flag does the same; a clean site gets the plain task", () => {
    const flagged = inputWith({ safeBrowsingThreat: { threatFound: true, threatTypes: ["MALWARE"] } }, { website: null, verifiedElsewhereUrl: "https://x.example" });
    expect(reportTopTask([listingTask()], flagged, "en")?.action).toMatch(/^Check and clean your site first/);
    const clean = inputWith({}, { website: null, verifiedElsewhereUrl: "https://x.example" });
    expect(reportTopTask([listingTask()], clean, "en")?.action).toBe("Add your website to your Google listing");
  });
});

describe("website pointer: no estimate when partly checked; whole points otherwise", () => {
  const pointer = (extras: ReportExtras, locale: Locale = "en") =>
    buildMonthlyReportContent(null, scoreRow(), null, null, locale, focus(locale), true, extras).focus.pointers.find((p) => p.kind === "website")?.text;

  test("partly checked → the note, no points (EN + ES)", () => {
    const extras: ReportExtras = { ...EMPTY_REPORT_EXTRAS, scoreBasis: 73, websiteImprovement: { score: 56, improvements: 1, points: 13.3 } };
    expect(pointer(extras)).toBe("Your website could only be partly checked (it blocks our automated check). See the Website page.");
    expect(pointer(extras, "es")).toBe("Su sitio web solo se pudo revisar en parte (bloquea nuestra revisión automática). Consulte la página Sitio web.");
  });

  test("fully checked → rounded to whole points", () => {
    expect(pointer({ ...EMPTY_REPORT_EXTRAS, websiteImprovement: { score: 83, improvements: 2, points: 4.6 } })).toContain("(up to about +5 pts)");
  });
});

describe("inbox preview text", () => {
  test("a long summary is cut at a whole fact — never a trailing ';'", () => {
    const first = "PostScore actualizó la forma en que calcula la puntuación desde su último informe, así que no es un cambio comparable — su puntuación ahora es 88 (B)";
    const text = inboxPreviewText(`${first}; 2 reseñas nuevas.`);
    expect(text).toBe(`${first}.`);
    expect(text.length).toBeLessThanOrEqual(150);
  });
  test("a short summary is unchanged; one oversized fact ends on a word with …", () => {
    expect(inboxPreviewText("Your score rose 2 points to 80; 2 new reviews.")).toBe("Your score rose 2 points to 80; 2 new reviews.");
    const long = inboxPreviewText("word ".repeat(60).trim() + ".");
    expect(long.endsWith("word…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(150);
  });
});

describe("html lang follows the business's language", () => {
  test("es → <html lang=\"es\">, en → lang=\"en\"", async () => {
    const content = buildMonthlyReportContent(null, scoreRow(), null, null, "es", focus("es"));
    const props = { businessName: "x", reportDate: "2026-10-01T00:00:00Z", content, unsubscribeUrl: "https://x" };
    expect(await render(<MonthlyReportEmail {...props} locale="es" />)).toMatch(/<html[^>]*lang="es"/);
    expect(await render(<MonthlyReportEmail {...props} locale="en" />)).toMatch(/<html[^>]*lang="en"/);
  });
});

describe("Day 16: 'See the Website page' is a real link (SITE_URL)", () => {
  const URL_ = "https://postscore.co/business/biz-1/website";
  async function html(content: MonthlyReportContent, locale: Locale, websitePageUrl: string | null) {
    return render(
      <MonthlyReportEmail
        businessName="Riverside Cafe"
        reportDate="2026-10-01T14:00:00.000Z"
        content={content}
        unsubscribeUrl="https://postscore.app/unsubscribe?business=x&token=y"
        locale={locale}
        websitePageUrl={websitePageUrl}
        testPreview
      />
    );
  }

  test("the website pointer and the hacked-site alert both link to the Website page — EN + ES", async () => {
    const input = inputWith({
      spamSignals: [{ category: "replica", matchedPhrase: "replica watches", snippet: "replica watches", suspiciousLinks: [], hidden: true } as never],
    });
    const extras: ReportExtras = { ...buildReportExtras(input, scoreBusiness(input)), websiteImprovement: { score: 72, improvements: 2, points: 3.5 } };
    for (const locale of ["en", "es"] as const) {
      const content = buildMonthlyReportContent(null, scoreRow({ breakdown: scoreBusiness(input) }), null, null, locale, focus(locale), true, extras);
      const out = decode(await html(content, locale, URL_));
      const phrase = locale === "en" ? "See the Website page" : "Consulte la página Sitio web";
      const links = out.match(new RegExp(`<a[^>]*href="${URL_}"[^>]*>${phrase}</a>`, "g")) ?? [];
      expect(links.length).toBe(2);
      // The sentence around it is unchanged.
      expect(visibleText(out)).toContain(locale === "en" ? `${phrase} for what we found and what to do` : `${phrase} para ver lo que encontramos y qué hacer`);
    }
  });

  test("no URL (previews) → plain words, no link; the cron passes the same SITE_URL link live and in testing mode", async () => {
    const extras: ReportExtras = { ...EMPTY_REPORT_EXTRAS, websiteImprovement: { score: 72, improvements: 2, points: 3.5 } };
    const content = buildMonthlyReportContent(null, scoreRow(), null, null, "en", focus("en"), true, extras);
    const out = decode(await html(content, "en", null));
    expect(out).toContain("See the Website page.");
    expect(out).not.toMatch(/<a[^>]*>See the Website page<\/a>/);
    const fs = await import("node:fs");
    const route = fs.readFileSync("app/api/cron/monthly-reports/route.ts", "utf8");
    expect(route).toContain("const websitePageUrl = `${siteUrl}/business/${businessId}/website`;");
    expect(route.match(/websitePageUrl \}\),/g)).toHaveLength(2);
  });
});
