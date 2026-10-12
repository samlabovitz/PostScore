import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { categoryCheckCoverage, type CategoryResult, type CheckResult } from "@/lib/scoring";
import { WebsiteCoverageNote } from "./WebsiteCoverageNote";

const check = (id: string, earned: number | null, unreachable = earned === null): CheckResult => ({
  id,
  label: id,
  category: "website",
  maxPoints: 1,
  earnedPoints: earned,
  confidence: earned === null ? "NOT_FOUND" : "VERIFIED",
  explanation: "",
  meta: null,
  ...(earned === null && unreachable ? { excludedReason: "unreachable" as const } : {}),
});
const category = (checks: CheckResult[], id: CategoryResult["id"] = "website"): CategoryResult => ({
  id,
  label: "Website",
  weight: 30,
  possiblePoints: 1,
  earnedPoints: 1,
  relativeScore: 100,
  checks,
});
const render = (c: CategoryResult, locale: "en" | "es" = "en", hasWebsite = true) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <WebsiteCoverageNote category={c} hasWebsite={hasWebsite} />
    </LocaleProvider>
  ).replace(/&#x27;/g, "'");

describe("Partly checked Website score (Step 2d)", () => {
  const wonderLike = category([check("a", 4), check("b", 4), ...Array.from({ length: 11 }, (_, i) => check(`x${i}`, null))]);
  test("counts only real, scored checks", () => {
    expect(categoryCheckCoverage(wonderLike)).toEqual({ checked: 2, total: 13, unreachable: 11 });
  });
  test("EN + ES label when some checks couldn't be checked", () => {
    expect(render(wonderLike)).toContain("Based on 2 of 13 website checks — the rest couldn't be checked.");
    expect(render(wonderLike, "es")).toContain("Basado en 2 de 13 comprobaciones del sitio web — el resto no se pudo verificar.");
  });
  test("nothing for a fully checked Website, or another category", () => {
    expect(render(category([check("a", 1), check("b", 0)]))).toBe("");
    expect(render(category([check("a", 1), check("b", null)], "visibility"))).toBe("");
  });
});

test("a business with no website never shows it (its other checks don't apply)", () => {
  const noSite = category([check("website.has_website", 0), ...Array.from({ length: 11 }, (_, i) => check(`x${i}`, null))]);
  expect(render(noSite, "en", false)).toBe("");
});

test("'not checked yet' / 'nothing to compare' exclusions never show the note", () => {
  const c = category([check("a", 4), check("b", 1), check("website.social_links", null, false), check("website.info_consistency", null, false)]);
  expect(categoryCheckCoverage(c)).toEqual({ checked: 2, total: 2, unreachable: 0 });
  expect(render(c)).toBe("");
});

test("total counts only reached + unreachable checks", () => {
  const c = category([check("a", 1), check("b", null), check("website.social_links", null, false)]);
  expect(render(c)).toContain("Based on 1 of 2 website checks");
});
