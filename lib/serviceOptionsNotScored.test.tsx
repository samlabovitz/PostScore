import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "fs";

vi.mock("server-only", () => ({}));

// Nov 10 change of plan: Google's takeout / delivery / curbside / dine-in
// flags are saved and SHOWN (the Completeness card's info line) — never
// scored, for owners or competitors. The Premium editor keeps its "How can
// customers get your food?" group when Google offers it.

import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { CHECKS_V112, SCORING_VERSION, checksFor, scoreBusiness } from "@/lib/scoring";
import { customerDetailsEditorRows, partOfAttribute, PART_ORDER } from "@/lib/gbpAttributes";
import { t } from "@/lib/i18n";

describe("service options: shown, never scored", () => {
  test("no “Takeout & delivery on Google” check in any version", () => {
    expect(SCORING_VERSION).toBe("1.15.0");
    expect(checksFor(SCORING_VERSION)).toBe(CHECKS_V112);
    expect(checksFor(SCORING_VERSION).some((c) => c.id === "completeness.order_options")).toBe(false);
    expect(scoreBusiness(scoringInput()).checks.some((c) => c.id === "completeness.order_options")).toBe(false);
  });

  test("scoring and competitor scoring never read them", () => {
    for (const f of ["lib/scoring.ts", "lib/competitorFullScoring.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/serviceOptions|service_options|takeout|curbside/i);
    const competitors = readFileSync("lib/competitors.ts", "utf8");
    const row = competitors.slice(competitors.indexOf("function placeDetailsToScoringRow"), competitors.indexOf("function placeDetailsToScoringRow") + 1500);
    expect(row).not.toContain("google_service_options");
  });

  test("the Premium editor keeps the group — only when Google offers it — and it marks no task", () => {
    expect(PART_ORDER).toContain("service");
    expect(partOfAttribute("attributes/has_takeout")).toBe("service");
    expect(customerDetailsEditorRows([{ parent: "attributes/has_delivery", valueType: "BOOL", displayName: "Delivery" }] as never, []).map((r) => r.part)).toEqual(["service"]);
    expect(customerDetailsEditorRows([], []).some((r) => r.part === "service")).toBe(false);
    expect(t("es", "dashboard.gbpEdit.group.service")).toBe("¿Cómo pueden obtener su comida los clientes? Elija todas las que correspondan");
    const action = readFileSync("app/actions/gbpCustomerDetails.ts", "utf8");
    expect(action).not.toContain("completeness.order_options");
    expect(action).toContain('c.part !== "service"');
  });
});
