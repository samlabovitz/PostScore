import { describe, expect, test } from "vitest";
import { gradeArticle, gradeTransitionLabel } from "./GrowthView";

describe("gradeArticle", () => {
  test("uses \"an\" before A, E, and F", () => {
    expect(gradeArticle("A")).toBe("an");
    expect(gradeArticle("E")).toBe("an");
    expect(gradeArticle("F")).toBe("an");
  });

  test("uses \"a\" before B, C, and D", () => {
    expect(gradeArticle("B")).toBe("a");
    expect(gradeArticle("C")).toBe("a");
    expect(gradeArticle("D")).toBe("a");
  });
});

describe("gradeTransitionLabel", () => {
  const grades = ["A", "B", "C", "D", "F"] as const;

  test.each(grades)("reads with the correct English article for grade %s", (grade) => {
    const label = gradeTransitionLabel(grade, grade, "en");
    const expectedArticle = ["A", "E", "F"].includes(grade) ? "an" : "a";
    expect(label).toBe(`Stays ${expectedArticle} ${grade}`);
  });

  test.each(grades)("reads correctly in Spanish for grade %s (no article needed)", (grade) => {
    const label = gradeTransitionLabel(grade, grade, "es");
    expect(label).toBe(`Se mantiene en ${grade}`);
  });

  test("a real grade change still renders as a plain arrow, unaffected by the article fix", () => {
    expect(gradeTransitionLabel("F", "B", "en")).toBe("F → B");
    expect(gradeTransitionLabel("F", "B", "es")).toBe("F → B");
  });
});
