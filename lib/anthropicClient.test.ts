import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AnthropicApiError, callAnthropicChat, sanitizeApiKey } from "./anthropicClient";

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

describe("callAnthropicChat — failure shape (AnthropicApiError)", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-for-unit-tests";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  function mockFetchOnce(status: number, headers: Record<string, string>, bodyJson: unknown) {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(bodyJson), { status, headers })
    ) as unknown as typeof fetch;
  }

  test("a 401 (invalid x-api-key) throws AnthropicApiError with status 401 and the API's own error type", async () => {
    mockFetchOnce(
      401,
      { "request-id": "req_test_401_abc123" },
      { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }
    );

    await expect(callAnthropicChat({ system: "s", messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject(
      {
        status: 401,
        errorType: "authentication_error",
        requestId: "req_test_401_abc123",
      }
    );
  });

  test("a 429 (rate limited) throws AnthropicApiError with status 429, distinguishable from a 401", async () => {
    mockFetchOnce(
      429,
      { "request-id": "req_test_429_xyz789" },
      { type: "error", error: { type: "rate_limit_error", message: "rate limit exceeded" } }
    );

    let caught: unknown;
    try {
      await callAnthropicChat({ system: "s", messages: [{ role: "user", content: "hi" }] });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AnthropicApiError);
    expect((caught as AnthropicApiError).status).toBe(429);
    expect((caught as AnthropicApiError).status).not.toBe(401);
  });

  test("the thrown error carries the real request-id and raw body for server-side logging, separate from the status used to pick the owner-facing message", async () => {
    mockFetchOnce(
      401,
      { "request-id": "req_test_log_me" },
      { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }
    );

    try {
      await callAnthropicChat({ system: "s", messages: [{ role: "user", content: "hi" }] });
      throw new Error("expected callAnthropicChat to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(AnthropicApiError);
      const apiErr = err as AnthropicApiError;
      // Real technical detail IS captured here (for server-side
      // logging only — see sendAssistantMessage in
      // app/actions/assistant.ts, which logs these fields and never
      // forwards them to the owner).
      expect(apiErr.requestId).toBe("req_test_log_me");
      expect(apiErr.message).toContain("401");
      // But the status — the ONLY field anthropicFailureMessage
      // (lib/assistant.ts) ever reads — is available as its own typed
      // field, not something a caller has to parse out of .message.
      expect(apiErr.status).toBe(401);
    }
  });

  test("gracefully handles a non-JSON error body (e.g. an upstream proxy error page) — status is still real, errorType is honestly null", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("<html>502 Bad Gateway</html>", { status: 502, headers: {} })
    ) as unknown as typeof fetch;

    await expect(callAnthropicChat({ system: "s", messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject(
      {
        status: 502,
        errorType: null,
      }
    );
  });
});
