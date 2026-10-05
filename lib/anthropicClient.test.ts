import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AnthropicApiError, callAnthropicChat, sanitizeApiKey, trimToLastCompleteSentence } from "./anthropicClient";

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

  test("a real reply cut off by max_tokens is trimmed back to its last complete sentence before being returned", async () => {
    mockFetchOnce(
      200,
      {},
      {
        type: "message",
        stop_reason: "max_tokens",
        content: [
          {
            type: "text",
            text: "Share your review link with 3 or more happy customers. Each fresh review strengthens your credibility. Your weekly rout",
          },
        ],
      }
    );

    const reply = await callAnthropicChat({ system: "s", messages: [{ role: "user", content: "hi" }] });
    expect(reply).toBe(
      "Share your review link with 3 or more happy customers. Each fresh review strengthens your credibility."
    );
    expect(reply.endsWith("Your weekly rout")).toBe(false);
  });

  test("a reply that finishes naturally (stop_reason end_turn) is returned exactly as-is, even if it would look trimmable", async () => {
    mockFetchOnce(
      200,
      {},
      {
        type: "message",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Your rating is 4.5 stars from 58 reviews" }],
      }
    );

    const reply = await callAnthropicChat({ system: "s", messages: [{ role: "user", content: "hi" }] });
    expect(reply).toBe("Your rating is 4.5 stars from 58 reviews");
  });
});

describe("trimToLastCompleteSentence", () => {
  test("cuts a reply back to the last full sentence, dropping a trailing partial one", () => {
    expect(trimToLastCompleteSentence("First sentence. Second sentence. Third partial cla")).toBe(
      "First sentence. Second sentence."
    );
  });

  test("keeps a trailing closing character (quote, parenthesis, or markdown bold marker) right after the sentence end", () => {
    expect(trimToLastCompleteSentence('He said "stop." Then he le')).toBe('He said "stop."');
    expect(trimToLastCompleteSentence("Check the Pricing page (it's free.) Then do mo")).toBe(
      "Check the Pricing page (it's free.)"
    );
    expect(trimToLastCompleteSentence("Go to the **Pricing page.** Then conti")).toBe("Go to the **Pricing page.**");
  });

  test("an earlier decimal number doesn't get mistaken for the cutoff point — the LAST real sentence end wins", () => {
    expect(trimToLastCompleteSentence("That's worth 4.2 points. The next step is unfinis")).toBe(
      "That's worth 4.2 points."
    );
  });

  test("a reply with no sentence-ending punctuation at all is returned unchanged rather than emptied out", () => {
    expect(trimToLastCompleteSentence("This never reaches a real sentence end at all")).toBe(
      "This never reaches a real sentence end at all"
    );
  });

  test("a fully complete reply is returned unchanged", () => {
    expect(trimToLastCompleteSentence("A complete answer with no cutoff.")).toBe("A complete answer with no cutoff.");
  });

  test("trims trailing whitespace even on an otherwise-complete reply", () => {
    expect(trimToLastCompleteSentence("Complete sentence.   \n")).toBe("Complete sentence.");
  });
});
