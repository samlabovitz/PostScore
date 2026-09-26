import { describe, expect, test } from "vitest";
import { diffBreakdowns, resolveChangeDisplay } from "./scoreChanges";
import type { CheckResult, ScoreBreakdown } from "./scoring";

function fakeBreakdown(checks: CheckResult[]): ScoreBreakdown {
  return {
    scoringVersion: "test",
    total: 0,
    grade: "C",
    categories: [],
    checks,
  };
}

function fakeCheck(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id: "completeness.phone",
    label: "Phone number",
    category: "completeness",
    maxPoints: 10,
    earnedPoints: 10,
    confidence: "VERIFIED",
    explanation: "Stored English explanation from an old scan.",
    ...overrides,
  };
}

describe("resolveChangeDisplay", () => {
  test("a Spanish business with an English stored snapshot renders Spanish labels", () => {
    // The stored check (as if read straight off an old scores.breakdown_json
    // row saved before locale threading existed) is English throughout.
    const storedCheck = fakeCheck({
      id: "completeness.phone",
      label: "Phone number",
      explanation: "Stored English explanation from an old scan.",
    });
    // The live breakdown is what this page load actually computed, in the
    // business's real locale — a different explanation than the stored one,
    // proving it's genuinely read from here rather than the snapshot.
    const liveBreakdown = fakeBreakdown([
      fakeCheck({
        id: "completeness.phone",
        label: "Phone number",
        explanation: "Su número de teléfono está publicado y es correcto.",
      }),
    ]);

    const result = resolveChangeDisplay(storedCheck, liveBreakdown, "es");

    expect(result.label).toBe("Número de teléfono");
    expect(result.explanation).toBe("Su número de teléfono está publicado y es correcto.");
    // Never the stored English text.
    expect(result.label).not.toBe("Phone number");
    expect(result.explanation).not.toBe("Stored English explanation from an old scan.");
  });

  test("an unknown check id falls back to the stored label and explanation", () => {
    // A retired/renamed check id that CHECKS no longer defines, and that
    // this run's live breakdown also doesn't contain — both lookups miss,
    // so both fall back honestly to whatever was actually stored.
    const storedCheck = fakeCheck({
      id: "retired.some_old_check",
      label: "Some Old Check",
      explanation: "This check no longer exists in the current scoring engine.",
    });
    const liveBreakdown = fakeBreakdown([fakeCheck({ id: "completeness.phone" })]);

    const result = resolveChangeDisplay(storedCheck, liveBreakdown, "es");

    expect(result.label).toBe("Some Old Check");
    expect(result.explanation).toBe("This check no longer exists in the current scoring engine.");
  });

  test("a known check id whose live breakdown doesn't include it still gets a fresh label, but the stored explanation", () => {
    const storedCheck = fakeCheck({
      id: "completeness.phone",
      label: "Phone number",
      explanation: "Stored English explanation.",
    });
    // Live breakdown genuinely has no entry for this id this run (e.g. it
    // was excluded) — label still re-resolves (id is still valid), but
    // explanation has nothing live to read, so it falls back to stored.
    const liveBreakdown = fakeBreakdown([]);

    const result = resolveChangeDisplay(storedCheck, liveBreakdown, "es");

    expect(result.label).toBe("Número de teléfono");
    expect(result.explanation).toBe("Stored English explanation.");
  });

  test("English locale renders byte-identical to the stored label when the key resolves", () => {
    const storedCheck = fakeCheck({ id: "completeness.phone", label: "Phone number" });
    const liveBreakdown = fakeBreakdown([
      fakeCheck({ id: "completeness.phone", explanation: "Your phone number is on file and correct." }),
    ]);

    const result = resolveChangeDisplay(storedCheck, liveBreakdown, "en");

    expect(result.label).toBe("Phone number");
    expect(result.explanation).toBe("Your phone number is on file and correct.");
  });
});

describe("diffBreakdowns", () => {
  test("only includes checks whose earned points or confidence actually changed", () => {
    const previous = fakeBreakdown([
      fakeCheck({ id: "a", earnedPoints: 5, confidence: "VERIFIED" }),
      fakeCheck({ id: "b", earnedPoints: 5, confidence: "VERIFIED" }),
    ]);
    const current = fakeBreakdown([
      fakeCheck({ id: "a", earnedPoints: 8, confidence: "VERIFIED" }),
      fakeCheck({ id: "b", earnedPoints: 5, confidence: "VERIFIED" }),
    ]);

    const changes = diffBreakdowns(previous, current);

    expect(changes).toHaveLength(1);
    expect(changes[0].check.id).toBe("a");
    expect(changes[0].fromPoints).toBe(5);
    expect(changes[0].toPoints).toBe(8);
  });

  test("sorts by the size of the point change, biggest first", () => {
    const previous = fakeBreakdown([
      fakeCheck({ id: "small", earnedPoints: 5, confidence: "VERIFIED" }),
      fakeCheck({ id: "big", earnedPoints: 0, confidence: "VERIFIED" }),
    ]);
    const current = fakeBreakdown([
      fakeCheck({ id: "small", earnedPoints: 6, confidence: "VERIFIED" }),
      fakeCheck({ id: "big", earnedPoints: 10, confidence: "VERIFIED" }),
    ]);

    const changes = diffBreakdowns(previous, current);

    expect(changes.map((c) => c.check.id)).toEqual(["big", "small"]);
  });

  test("skips a check id that doesn't exist in the previous snapshot", () => {
    const previous = fakeBreakdown([]);
    const current = fakeBreakdown([fakeCheck({ id: "new-check" })]);

    expect(diffBreakdowns(previous, current)).toEqual([]);
  });
});
