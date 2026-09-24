import { describe, expect, test } from "vitest";
import { messages } from "./messages";

describe("messages: every en key has a real es value", () => {
  // This is the guardrail the whole bilingual rollout depends on: a
  // MessageKey with an en value but no es value doesn't error — t()
  // silently falls back to English (see t()'s own doc comment) — so a
  // missing Spanish translation would otherwise ship unnoticed. Failing
  // the build here is the only thing that makes that impossible.
  const missing = Object.keys(messages.en).filter(
    (key) => !(key in messages.es)
  );

  test("no MessageKey is missing its Spanish translation", () => {
    expect(missing).toEqual([]);
  });

  test("every es value is a real, non-empty string", () => {
    const empty = Object.entries(messages.es)
      .filter(([, value]) => typeof value !== "string" || value.trim().length === 0)
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });
});
