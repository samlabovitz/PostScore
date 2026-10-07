import { describe, expect, test, vi } from "vitest";
import { checkWebsiteHttps } from "./websiteHttps";

function fakeResponse(ok: boolean, finalUrl: string, status = ok ? 200 : 500, body = ""): Response {
  return { ok, url: finalUrl, status, text: async () => body } as Response;
}

function abortError(): Error {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  return err;
}

describe("checkWebsiteHttps", () => {
  test("a working https:// endpoint returns 'https'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(true, "https://example.com/"));
    const result = await checkWebsiteHttps("https://example.com", fetchImpl);
    expect(result).toEqual({ status: "https", reason: null });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("THE BUG THIS FIXES: Google lists http://, but the real site redirects to https:// — correctly scores as secure", async () => {
    // The direct https:// upgrade attempt succeeds, so this is detected
    // as secure even though the saved URL string says http://.
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(true, "https://example.com/"));
    const result = await checkWebsiteHttps("http://example.com", fetchImpl);
    expect(result).toEqual({ status: "https", reason: null });
    // Confirms it actually tried the upgraded https:// URL, not the
    // http:// one the site was saved with.
    expect(fetchImpl).toHaveBeenCalledWith("https://example.com", expect.anything());
  });

  test("a bare domain with no scheme at all is still tried as https:// first", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(true, "https://example.com/"));
    const result = await checkWebsiteHttps("example.com", fetchImpl);
    expect(result).toEqual({ status: "https", reason: null });
    expect(fetchImpl).toHaveBeenCalledWith("https://example.com", expect.anything());
  });

  test("https fails but http works: confirmed http-only", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("TLS handshake failed"))
      .mockResolvedValueOnce(fakeResponse(true, "http://example.com/"));
    const result = await checkWebsiteHttps("http://example.com", fetchImpl);
    expect(result).toEqual({ status: "http_only", reason: null });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("a plain http:// request that itself redirects to https:// still counts as confirmed https", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce(fakeResponse(true, "https://example.com/"));
    const result = await checkWebsiteHttps("http://example.com", fetchImpl);
    expect(result).toEqual({ status: "https", reason: null });
  });

  test("both attempts fail (timeout/network error): unreachable with reason 'down', never assumed http-only", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timed out"));
    const result = await checkWebsiteHttps("http://example.com", fetchImpl);
    expect(result).toEqual({ status: "unreachable", reason: "down" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("a non-2xx/3xx response on both attempts is unreachable with reason 'http_error', not http_only", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(false, "http://example.com/", 500));
    const result = await checkWebsiteHttps("http://example.com", fetchImpl);
    expect(result).toEqual({ status: "unreachable", reason: "http_error" });
  });

  test("a 403/503 bot-block response on both attempts is unreachable with reason 'blocked_automated_check'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(false, "http://example.com/", 403));
    const result = await checkWebsiteHttps("http://example.com", fetchImpl);
    expect(result).toEqual({ status: "unreachable", reason: "blocked_automated_check" });
  });

  test("a bot-challenge page body (200 but 'Just a moment...') is unreachable with reason 'blocked_automated_check'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(false, "http://example.com/", 200, "<title>Just a moment...</title>"));
    const result = await checkWebsiteHttps("http://example.com", fetchImpl);
    expect(result).toEqual({ status: "unreachable", reason: "blocked_automated_check" });
  });

  test("when the two real attempts disagree, the more specific/actionable reason wins (blocked over down)", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection refused")) // https attempt: down
      .mockResolvedValueOnce(fakeResponse(false, "http://example.com/", 403)); // http attempt: blocked
    const result = await checkWebsiteHttps("http://example.com", fetchImpl);
    expect(result).toEqual({ status: "unreachable", reason: "blocked_automated_check" });
  });

  test("an empty website string is unreachable (reason 'down') without making any request", async () => {
    const fetchImpl = vi.fn();
    const result = await checkWebsiteHttps("   ", fetchImpl);
    expect(result).toEqual({ status: "unreachable", reason: "down" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  describe("Day 4 Task: 'timed_out' vs 'down' split (Colorful Yun Nan case)", () => {
    test("an AbortError (our own timeout) is reported as 'timed_out', never 'down' — after retrying once on each scheme", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(abortError());
      const result = await checkWebsiteHttps("http://example.com", fetchImpl);
      expect(result).toEqual({ status: "unreachable", reason: "timed_out" });
      // 2 attempts per scheme (https then http) x 2 schemes = 4.
      expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    test("a real connection error (not AbortError) is still 'down' and is never retried", async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
      const result = await checkWebsiteHttps("http://example.com", fetchImpl);
      expect(result).toEqual({ status: "unreachable", reason: "down" });
      // 1 attempt per scheme (no retry on a non-timeout failure) x 2 schemes = 2.
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test("a timeout on the first attempt that then succeeds on retry counts as reachable", async () => {
      const fetchImpl = vi.fn().mockRejectedValueOnce(abortError()).mockResolvedValueOnce(fakeResponse(true, "https://example.com/"));
      const result = await checkWebsiteHttps("https://example.com", fetchImpl);
      expect(result).toEqual({ status: "https", reason: null });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test("when the two schemes disagree between 'timed_out' and 'down', 'down' wins (it's more specific/actionable)", async () => {
      const fetchImpl = vi
        .fn()
        .mockRejectedValueOnce(abortError()) // https attempt 1: timed out
        .mockRejectedValueOnce(abortError()) // https attempt 2 (retry): timed out
        .mockRejectedValueOnce(new Error("connection refused")); // http attempt: down, no retry
      const result = await checkWebsiteHttps("http://example.com", fetchImpl);
      expect(result).toEqual({ status: "unreachable", reason: "down" });
    });
  });
});
