import { describe, expect, test, vi } from "vitest";
import { checkWebsiteHttps } from "./websiteHttps";

function fakeResponse(ok: boolean, finalUrl: string): Response {
  return { ok, url: finalUrl } as Response;
}

describe("checkWebsiteHttps", () => {
  test("a working https:// endpoint returns 'https'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(true, "https://example.com/"));
    const result = await checkWebsiteHttps("https://example.com", fetchImpl);
    expect(result).toBe("https");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("THE BUG THIS FIXES: Google lists http://, but the real site redirects to https:// — correctly scores as secure", async () => {
    // The direct https:// upgrade attempt succeeds, so this is detected
    // as secure even though the saved URL string says http://.
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(true, "https://example.com/"));
    const result = await checkWebsiteHttps("http://example.com", fetchImpl);
    expect(result).toBe("https");
    // Confirms it actually tried the upgraded https:// URL, not the
    // http:// one the site was saved with.
    expect(fetchImpl).toHaveBeenCalledWith("https://example.com", expect.anything());
  });

  test("a bare domain with no scheme at all is still tried as https:// first", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(true, "https://example.com/"));
    const result = await checkWebsiteHttps("example.com", fetchImpl);
    expect(result).toBe("https");
    expect(fetchImpl).toHaveBeenCalledWith("https://example.com", expect.anything());
  });

  test("https fails but http works: confirmed http-only", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("TLS handshake failed"))
      .mockResolvedValueOnce(fakeResponse(true, "http://example.com/"));
    const result = await checkWebsiteHttps("http://example.com", fetchImpl);
    expect(result).toBe("http_only");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("a plain http:// request that itself redirects to https:// still counts as confirmed https", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce(fakeResponse(true, "https://example.com/"));
    const result = await checkWebsiteHttps("http://example.com", fetchImpl);
    expect(result).toBe("https");
  });

  test("both attempts fail (timeout/network error): unreachable, never assumed http-only", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timed out"));
    const result = await checkWebsiteHttps("http://example.com", fetchImpl);
    expect(result).toBe("unreachable");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("a non-2xx/3xx response on both attempts is unreachable, not http_only", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(false, "http://example.com/"));
    const result = await checkWebsiteHttps("http://example.com", fetchImpl);
    expect(result).toBe("unreachable");
  });

  test("an empty website string is unreachable without making any request", async () => {
    const fetchImpl = vi.fn();
    const result = await checkWebsiteHttps("   ", fetchImpl);
    expect(result).toBe("unreachable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
