// "Since your last scan" across a scoring update: the owner's changes first, PostScore's update second, and what
// couldn't be re-scored said plainly. Hair Express, Nov 25 (v1.17.0, 78) → Nov 27 (v1.18.0, 79), from the real saved
// category and check points.
import { describe, expect, test } from "vitest";
import { scoreMoves, splitScanChange, totalOf, VERSION_CHANGES } from "@/lib/scanSplit";
import { SCORING_VERSION } from "@/lib/scoring";

const cats = (vis: [number, number], comp: [number, number], web: [number, number]) => [
  { id: "visibility", weight: 40, earnedPoints: vis[0], possiblePoints: vis[1] },
  { id: "completeness", weight: 30, earnedPoints: comp[0], possiblePoints: comp[1] },
  { id: "website", weight: 30, earnedPoints: web[0], possiblePoints: web[1] },
];
const checks = (replies: number, speed: number | null) => [
  { id: "visibility.review_replies", category: "visibility", earnedPoints: replies, maxPoints: 6 },
  { id: "visibility.rating", category: "visibility", earnedPoints: 6, maxPoints: 6 },
  { id: "website.performance_mobile", category: "website", earnedPoints: speed, maxPoints: 3, meta: speed === null ? { seconds: "8.6", noScoreCause: "one_test" } : { method: "lab", seconds: "6.5", speedMetric: "speed_index" } },
  { id: "website.https", category: "website", earnedPoints: 5, maxPoints: 5 },
];
const NOV25 = { total: 78, scoring_version: "1.17.0", breakdown_json: { categories: cats([20.8, 40], [28, 30], [26.5, 27]), checks: checks(0, null) } };
const NOV27 = { total: 79, scoring_version: "1.18.0", breakdown_json: { categories: cats([24.6, 40], [28, 30], [26.5, 30]), checks: checks(3.8, 0) } };

describe("Hair Express, Nov 25 → Nov 27 (a scoring update between)", () => {
  test("+3.8 from the owner's changes (replies 0 → 3.8 / 6); −2.9 from PostScore's update; speed couldn't be re-scored", () => {
    const s = splitScanChange(NOV25, NOV27, false)!;
    expect(s.kind).toBe("split");
    if (s.kind !== "split") return;
    expect(s.moves).toEqual([{ id: "visibility.review_replies", from: 0, to: 3.8, max: 6 }]);
    expect(Math.round(s.yoursPoints * 10) / 10).toBe(3.8);
    expect(Math.round(s.versionPoints * 10) / 10).toBe(-2.9);
    expect(s.notRescored).toEqual(["website.performance_mobile"]);
    // The two parts are the whole move (from the category points).
    expect(s.yoursPoints + s.versionPoints).toBeCloseTo(totalOf(NOV27.breakdown_json as never) - totalOf(NOV25.breakdown_json as never), 6);
  });
  test("a speed result the earlier scan did score stands under v1.18.0 (re-scored, nothing to the update)", () => {
    const before = { ...NOV25, breakdown_json: { categories: cats([20.8, 40], [28, 30], [29.5, 30]), checks: checks(0, 3) } };
    const s = splitScanChange(before, NOV27, false)!;
    expect(s.kind === "split" && s.notRescored).toEqual([]);
    // Biggest move first: replies +3.8, then speed 3 → 0.
    expect(s.kind === "split" && s.moves.map((m) => m.id)).toEqual(["visibility.review_replies", "website.performance_mobile"]);
  });
});

describe("the other cases", () => {
  test("same version: every check that moved, and the total change", () => {
    const s = splitScanChange({ ...NOV25, scoring_version: "1.18.0" }, NOV27, true)!;
    expect(s.kind).toBe("same_version");
    expect(s.kind === "same_version" && s.yoursPoints).toBe(1);
    expect(s.kind === "same_version" && s.moves).toEqual([
      { id: "visibility.review_replies", from: 0, to: 3.8, max: 6 },
      { id: "website.performance_mobile", from: null, to: 0, max: 3 },
    ]);
  });
  test("a version that changed how a whole category adds up (or an unknown one): the per-check moves only", () => {
    expect(splitScanChange({ ...NOV25, scoring_version: "1.16.0" }, NOV27, false)!.kind).toBe("cant_rescore");
    expect(splitScanChange({ ...NOV25, scoring_version: "0.9.0" }, { ...NOV27, scoring_version: "9.9.9" }, false)!.kind).toBe("cant_rescore");
    expect(splitScanChange({ ...NOV25, breakdown_json: null }, NOV27, false)).toBeNull();
  });
  test("every scoring version is in the registry (a new version must say which checks it changed)", () => {
    expect(VERSION_CHANGES.some((v) => v.version === SCORING_VERSION)).toBe(true);
  });
});

describe("Gained and Lost: losses as clearly as gains (EN + ES)", () => {
  test("Hair Express: Gained +3.8 (replies 0 → 3.8 / 6), Lost −2.9 (speed now 0 / 3, started counting with the update); they add up to 78 → 79", () => {
    const m = scoreMoves(NOV25, NOV27, false)!;
    expect(m.moves.map((x) => [x.id, Math.round(x.impact * 10) / 10, x.byUpdate])).toEqual([
      ["visibility.review_replies", 3.8, false],
      ["website.performance_mobile", -2.9, true],
    ]);
    // The groups add up to the score change shown (78 → 79), allowing for the totals' rounding.
    expect(Math.abs(m.gained + m.lost - (NOV27.total - NOV25.total))).toBeLessThan(0.5);
  });
  test("the same on one version: every move, each with its effect; the groups add up", () => {
    const m = scoreMoves({ ...NOV25, scoring_version: "1.18.0" }, NOV27, true)!;
    expect(m.moves.every((x) => !x.byUpdate)).toBe(true);
    expect(Math.abs(m.gained + m.lost - (NOV27.total - NOV25.total))).toBeLessThan(0.5);
  });
  test("the card: both groups, old → new, why, 'Fix it' on a loss, the update's note on the speed row", async () => {
    const [{ renderToStaticMarkup }, { LocaleProvider }, { GainedLost }] = await Promise.all([import("react-dom/server"), import("@/lib/i18n"), import("@/components/overview/SinceLastScanCard")]);
    const moves = scoreMoves(NOV25, NOV27, false)!;
    const live = { checks: [{ id: "visibility.review_replies", label: "Replying to reviews", explanation: "You replied to 10 of your last 20 reviews (full credit at 80%).", earnedPoints: 3.8, maxPoints: 6 }, { id: "website.performance_mobile", label: "Loads in a reasonable time", explanation: "Your site takes about 6.5 seconds to load on phones.", earnedPoints: 0, maxPoints: 3 }] } as never;
    const html = (locale: "en" | "es") =>
      renderToStaticMarkup(
        <LocaleProvider locale={locale} timeZone="America/New_York">
          <GainedLost moves={moves} current={NOV27 as never} liveBreakdown={live} businessId="b1" />
        </LocaleProvider>
      );
    const plain = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    const en = plain(html("en"));
    expect(en).toContain("Gained +3.8");
    expect(en).toMatch(/Replying to reviews: 0 → 3\.8 \/ 6/);
    expect(en).toContain("You replied to 10 of your last 20 reviews");
    expect(en).toContain("Lost −2.9");
    expect(en).toMatch(/Loads in a reasonable time: now 0 \/ 3/);
    expect(en).toContain("Your site takes about 6.5 seconds to load on phones.");
    expect(en).toContain("Started counting with PostScore's scoring update.");
    const raw = html("en");
    expect(raw.slice(raw.indexOf('data-testid="since-lost"'))).toContain('data-testid="fix-button"');
    expect(raw.slice(raw.indexOf('data-testid="since-gained"'), raw.indexOf('data-testid="since-lost"'))).not.toContain('data-testid="fix-button"');
    const es = plain(html("es"));
    expect(es).toContain("Ganó +3.8");
    expect(es).toContain("Perdió −2.9");
    expect(es).toContain("Empezó a contar con la actualización de la puntuación de PostScore.");
  });
});
