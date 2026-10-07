import { describe, expect, test, vi } from "vitest";
import { captureScreenshotBytes, captureWebsiteScreenshots, fetchMobilePerformance, fetchWebsiteHtml } from "./websiteAnalysis";

// Day 3b: the real measurement behind website.performance_mobile — see
// fetchMobilePerformance's own doc for the method order (URL-level field
// data, then origin-level field data, then a median-of-3 lab fallback)
// this suite pins down. Every test drives fetchMobilePerformance through
// its injectable `fetchImpl` param, never a real network call.

// Status defaults to 404 (non-retryable) rather than 500 when ok=false
// — most existing fixtures in this file just want "a failed response,
// resolved once, no retry," and 500/429 are now retryable (Day 4 Part
// 3a), which would otherwise introduce a real PAGESPEED_RETRY_DELAY_MS
// wait into tests that don't care about retry behavior at all.
function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 404): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

/** A real AbortError, same as what fetch throws when its AbortSignal
 * fires on timeout — distinguishing this from any other thrown error is
 * exactly what lets fetchPageSpeedRunOnce report "timed_out" instead of
 * the generic "error" (Day 4 Part 3a). */
function abortError(): Error {
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}

function labBody(score: number): unknown {
  return { lighthouseResult: { categories: { performance: { score: score / 100 } } } };
}

function fieldBody(opts: { url?: string; origin?: string; labScore?: number } = {}): unknown {
  return {
    ...(labBody(opts.labScore ?? 50) as object),
    ...(opts.url ? { loadingExperience: { overall_category: opts.url } } : {}),
    ...(opts.origin ? { originLoadingExperience: { overall_category: opts.origin } } : {}),
  };
}

describe("fetchMobilePerformance: method order a) URL field -> b) origin field -> c) lab median", () => {
  test("a) uses URL-level field data when present, even if origin-level disagrees — 1 call total", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fieldBody({ url: "FAST", origin: "SLOW" })));

    const result = await fetchMobilePerformance("example.com", "key", undefined, fetchImpl as unknown as typeof fetch);

    expect(result.measurement).toEqual({ method: "field", fieldCategory: "FAST", labScore: null });
    expect(result.callCount).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("b) falls back to origin-level field data when the URL has none — still 1 call total", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fieldBody({ origin: "AVERAGE" })));

    const result = await fetchMobilePerformance("example.com", "key", undefined, fetchImpl as unknown as typeof fetch);

    expect(result.measurement).toEqual({ method: "field", fieldCategory: "AVERAGE", labScore: null });
    expect(result.callCount).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('"NONE"/malformed field categories are treated as absent, not a real classification', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fieldBody({ url: "NONE", labScore: 90 })));

    const result = await fetchMobilePerformance("example.com", "key", undefined, fetchImpl as unknown as typeof fetch);

    // No real field data at either level -> falls through to the lab
    // median fallback (3 calls), never trusting "NONE" as a category.
    expect(result.measurement?.method).toBe("lab");
    expect(result.callCount).toBe(3);
  });

  test("c) falls back to the median of 3 lab runs when neither level has field data", async () => {
    const scores = [40, 70, 55]; // sorted: 40, 55, 70 -> median 55
    let call = 0;
    const fetchImpl = vi.fn(async () => jsonResponse(labBody(scores[call++])));

    const result = await fetchMobilePerformance("example.com", "key", undefined, fetchImpl as unknown as typeof fetch);

    expect(result.measurement).toEqual({ method: "lab", fieldCategory: null, labScore: 55 });
    expect(result.callCount).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("median of an even number of successful lab runs (one of 3 failed) averages the two middle values", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      if (call === 2) return jsonResponse({}, false); // the second run fails outright
      return jsonResponse(labBody(call === 1 ? 60 : 80));
    });

    const result = await fetchMobilePerformance("example.com", "key", undefined, fetchImpl as unknown as typeof fetch);

    expect(result.measurement).toEqual({ method: "lab", fieldCategory: null, labScore: 70 });
    expect(result.callCount).toBe(3);
  });
});

describe("fetchMobilePerformance: couldn't verify", () => {
  test("null measurement when every attempt fails (no field data, all 3 lab runs fail) — reports the real http_error status", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 404));

    const result = await fetchMobilePerformance("example.com", "key", undefined, fetchImpl as unknown as typeof fetch);

    expect(result.measurement).toBeNull();
    expect(result.callCount).toBe(3);
    expect(result.failureReason).toEqual({ kind: "http_error", status: 404 });
  });

  test("no measurement and zero calls when no website is given — no failure reason, since nothing was even attempted", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(labBody(90)));

    const noWebsite = await fetchMobilePerformance("", "key", undefined, fetchImpl as unknown as typeof fetch);

    expect(noWebsite.measurement).toBeNull();
    expect(noWebsite.callCount).toBe(0);
    expect(noWebsite.failureReason).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("Day 4 Part 3a: no PAGESPEED_API_KEY configured reports failureReason 'no_api_key', zero calls made", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(labBody(90)));

    const noKey = await fetchMobilePerformance("example.com", undefined, undefined, fetchImpl as unknown as typeof fetch);

    expect(noKey.measurement).toBeNull();
    expect(noKey.callCount).toBe(0);
    expect(noKey.failureReason).toEqual({ kind: "no_api_key", status: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("fetchMobilePerformance: Day 4 Part 3a retry on timeout, 429, and 5xx", () => {
  test("a real timeout (AbortError) is retried once and reports 'timed_out' if it never recovers", async () => {
    const fetchImpl = vi.fn(async () => {
      throw abortError();
    });

    const result = await fetchMobilePerformance("example.com", "key", undefined, fetchImpl as unknown as typeof fetch);

    expect(result.measurement).toBeNull();
    expect(result.failureReason).toEqual({ kind: "timed_out", status: null });
    // 3 logical runs (first + 2 lab fallback), each internally retried
    // once (2 real attempts) = 6 raw fetchImpl calls.
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  }, 10000);

  test("a 429 is retried and succeeds on the second attempt — never collapses to a permanent failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 429))
      .mockResolvedValue(jsonResponse(labBody(80)));

    const result = await fetchMobilePerformance("example.com", "key", undefined, fetchImpl as unknown as typeof fetch);

    expect(result.measurement).toEqual({ method: "lab", fieldCategory: null, labScore: 80 });
    expect(result.failureReason).toBeNull();
  }, 10000);

  test("a 500 is retried and succeeds on the second attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 500))
      .mockResolvedValue(jsonResponse(labBody(80)));

    const result = await fetchMobilePerformance("example.com", "key", undefined, fetchImpl as unknown as typeof fetch);

    expect(result.measurement).toEqual({ method: "lab", fieldCategory: null, labScore: 80 });
  }, 10000);

  test("a 400 (non-retryable) is NOT retried — one call, immediate http_error", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 400));

    const result = await fetchMobilePerformance("example.com", "key", undefined, fetchImpl as unknown as typeof fetch);

    expect(result.measurement).toBeNull();
    expect(result.failureReason).toEqual({ kind: "http_error", status: 400 });
    // 3 logical runs x 1 raw attempt each (no retry) = 3.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("when attempts disagree on failure kind, the real http_error status wins over a timeout", async () => {
    // first run: times out on both its own internal attempts -> timed_out
    // second/third (parallel lab fallback): both come back with a real
    // 503 -> http_error. The more diagnostic http_error should win.
    let callNum = 0;
    const fetchImpl = vi.fn(async () => {
      callNum++;
      if (callNum <= 2) throw abortError(); // first run's own 2 attempts
      return jsonResponse({}, false, 503);
    });

    const result = await fetchMobilePerformance("example.com", "key", undefined, fetchImpl as unknown as typeof fetch);

    expect(result.measurement).toBeNull();
    expect(result.failureReason?.kind).toBe("http_error");
    expect(result.failureReason?.status).toBe(503);
  }, 10000);
});

describe("fetchWebsiteHtml: Day 4 Part 3b real reachability reasons", () => {
  test("a real HTML fetch success returns the html with no failure reason", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("<html>hi</html>").buffer,
    })) as unknown as typeof fetch;

    const result = await fetchWebsiteHtml("example.com", fetchImpl);

    expect(result.html).toContain("hi");
    expect(result.failureReason).toBeNull();
  });

  test("both schemes throwing (DNS/connection failure) reports 'down'", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;

    const result = await fetchWebsiteHtml("example.com", fetchImpl);

    expect(result.html).toBeNull();
    expect(result.failureReason).toBe("down");
  });

  test("a 403 on both schemes reports 'blocked_automated_check'", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    })) as unknown as typeof fetch;

    const result = await fetchWebsiteHtml("example.com", fetchImpl);

    expect(result.html).toBeNull();
    expect(result.failureReason).toBe("blocked_automated_check");
  });

  test("a 500 on both schemes reports 'http_error'", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    })) as unknown as typeof fetch;

    const result = await fetchWebsiteHtml("example.com", fetchImpl);

    expect(result.html).toBeNull();
    expect(result.failureReason).toBe("http_error");
  });

  test("an empty website string reports 'down' without making any request", async () => {
    const fetchImpl = vi.fn();

    const result = await fetchWebsiteHtml("   ", fetchImpl as unknown as typeof fetch);

    expect(result.html).toBeNull();
    expect(result.failureReason).toBe("down");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("fetchWebsiteHtml: Day 4 Task 'timed_out' vs 'down' split (Colorful Yun Nan case)", () => {
  test("an AbortError (our own timeout) reports 'timed_out', never 'down' — after retrying once per scheme", async () => {
    const fetchImpl = vi.fn(async () => {
      throw abortError();
    }) as unknown as typeof fetch;

    const result = await fetchWebsiteHtml("example.com", fetchImpl);

    expect(result.html).toBeNull();
    expect(result.failureReason).toBe("timed_out");
    // 2 attempts per scheme (https then http) x 2 schemes = 4.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  test("a real connection error (not AbortError) is still 'down' and is never retried", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;

    const result = await fetchWebsiteHtml("example.com", fetchImpl);

    expect(result.html).toBeNull();
    expect(result.failureReason).toBe("down");
    // 1 attempt per scheme (no retry on a non-timeout failure) x 2 schemes = 2.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("a timeout on the first attempt that then succeeds on retry returns the real html", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(abortError())
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode("<html>hi</html>").buffer,
      }) as unknown as typeof fetch;

    const result = await fetchWebsiteHtml("example.com", fetchImpl);

    expect(result.html).toContain("hi");
    expect(result.failureReason).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("when the two schemes disagree between 'timed_out' and 'down', 'down' wins (it's more specific/actionable)", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(abortError()) // https attempt 1: timed out
      .mockRejectedValueOnce(abortError()) // https attempt 2 (retry): timed out
      .mockRejectedValueOnce(new Error("connection refused")) as unknown as typeof fetch; // http attempt: down, no retry

    const result = await fetchWebsiteHtml("example.com", fetchImpl);

    expect(result.html).toBeNull();
    expect(result.failureReason).toBe("down");
  });
});

// Day 4 Part 2d: ScreenshotOne failing or running out of quota mid-scan
// must never throw or abort the rest of a scan's real results — these
// pin down that captureScreenshotBytes/captureWebsiteScreenshots already
// degrade to null/empty rather than throwing, for exactly that case.
describe("captureScreenshotBytes / captureWebsiteScreenshots: quota exhaustion never throws", () => {
  test("a 402/429 'quota exceeded' response from ScreenshotOne degrades to null bytes, never throws", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 402, headers: new Headers() }) as unknown as Response);

    const bytes = await captureScreenshotBytes("example.com", "key", fetchImpl as unknown as typeof fetch);

    expect(bytes).toBeNull();
  });

  test("captureWebsiteScreenshots never throws when every real call (homepage + sitemap discovery) fails with quota exhaustion", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 429, headers: new Headers() }) as unknown as Response);

    const result = await captureWebsiteScreenshots("example.com", null, "key", fetchImpl as unknown as typeof fetch);

    expect(result.screenshotBytes).toBeNull();
    expect(result.additionalPages).toEqual([]);
  });

  test("a discovered additional page whose own capture hits quota exhaustion still comes back as an honest null, never throws", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 402, headers: new Headers() }) as unknown as Response);

    const result = await captureWebsiteScreenshots(
      "example.com",
      '<html><a href="/about">About us</a></html>',
      "key",
      fetchImpl as unknown as typeof fetch
    );

    expect(result.screenshotBytes).toBeNull();
    expect(result.additionalPages).toHaveLength(1);
    expect(result.additionalPages[0]).toMatchObject({ label: "About us", screenshotBytes: null });
  });
});
