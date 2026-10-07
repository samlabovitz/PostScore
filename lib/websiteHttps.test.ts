import { describe, expect, test, vi } from "vitest";
import { checkWebsiteHttps } from "./websiteHttps";

function fakeResponse(ok: boolean, finalUrl: string, status = ok ? 200 : 500, body = ""): Response {
  return { ok, url: finalUrl, status, text: async () => body } as Response;
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
});
