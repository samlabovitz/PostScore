import { describe, expect, test } from "vitest";
import { sanitizeApiKey } from "./anthropicClient";

describe("sanitizeApiKey", () => {
  test("leaves an already-clean key unchanged", () => {
    expect(sanitizeApiKey("sk-ant-realkeyvalue")).toBe("sk-ant-realkeyvalue");
  });

  test("trims leading/trailing whitespace", () => {
    expect(sanitizeApiKey("  sk-ant-realkeyvalue  ")).toBe("sk-ant-realkeyvalue");
  });

  test("trims a trailing newline (e.g. from a .env file with no final newline stripped)", () => {
    expect(sanitizeApiKey("sk-ant-realkeyvalue\n")).toBe("sk-ant-realkeyvalue");
  });

  test("strips a matching pair of straight double quotes", () => {
    expect(sanitizeApiKey('"sk-ant-realkeyvalue"')).toBe("sk-ant-realkeyvalue");
  });

  test("strips a matching pair of straight single quotes", () => {
    expect(sanitizeApiKey("'sk-ant-realkeyvalue'")).toBe("sk-ant-realkeyvalue");
  });

  test("strips surrounding quotes AND outer whitespace together", () => {
    expect(sanitizeApiKey('  "sk-ant-realkeyvalue"  ')).toBe("sk-ant-realkeyvalue");
  });

  test("strips quotes with inner whitespace between the quote and the key", () => {
    expect(sanitizeApiKey('" sk-ant-realkeyvalue "')).toBe("sk-ant-realkeyvalue");
  });

  test("does NOT strip a single, unmatched leading quote — never guesses at a malformed value", () => {
    expect(sanitizeApiKey('"sk-ant-realkeyvalue')).toBe('"sk-ant-realkeyvalue');
  });

  test("does NOT strip mismatched quote characters (one double, one single)", () => {
    expect(sanitizeApiKey("\"sk-ant-realkeyvalue'")).toBe("\"sk-ant-realkeyvalue'");
  });

  test("never strips a quote character that's genuinely part of the key, since real keys only ever get wrapped as a matching pair at the very ends", () => {
    expect(sanitizeApiKey("sk-ant-real'keyvalue")).toBe("sk-ant-real'keyvalue");
  });
});
