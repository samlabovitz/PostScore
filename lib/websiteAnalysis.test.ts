import { describe, expect, test, vi } from "vitest";
import {
  captureScreenshot,
  captureWebsiteScreenshots,
  checkSafeBrowsing,
  collectWebsiteAnalysis,
  collectWebsiteTrust,
  detectPagePresence,
  fetchMobilePerformance,
  fetchWebsiteHtml,
  isExcludedAboutPath,
  newPresenceBudget,
} from "./websiteAnalysis";

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

    expect(result.measurement).toEqual({
      method: "field",
      fieldCategory: "FAST",
      labScore: null,
      measuredAt: expect.any(String),
    });
    expect(result.callCount).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("b) falls back to origin-level field data when the URL has none — still 1 call total", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fieldBody({ origin: "AVERAGE" })));

    const result = await fetchMobilePerformance("example.com", "key", undefined, fetchImpl as unknown as typeof fetch);

    expect(result.measurement).toEqual({
      method: "field",
      fieldCategory: "AVERAGE",
      labScore: null,
      measuredAt: expect.any(String),
    });
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

    expect(result.measurement).toEqual({
      method: "lab",
      fieldCategory: null,
      labScore: 55,
      measuredAt: expect.any(String),
    });
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

    expect(result.measurement).toEqual({
      method: "lab",
      fieldCategory: null,
      labScore: 70,
      measuredAt: expect.any(String),
    });
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

    expect(result.measurement).toEqual({
      method: "lab",
      fieldCategory: null,
      labScore: 80,
      measuredAt: expect.any(String),
    });
    expect(result.failureReason).toBeNull();
  }, 10000);

  test("a 500 is retried and succeeds on the second attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 500))
      .mockResolvedValue(jsonResponse(labBody(80)));

    const result = await fetchMobilePerformance("example.com", "key", undefined, fetchImpl as unknown as typeof fetch);

    expect(result.measurement).toEqual({
      method: "lab",
      fieldCategory: null,
      labScore: 80,
      measuredAt: expect.any(String),
    });
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
    // 2 attempts per scheme (https then http) x 2 schemes x 2 hosts
    // (example.com, then www.example.com — the site never answered) = 8.
    expect(fetchImpl).toHaveBeenCalledTimes(8);
  });

  test("a real connection error (not AbortError) is still 'down' and is never retried", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;

    const result = await fetchWebsiteHtml("example.com", fetchImpl);

    expect(result.html).toBeNull();
    expect(result.failureReason).toBe("down");
    // 1 attempt per scheme (no retry on a non-timeout failure) x 2 schemes
    // x 2 hosts (the www variant is tried when nothing answered) = 4.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  test("a site that answers only on its www address is read (www ↔ non-www after https ↔ http)", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (!url.includes("://www.")) throw new Error("getaddrinfo ENOTFOUND");
      return new Response("<html><body>Real page</body></html>", { status: 200 });
    }) as unknown as typeof fetch;
    const result = await fetchWebsiteHtml("example.com", fetchImpl);
    expect(result.html).toContain("Real page");
    expect((fetchImpl as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0])).toEqual([
      "https://example.com",
      "http://example.com",
      "https://www.example.com/",
    ]);
  });

  test("a block or an error page is never retried on another host — it's the site's real answer", async () => {
    const fetchImpl = vi.fn(async () => new Response("Forbidden", { status: 403 })) as unknown as typeof fetch;
    const result = await fetchWebsiteHtml("example.com", fetchImpl);
    expect(result.failureReason).toBe("blocked_automated_check");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("redirects are followed (up to 5) with normal browser Accept headers and the honest PostScoreBot user agent", async () => {
    const seen: RequestInit[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      seen.push(init);
      const hop = Number(new URL(url).searchParams.get("hop") ?? "0");
      if (hop < 3) return new Response(null, { status: 301, headers: { location: `/?hop=${hop + 1}` } });
      return new Response("<html><body>Arrived</body></html>", { status: 200 });
    }) as unknown as typeof fetch;
    const ok = await fetchWebsiteHtml("example.com", fetchImpl);
    expect(ok.html).toContain("Arrived");
    const headers = seen[0].headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/^PostScoreBot\//);
    expect(headers.Accept).toContain("text/html");
    expect(headers["Accept-Language"]).toContain("en");
    expect(seen[0].redirect).toBe("manual");

    const loop = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/again" } })) as unknown as typeof fetch;
    const tooMany = await fetchWebsiteHtml("example.com", loop);
    expect(tooMany.html).toBeNull();
    expect(tooMany.failureReason).toBe("http_error");
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
// pin down that captureScreenshot/captureWebsiteScreenshots already
// degrade to null/empty rather than throwing, for exactly that case.
describe("captureScreenshot / captureWebsiteScreenshots: quota exhaustion never throws", () => {
  test("a 402/429 'quota exceeded' response from ScreenshotOne degrades to null bytes, never throws", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 402, headers: new Headers() }) as unknown as Response);

    const result = await captureScreenshot("example.com", "key", fetchImpl as unknown as typeof fetch);

    expect(result.bytes).toBeNull();
    expect(result.attempted).toBe(true);
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

// Day 4 Step 2c: real About/Our-Story and Services/Products detection —
// see lib/pagePresenceDetection.ts for the pure content rules this
// builds on, and lib/scoring.ts's PagePresenceResult for what each
// field means. Every test drives detectPagePresence directly through
// an injectable fetchImpl, never a real network call.
describe("detectPagePresence", () => {
  const HOMEPAGE_URL = new URL("https://example.com/");
  const NO_MATCH_HOMEPAGE_HTML = "<main><h1>Welcome</h1><p>Just a generic homepage.</p></main>";

  function htmlResponse(html: string, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => html,
    } as unknown as Response;
  }

  function pdfResponse(): Response {
    const text = vi.fn(async () => {
      throw new Error("should never be called — PDF content must never be read");
    });
    return { ok: true, status: 200, headers: new Headers({ "content-type": "application/pdf" }), text } as unknown as Response;
  }

  test("a real PDF menu/list link: Services = found with note 'pdf_only', content never read", async () => {
    const fetchImpl = vi.fn(async () => pdfResponse());
    const candidates = [{ url: "https://example.com/menu.pdf", label: "Menu" }];

    const result = await detectPagePresence(
      "services",
      NO_MATCH_HOMEPAGE_HTML,
      HOMEPAGE_URL,
      candidates,
      newPresenceBudget(),
      fetchImpl
    );

    expect(result).toEqual({
      state: "found",
      url: "https://example.com/menu.pdf",
      locatedOnHomepage: false,
      reason: null,
      note: "pdf_only",
    });
  });

  test("a real PDF link for About (not Services) falls through to the homepage section instead of guessing", async () => {
    const fetchImpl = vi.fn(async () => pdfResponse());
    const candidates = [{ url: "https://example.com/about.pdf", label: "About" }];
    const homepageWithAboutSection = `<main><h2>About Us</h2><p>${"Real substantial about content. ".repeat(10)}</p></main>`;

    const result = await detectPagePresence(
      "about",
      homepageWithAboutSection,
      HOMEPAGE_URL,
      candidates,
      newPresenceBudget(),
      fetchImpl
    );

    expect(result.state).toBe("found");
    expect(result.locatedOnHomepage).toBe(true);
  });

  test("Day 4 Task: the real Red Bowl case — a thin Menu wrapper page that links to a real PDF menu: Services = found/pdf_only, evidence is the PDF URL", async () => {
    // Red Bowl's real /menu/ page content (fetched directly for this
    // fix): almost no real text, just a "View PDF Menu" button linking
    // to the actual menu.
    const wrapperHtml =
      '<div class="et_pb_section"><p>Menu - Red Bowl Home Gallery Online Order Menu Contact Us Select Page Menu</p>' +
      '<a class="et_pb_button" href="https://website-cdn.menusifu.com/wp-content/uploads/redbowlud.com/2026/07/Red-Bowl-menu.pdf">View PDF Menu</a>' +
      "<p>Powered by Menusifu. Red Bowl Restaurant all rights reserved.</p></div>";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(htmlResponse(wrapperHtml)) // the /menu/ wrapper page itself
      .mockResolvedValueOnce(pdfResponse()); // following the "View PDF Menu" link
    const candidates = [{ url: "https://www.redbowlud.com/menu/", label: "Menu" }];

    const result = await detectPagePresence(
      "services",
      NO_MATCH_HOMEPAGE_HTML,
      new URL("https://www.redbowlud.com/"),
      candidates,
      newPresenceBudget(),
      fetchImpl
    );

    expect(result).toEqual({
      state: "found",
      url: "https://website-cdn.menusifu.com/wp-content/uploads/redbowlud.com/2026/07/Red-Bowl-menu.pdf",
      locatedOnHomepage: false,
      reason: null,
      note: "pdf_only",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2); // the wrapper page, then the PDF — never more
  });

  test("the PDF-link fallback only fires for Services, never About", async () => {
    const wrapperHtml =
      '<p>Short.</p><a href="/our-brochure.pdf">View PDF Menu</a>'; // "menu" text is irrelevant for About
    const fetchImpl = vi.fn().mockResolvedValueOnce(htmlResponse(wrapperHtml));
    const candidates = [{ url: "https://example.com/about", label: "About" }];

    const result = await detectPagePresence(
      "about",
      NO_MATCH_HOMEPAGE_HTML,
      HOMEPAGE_URL,
      candidates,
      newPresenceBudget(),
      fetchImpl
    );

    expect(result.state).toBe("not_found");
    expect(fetchImpl).toHaveBeenCalledTimes(1); // never followed the PDF link for About
  });

  test("if the linked PDF candidate turns out NOT to be a real PDF (e.g. a 404), falls back to the honest not_found — never couldnt_check", async () => {
    const wrapperHtml = '<p>Short.</p><a href="/menu.pdf">View PDF Menu</a>';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(htmlResponse(wrapperHtml))
      .mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response);
    const candidates = [{ url: "https://example.com/menu", label: "Menu" }];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result).toEqual({ state: "not_found", url: "https://example.com/menu", locatedOnHomepage: false, reason: null, note: null, depth: null, counts: { words: 4, items: 0, detailedItems: 0, prices: 0 } });
  });

  test("a matched link that 404s: not_found with note 'broken_link' — never couldnt_check", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response);
    const candidates = [{ url: "https://example.com/about/our-story/", label: "Our Story" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result).toEqual({
      state: "not_found",
      url: "https://example.com/about/our-story/",
      locatedOnHomepage: false,
      reason: null,
      note: "broken_link",
      depth: null,
      counts: null,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // never retried — a 404 is a real, final answer
  });

  test("an AbortError (timeout) on a matched link: couldnt_check/timed_out, after exactly one retry", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(abortError());
    const candidates = [{ url: "https://example.com/services", label: "Services" }];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result).toEqual({
      state: "couldnt_check",
      url: "https://example.com/services",
      locatedOnHomepage: false,
      reason: "timed_out",
      note: null,
      depth: null,
      counts: null,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("a real connection error (not AbortError): couldnt_check/down, never retried", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    const candidates = [{ url: "https://example.com/about", label: "About" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("couldnt_check");
    expect(result.reason).toBe("down");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("a bot-block (403) on a matched link: couldnt_check/blocked_automated_check", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, text: async () => "" }) as unknown as Response);
    const candidates = [{ url: "https://example.com/services", label: "Services" }];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("couldnt_check");
    expect(result.reason).toBe("blocked_automated_check");
  });

  test("a matched dedicated page that loads but is too thin: not_found, no note — an honest verified absence", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("<main><h1>About</h1><p>Short.</p></main>"));
    const candidates = [{ url: "https://example.com/about", label: "About" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result).toEqual({ state: "not_found", url: "https://example.com/about", locatedOnHomepage: false, reason: null, note: null, depth: null, counts: { words: 2, items: 0, detailedItems: 0, prices: 0 } });
  });

  test("a matched dedicated page with real substantial content: found, url points at the real page", async () => {
    const html = `<main><h1>About Us</h1><p>${"Real substantial about content with real sentences. ".repeat(6)}</p></main>`;
    const fetchImpl = vi.fn(async () => htmlResponse(html));
    const candidates = [{ url: "https://example.com/about", label: "About" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result).toEqual({ state: "found", url: "https://example.com/about", locatedOnHomepage: false, reason: null, note: null, depth: "descriptive", counts: { words: 44, items: 0, detailedItems: 0, prices: 0 } });
  });

  test("no matching candidate link and no matching homepage section: honest not_found, zero network calls", async () => {
    const fetchImpl = vi.fn();

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, [], newPresenceBudget(), fetchImpl);

    expect(result).toEqual({ state: "not_found", url: null, locatedOnHomepage: false, reason: null, note: null, depth: null, counts: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("about and services share one fetch budget — each candidate fetched exactly once, never double-fetched", async () => {
    const fetchImpl = vi.fn(async () =>
      htmlResponse(
        `<main><h1>Real page</h1><p>${"Real substantial content with real sentences here. ".repeat(8)}</p><ul><li>Item one</li><li>Item two</li><li>Item three</li></ul></main>`
      )
    );
    const candidates = [
      { url: "https://example.com/about", label: "About" },
      { url: "https://example.com/services", label: "Services" },
    ];
    const budget = newPresenceBudget();

    const [about, services] = await Promise.all([
      detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, budget, fetchImpl),
      detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, budget, fetchImpl),
    ]);

    expect(about.state).toBe("found");
    expect(services.state).toBe("found");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  // --- Oct 10 audit fixes -------------------------------------------

  const SHELL_HOMEPAGE_HTML = `<!DOCTYPE html><html><head><title>A Business</title></head><body><div id="__nuxt"></div><script>window.__NUXT__={serverRendered:false}</script></body></html>`;

  test("a JS-rendered-shell homepage (Goldberg Hardware's real shape): both About and Services = couldnt_check/js_rendered, zero network calls", async () => {
    const fetchImpl = vi.fn();

    const [about, services] = await Promise.all([
      detectPagePresence("about", SHELL_HOMEPAGE_HTML, HOMEPAGE_URL, [], newPresenceBudget(), fetchImpl),
      detectPagePresence("services", SHELL_HOMEPAGE_HTML, HOMEPAGE_URL, [], newPresenceBudget(), fetchImpl),
    ]);

    expect(about).toEqual({ state: "couldnt_check", url: null, locatedOnHomepage: false, reason: "js_rendered", note: null });
    expect(services).toEqual({ state: "couldnt_check", url: null, locatedOnHomepage: false, reason: "js_rendered", note: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("a matched candidate page that ITSELF turns out to be a JS-rendered shell: couldnt_check/js_rendered, never not_found", async () => {
    const shellPageHtml = `<!DOCTYPE html><html><head><title>Services</title></head><body><div id="reactele"></div></body></html>`;
    const fetchImpl = vi.fn(async () => htmlResponse(shellPageHtml));
    const candidates = [{ url: "https://example.com/services", label: "Services" }];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result).toEqual({
      state: "couldnt_check",
      url: "https://example.com/services",
      locatedOnHomepage: false,
      reason: "js_rendered",
      note: null,
      depth: null,
      counts: null,
    });
  });

  test("the real Santa Fe Mexican Grill case: a Menu candidate page with real intro text but an image-gallery menu: Services = found/image_only", async () => {
    const html =
      "<main><p>This is the place where traditional Mexican cuisine meets the global culinary world, with real recipes.</p>" +
      '<img src="a.jpg"><img src="b.jpg"><img src="c.jpg"><img src="d.jpg"></main>';
    const fetchImpl = vi.fn(async () => htmlResponse(html));
    const candidates = [{ url: "https://example.com/newark-menus", label: "NEWARK MENUS" }];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result).toEqual({
      state: "found",
      url: "https://example.com/newark-menus",
      locatedOnHomepage: false,
      reason: null,
      note: "image_only",
    });
  });

  test("the image-only fallback only fires for Services, never About", async () => {
    const html = '<main><p>Short.</p><img src="a.jpg"><img src="b.jpg"><img src="c.jpg"></main>';
    const fetchImpl = vi.fn(async () => htmlResponse(html));
    const candidates = [{ url: "https://example.com/about", label: "About" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("not_found");
    expect(result.note).toBeNull();
  });

  test("same-brand (eTLD+1) candidate matching: a locator subdomain's nav link to the brand's apex domain is still followed (the real Chipotle/QDOBA case)", async () => {
    const html = `<main><h1>Our Menu</h1><p>${"Real menu content with real sentences describing every dish. ".repeat(6)}</p><ul><li>Item one</li><li>Item two</li><li>Item three</li></ul></main>`;
    const fetchImpl = vi.fn(async () => htmlResponse(html));
    // The homepage is locations.chipotle.com; the real nav link points
    // at chipotle.com (apex) — a different exact host, same real brand.
    const candidates = [{ url: "https://www.chipotle.com/menu", label: "Our Menu" }];

    const result = await detectPagePresence(
      "services",
      NO_MATCH_HOMEPAGE_HTML,
      new URL("https://locations.chipotle.com/de/newark/136-e-main-st"),
      candidates,
      newPresenceBudget(),
      fetchImpl
    );

    expect(result.state).toBe("found");
    expect(result.url).toBe("https://www.chipotle.com/menu");
  });

  test("an unrelated brand on a different host is still never followed", async () => {
    const fetchImpl = vi.fn();
    const candidates = [{ url: "https://qdoba.com/menu", label: "Our Menu" }];

    const result = await detectPagePresence(
      "services",
      NO_MATCH_HOMEPAGE_HTML,
      new URL("https://locations.chipotle.com/de/newark/136-e-main-st"),
      candidates,
      newPresenceBudget(),
      fetchImpl
    );

    expect(result.state).toBe("not_found");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("the real Umami Express / Brew HaHa! case: no real dedicated page, but a real 'Order Online' link to a known third-party platform loads fine: Services = found/online_ordering", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("<main><p>Confirmed real ordering page.</p></main>"));
    const candidates = [{ url: "https://www.toasttab.com/umami-express", label: "Order Online" }];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result).toEqual({
      state: "found",
      url: "https://www.toasttab.com/umami-express",
      locatedOnHomepage: false,
      reason: null,
      note: "online_ordering",
    });
  });

  test("a same-brand 'Order Now' link also qualifies for the online-ordering fallback", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("<main><p>Confirmed real ordering page.</p></main>"));
    const candidates = [{ url: "https://order.example.com/start", label: "Order Now" }];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.note).toBe("online_ordering");
  });

  test("the online-ordering fallback never fires for About", async () => {
    const fetchImpl = vi.fn();
    const candidates = [{ url: "https://www.toasttab.com/some-business", label: "Order Online" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("not_found");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("an ordering link to an UNKNOWN off-domain host is never trusted, even with a matching label", async () => {
    const fetchImpl = vi.fn();
    const candidates = [{ url: "https://some-random-site.example.net/order", label: "Order Online" }];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("not_found");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("if the online-ordering link doesn't actually load (404), falls back to the honest not_found/broken_link — never fabricates a found", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response);
    const candidates = [{ url: "https://www.toasttab.com/closed-business", label: "Order Online" }];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("not_found");
    expect(result.note).toBe("broken_link");
  });

  test("the real Brew HaHa! case: the online-ordering link exists but is BLOCKED (not just missing) — couldnt_check, never a confident not_found", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, text: async () => "" }) as unknown as Response);
    const candidates = [{ url: "https://www.toasttab.com/brewhaha/order-online", label: "Order Online" }];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("couldnt_check");
    expect(result.reason).toBe("blocked_automated_check");
  });

  test("worst case: a Services candidate fails content, its PDF/image fallbacks both fail, and the online-ordering fallback is what finally succeeds — exactly 3 fetches", async () => {
    const thinCandidateHtml = "<main><p>Too short.</p></main>"; // no PDF link, no images, fails content
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(htmlResponse(thinCandidateHtml)) // the dedicated Services candidate
      .mockResolvedValueOnce(htmlResponse("<main><p>Confirmed real ordering page.</p></main>")); // the ordering fallback
    const candidates = [
      { url: "https://example.com/services", label: "Services" },
      { url: "https://www.toasttab.com/some-business", label: "Order Online" },
    ];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.note).toBe("online_ordering");
    expect(fetchImpl).toHaveBeenCalledTimes(2); // candidate page, then the ordering link — no PDF link existed to try
  });
});

// --- Oct 10 "found anywhere wins" redesign ---------------------------

describe("detectPagePresence — 'found anywhere wins' (multiple ranked candidates, budget 3)", () => {
  const HOMEPAGE_URL = new URL("https://example.com/");
  const NO_MATCH_HOMEPAGE_HTML = "<main><h1>Welcome</h1><p>Just a generic homepage.</p></main>";

  function htmlResponse(html: string, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => html,
    } as unknown as Response;
  }

  function pdfResponse(): Response {
    const text = vi.fn(async () => {
      throw new Error("should never be called — PDF content must never be read");
    });
    return { ok: true, status: 200, headers: new Headers({ "content-type": "application/pdf" }), text } as unknown as Response;
  }

  const REAL_CONTENT = `<main><h1>Real</h1><p>${"Real substantial content with real sentences here. ".repeat(8)}</p><ul><li>Item one</li><li>Item two</li><li>Item three</li></ul></main>`;
  const THIN_CONTENT = "<main><p>Too short.</p></main>";

  test("the deepest/most-specific candidate is tried FIRST and wins immediately — the shallower one is never even fetched", async () => {
    const candidates = [
      { url: "https://example.com/new-york", label: "Practice Areas" }, // shallow hub, 1 segment
      { url: "https://example.com/new-york/product-liability-lawyer", label: "Product Liability & Products" }, // deep, 2 segments
    ];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      expect(url.toString()).toBe("https://example.com/new-york/product-liability-lawyer");
      return htmlResponse(REAL_CONTENT);
    });

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("found");
    expect(result.url).toBe("https://example.com/new-york/product-liability-lawyer");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("the real Michael S. Lamonsoff PLLC case: the deep candidate's content fails, but a shallower one still passes — found anywhere wins, never stops at the first failure", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(url.toString());
      return url.toString().includes("product-liability") ? htmlResponse(THIN_CONTENT) : htmlResponse(REAL_CONTENT);
    });
    const candidates = [
      { url: "https://example.com/new-york/product-liability-lawyer", label: "Products" }, // deep but thin this time
      { url: "https://example.com/new-york/more-practice-areas", label: "More Practice Areas" }, // also deep, real content
    ];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("found");
    expect(result.url).toBe("https://example.com/new-york/more-practice-areas");
    expect(calls).toEqual([
      "https://example.com/new-york/product-liability-lawyer",
      "https://example.com/new-york/more-practice-areas",
    ]);
  });

  test("every matched candidate unreadable (blocked): couldnt_check, never not_found — the real QDOBA About case restored via the homepage-section fallback when candidates are all blocked", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, text: async () => "" }) as unknown as Response);
    const candidates = [{ url: "https://example.com/about-us", label: "About Us" }];
    const homepageWithNoAboutSection = NO_MATCH_HOMEPAGE_HTML;

    const result = await detectPagePresence("about", homepageWithNoAboutSection, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("couldnt_check");
    expect(result.reason).toBe("blocked_automated_check");
  });

  test("the real QDOBA About case: the dedicated candidate is blocked, but the homepage's own section still passes — found/homepage, never couldnt_check", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, text: async () => "" }) as unknown as Response);
    const candidates = [{ url: "https://example.com/about-us", label: "About Us" }];
    const homepageWithAboutSection = `<main><h2>About Us</h2><p>${"Real substantial about content right here on the homepage. ".repeat(6)}</p></main>`;

    const result = await detectPagePresence("about", homepageWithAboutSection, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result).toEqual({ state: "found", url: null, locatedOnHomepage: true, reason: null, note: null, depth: "descriptive", counts: { words: 54, items: 0, detailedItems: 0, prices: 0 } });
  });

  test("a mix of one unreadable candidate and one readable-but-thin candidate, nothing passes: couldnt_check wins over not_found", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      url.toString().includes("blocked") ? ({ ok: false, status: 403, text: async () => "" } as unknown as Response) : htmlResponse(THIN_CONTENT)
    );
    const candidates = [
      { url: "https://example.com/services-blocked", label: "Services" },
      { url: "https://example.com/services-thin", label: "Products" },
    ];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("couldnt_check");
    expect(result.reason).toBe("blocked_automated_check");
  });

  test("every matched candidate readable but genuinely thin, nothing unreadable: honest not_found", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(THIN_CONTENT));
    const candidates = [
      { url: "https://example.com/services-a", label: "Products" },
      { url: "https://example.com/services-b", label: "Shop" },
    ];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("not_found");
    expect(result.note).toBeNull();
  });

  test("the real Chipotle case: the matched candidate is itself a JS-rendered shell — never a hard stop, continues to the online-ordering fallback", async () => {
    const shellHtml = `<!DOCTYPE html><html><head><title>Menu</title></head><body><div id="root"></div></body></html>`;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      url.toString().includes("order") ? htmlResponse("<main><p>Confirmed real ordering page.</p></main>") : htmlResponse(shellHtml)
    );
    const candidates = [
      { url: "https://chipotle.com/menu", label: "Our Menu" },
      { url: "https://order.chipotle.com/start", label: "Order Online" },
    ];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, new URL("https://locations.chipotle.com/de/newark"), candidates, newPresenceBudget(), fetchImpl);

    expect(result).toEqual({
      state: "found",
      url: "https://order.chipotle.com/start",
      locatedOnHomepage: false,
      reason: null,
      note: "online_ordering",
    });
  });

  test("the real Brew HaHa! case: a non-Menu-labeled candidate (Catering) with lots of images does NOT get image_only — keeps looking, ends honestly not_found when nothing else matches", async () => {
    const cateringWithImages = '<main><p>Short intro.</p><img src="a.jpg"><img src="b.jpg"><img src="c.jpg"></main>';
    const fetchImpl = vi.fn(async () => htmlResponse(cateringWithImages));
    const candidates = [{ url: "https://example.com/catering", label: "Catering" }];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("not_found");
    expect(result.note).toBeNull(); // never image_only — "Catering" isn't labeled Menu
  });

  test("a Menu-labeled candidate with images DOES still get image_only (unaffected by the label gate)", async () => {
    const menuWithImages = '<main><p>Real intro text about our menu offerings here.</p><img src="a.jpg"><img src="b.jpg"><img src="c.jpg"></main>';
    const fetchImpl = vi.fn(async () => htmlResponse(menuWithImages));
    const candidates = [{ url: "https://example.com/newark-menus", label: "NEWARK MENUS" }];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.note).toBe("image_only");
  });

  test("the real QDOBA PDF case: a menu-labeled .pdf link directly on the homepage, on a totally different host, found and confirmed as a real PDF", async () => {
    const homepageWithPdfLink =
      '<main><a href="https://assets.ctfassets.net/abc/Our-Menu-Take-Out-Menu.pdf">Download Our Menu</a></main>';
    const fetchImpl = vi.fn(async () => pdfResponse());

    const result = await detectPagePresence("services", homepageWithPdfLink, HOMEPAGE_URL, [], newPresenceBudget(), fetchImpl);

    expect(result).toEqual({
      state: "found",
      url: "https://assets.ctfassets.net/abc/Our-Menu-Take-Out-Menu.pdf",
      locatedOnHomepage: false,
      reason: null,
      note: "pdf_only",
    });
  });

  test("worst case never exceeds the 3-fetch budget, even with several ranked candidates plus fallbacks available", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(THIN_CONTENT));
    const candidates = [
      { url: "https://example.com/services-a", label: "Products" },
      { url: "https://example.com/services-b", label: "Shop" },
      { url: "https://example.com/services-c", label: "Pricing" },
      { url: "https://example.com/order-now", label: "Order Now" },
    ];

    await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(3);
  });

  test("the real Santa Fe Mexican Grill regression: a core-keyword candidate (Menu) is tried BEFORE a longer-path secondary-only candidate (Catering), even though Catering's path is longer", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(url.toString());
      return url.toString().includes("menu") ? htmlResponse(REAL_CONTENT) : htmlResponse(THIN_CONTENT);
    });
    const candidates = [
      // Longer path, secondary-only ("catering") — must NOT be tried first.
      { url: "https://example.com/private-events-catering-inquiry", label: "Private Events & Catering Inquiry" },
      { url: "https://example.com/order-catering-online", label: "Order Catering Online" },
      // Shorter path, but CORE ("menu") — must be tried first regardless.
      { url: "https://example.com/menu", label: "Our Menu" },
    ];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("found");
    expect(result.url).toBe("https://example.com/menu");
    expect(calls).toEqual(["https://example.com/menu"]);
  });

  test("a candidate matching BOTH a core and a secondary keyword (e.g. 'Catering Menu') ranks as core", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(url.toString());
      return htmlResponse(REAL_CONTENT);
    });
    const candidates = [
      { url: "https://example.com/private-events-catering-inquiry-longer-path-here", label: "Private Events & Catering Inquiry" }, // secondary only, longer path
      { url: "https://example.com/catering-menu", label: "Catering Menu" }, // matches both "catering" and "menu"
    ];

    await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(calls[0]).toBe("https://example.com/catering-menu");
  });
});

// Oct 10 false-positive fix: candidate matching for About must be
// anchored to the label/path itself, not a bare substring that could
// be a preposition inside unrelated CTA text — see
// isStrictLabelOrPathMatch's own doc for the real Lamonsoff/Canadian
// Tire/National 5 & 10 cases this fixes.
describe("detectPagePresence — strict 'about' matching (no false positives from CTA text)", () => {
  const HOMEPAGE_URL = new URL("https://example.com/");
  const NO_MATCH_HOMEPAGE_HTML = "<main><h1>Welcome</h1><p>Just a generic homepage.</p></main>";
  function htmlResponse(html: string): Response {
    return { ok: true, status: 200, headers: new Headers({ "content-type": "text/html" }), text: async () => html } as unknown as Response;
  }
  const REAL_CONTENT = `<main><h1>Real</h1><p>${"Real substantial content with real sentences here. ".repeat(8)}</p></main>`;

  test("the real Lamonsoff case: a CTA label using 'about' as a preposition is never credited as a real About page", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(REAL_CONTENT));
    const candidates = [{ url: "https://example.com/new-york/personal-injury-lawyer/wrongful-death/", label: "Learn More About Wrongful Death" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("not_found");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("a real 'About Us' label still matches normally", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(REAL_CONTENT));
    const candidates = [{ url: "https://example.com/about-us", label: "About Us" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("found");
    expect(result.url).toBe("https://example.com/about-us");
  });

  test("a bare '/about' URL path segment matches even with an unrelated label", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(REAL_CONTENT));
    const candidates = [{ url: "https://example.com/about", label: "Learn More" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("found");
  });

  test("the real Canadian Tire / National 5 & 10 shape: an unrelated page whose path merely CONTAINS 'about' as a substring of a longer segment is rejected", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(REAL_CONTENT));
    // "about" is not its own path segment here ("location-store-hours"
    // has no "about" at all, but this exercises a near-miss slug too).
    const candidates = [{ url: "https://example.com/support/triangle-id-about-program.html", label: "Triangle Rewards Program Details" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("not_found");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("a more specific About keyword (e.g. 'our story') still uses the plain substring rule, unaffected by the strict 'about' rule", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(REAL_CONTENT));
    const candidates = [{ url: "https://example.com/company-info", label: "Read Our Story Here" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("found");
  });

  // Oct 10 follow-up: a label literally STARTING WITH "About" is no
  // longer enough on its own when the URL is unambiguously a support/
  // account/rewards/careers page — the real Canadian Tire case, where
  // a real nav link labeled "About Triangle ID" points at a loyalty-
  // rewards support page, not the business's own story.
  test("the real Canadian Tire case: a label literally starting with 'About' is still rejected when the path is a support/rewards page", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(REAL_CONTENT));
    const candidates = [{ url: "https://triangle.example.com/en/support/triangle-id.html", label: "About Triangle ID" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("not_found");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("each excluded path segment (help/account/login/rewards/careers) is rejected even with a real 'About' label", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(REAL_CONTENT));
    const segments = ["help", "account", "login", "rewards", "careers", "career"];
    for (const segment of segments) {
      const candidates = [{ url: `https://example.com/${segment}/about-program`, label: "About Our Program" }];
      const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);
      expect(result.state).toBe("not_found");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("a real About-Us page is still found even when an excluded-path candidate also exists on the same site", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (url.toString().includes("support")) throw new Error("should never fetch the excluded support page");
      return htmlResponse(REAL_CONTENT);
    });
    const candidates = [
      { url: "https://example.com/support/rewards-about.html", label: "About Our Rewards Program" },
      { url: "https://example.com/about-us", label: "About Us" },
    ];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("found");
    expect(result.url).toBe("https://example.com/about-us");
  });

  // Oct 11 follow-up: the real National 5 & 10 case — a candidate
  // whose URL path contains "about" is still rejected when the
  // fetched page's OWN title/h1 is a different real topic.
  test("the real National 5 & 10 case: /about/location-store-hours/ is rejected even though its path contains 'about'", async () => {
    const hoursPageHtml =
      '<html><head><title>Location &#038; Store Hours &#8211; National 5 and 10</title></head><body><main><h1>Location &#038; Store Hours</h1><p>We are open Monday through Saturday, 9am to 6pm, at our one real location in town.</p></main></body></html>';
    const fetchImpl = vi.fn(async () => htmlResponse(hoursPageHtml));
    const candidates = [{ url: "https://example.com/about/location-store-hours/", label: "About" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("not_found");
  });

  test("a real About-Us page under /about/ still passes normally (regression guard)", async () => {
    const aboutPageHtml = `<html><head><title>About Us</title></head><body><main><h1>About Us</h1><p>${"Real substantial company story content here. ".repeat(8)}</p></main></body></html>`;
    const fetchImpl = vi.fn(async () => htmlResponse(aboutPageHtml));
    const candidates = [{ url: "https://example.com/about/", label: "About" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result.state).toBe("found");
  });
});

// Oct 10: a multi-location chain's About/Services candidates can tie on
// keyword tier and path depth — locationHint (this business's own
// city) breaks that tie toward the candidate that actually names this
// location, the real Santa Fe Mexican Grill - Newark case.
describe("detectPagePresence — locationHint prefers this business's own location on a multi-location chain", () => {
  const HOMEPAGE_URL = new URL("https://example.com/");
  const NO_MATCH_HOMEPAGE_HTML = "<main><h1>Welcome</h1><p>Just a generic homepage.</p></main>";
  function htmlResponse(html: string): Response {
    return { ok: true, status: 200, headers: new Headers({ "content-type": "text/html" }), text: async () => html } as unknown as Response;
  }
  // Real listed items (<ul><li>...) — services content needs this to
  // actually pass (not just a word-count minimum), same fixture shape
  // as the "found anywhere wins" describe block above.
  const REAL_CONTENT = `<main><h1>Real</h1><p>${"Real substantial content with real sentences here. ".repeat(8)}</p><ul><li>Item one</li><li>Item two</li><li>Item three</li></ul></main>`;

  test("the real Santa Fe Mexican Grill - Newark case: 'Newark Menus' is tried before 'Wilmington Menus' when locationHint is 'Newark'", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(url.toString());
      return htmlResponse(REAL_CONTENT);
    });
    const candidates = [
      { url: "https://example.com/wilmington-menus", label: "Wilmington Menus" },
      { url: "https://example.com/newark-menus", label: "Newark Menus" },
    ];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl, "Newark");

    expect(calls[0]).toBe("https://example.com/newark-menus");
    expect(result.state).toBe("found");
    expect(result.url).toBe("https://example.com/newark-menus");
    expect(calls).toHaveLength(1); // the right one won immediately — the other location's page is never even fetched
  });

  test("without a locationHint, ranking falls back to the existing path-depth/length tiebreak (unchanged behavior)", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(url.toString());
      return htmlResponse(REAL_CONTENT);
    });
    const candidates = [
      { url: "https://example.com/wilmington-menus", label: "Wilmington Menus" },
      { url: "https://example.com/newark-menus", label: "Newark Menus" },
    ];

    await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    // Both candidates tie on every existing tiebreak (same tier, same
    // path segment count, same path length) — so without a hint, the
    // first one in document order wins, same as before this change.
    expect(calls[0]).toBe("https://example.com/wilmington-menus");
  });

  test("a locationHint that matches nothing never blocks a result — the candidate still wins on its own merits", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(REAL_CONTENT));
    const candidates = [{ url: "https://example.com/menu", label: "Menu" }];

    const result = await detectPagePresence("services", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl, "SomeOtherCity");

    expect(result.state).toBe("found");
  });
});

// Oct 10 site-trust collection — checkSafeBrowsing is the one real new
// network call (Google Safe Browsing Lookup API v4); collectWebsiteTrust
// orchestrates it alongside the pure lib/websiteTrust.ts detectors using
// the homepage HTML collectWebsiteAnalysis already fetched, never a
// second HTML fetch of its own.
describe("checkSafeBrowsing", () => {
  test("no API key configured -> { checked: false }, no network call made", async () => {
    const fetchImpl = vi.fn();

    const result = await checkSafeBrowsing("https://example.com", undefined, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ checked: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("a clean response (no matches) reports checked:true, threatFound:false", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);

    const result = await checkSafeBrowsing("https://example.com", "test-key", fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ checked: true, threatFound: false, threatTypes: [] });
  });

  test("a real match reports the real threat type(s), deduplicated", async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ matches: [{ threatType: "SOCIAL_ENGINEERING" }, { threatType: "SOCIAL_ENGINEERING" }, { threatType: "MALWARE" }] }),
        }) as unknown as Response
    );

    const result = await checkSafeBrowsing("https://evil.example", "test-key", fetchImpl as unknown as typeof fetch);

    expect(result.checked).toBe(true);
    if (result.checked) {
      expect(result.threatFound).toBe(true);
      expect(result.threatTypes.sort()).toEqual(["MALWARE", "SOCIAL_ENGINEERING"]);
    }
  });

  test("a failed API call (e.g. 403 bad key) degrades to checked:false, never throws", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }) as unknown as Response);

    const result = await checkSafeBrowsing("https://example.com", "bad-key", fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ checked: false });
  });

  test("a network error degrades to checked:false, never throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    const result = await checkSafeBrowsing("https://example.com", "test-key", fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ checked: false });
  });
});

describe("collectWebsiteTrust", () => {
  const NOW = new Date("2026-10-10T00:00:00Z");
  const NO_GOOGLE = { phone: null, address: null, openingHoursPeriods: null };

  test("the real Bánh Mì Boy shape: finds spam, a stale notice, and abandoned signals all at once", async () => {
    const html = `
      <html><head><style>.hm{display:table-column}</style></head>
      <body>
        <div class="banner">CLOSED July 4th to 8th!!! Call us at (302) 525-2018</div>
        <div class="hm">Check out this <a href="https://fakewatchz.ru/x">replica richard mille</a></div>
        <article><p>Posted July 11, 2012 - Welcome!</p></article>
        <footer><div>Please put widget here</div></footer>
      </body></html>
    `;
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);

    const trust = await collectWebsiteTrust(html, "banhmiboy.com", { phone: "+1 302-525-2018", address: null, openingHoursPeriods: null }, "test-key", NOW, fetchImpl as unknown as typeof fetch);

    expect(trust.spamSignals.length).toBeGreaterThan(0);
    expect(trust.spamSignals[0].category).toBe("replica");
    expect(trust.staleNotices.length).toBeGreaterThan(0);
    expect(trust.abandonedSignals.looksAbandoned).toBe(true);
    expect(trust.infoConflicts.find((f) => f.field === "phone")?.comparison).toBe("matches");
    expect(trust.websiteKind).toBe("independent");
    expect(trust.listingLinkBroken).toBe(false);
    expect(trust.checkedAt).toBe(NOW.toISOString());
  });

  test("a clean, independent site reports no findings and listingLinkBroken: false", async () => {
    const html = `<html><body><p>Welcome to our real shop! Open daily 9am - 9pm.</p></body></html>`;
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);

    const trust = await collectWebsiteTrust(html, "example.com", NO_GOOGLE, undefined, NOW, fetchImpl as unknown as typeof fetch);

    expect(trust.spamSignals).toEqual([]);
    expect(trust.staleNotices).toEqual([]);
    expect(trust.abandonedSignals.looksAbandoned).toBe(false);
    expect(trust.websiteKind).toBe("independent");
    expect(trust.listingLinkBroken).toBe(false);
    expect(trust.safeBrowsingChecked).toBe(false); // no key configured
  });

  test("Step 2d: page text alone ('Page Not Found') no longer marks the listing link broken — only a genuine 404/410 does", async () => {
    const html = `<html><body><h1>Page Not Found</h1><p>The page you are looking for has been moved or deleted.</p></body></html>`;
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);

    const trust = await collectWebsiteTrust(html, "example.com", NO_GOOGLE, undefined, NOW, fetchImpl as unknown as typeof fetch);

    expect(trust.listingLinkBroken).toBe(false);
  });

  test("a directory-hosted address (e.g. Facebook) is classified as such regardless of its content", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);

    const trust = await collectWebsiteTrust("<html><body>Real page</body></html>", "https://www.facebook.com/realbiz", NO_GOOGLE, undefined, NOW, fetchImpl as unknown as typeof fetch);

    expect(trust.websiteKind).toBe("directory");
  });

  test("couldn't read the site at all (homepageHtml: null) -> an honestly empty trust result, never throws, never 'clean'", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);

    const trust = await collectWebsiteTrust(null, "example.com", NO_GOOGLE, "test-key", NOW, fetchImpl as unknown as typeof fetch);

    expect(trust.spamSignals).toEqual([]);
    expect(trust.staleNotices).toEqual([]);
    expect(trust.infoConflicts).toEqual([]);
    expect(trust.listingLinkBroken).toBe(false);
    // Safe Browsing is still checked even when our own HTML fetch failed
    // — the URL itself can still be checked against Google's blocklists.
    expect(trust.safeBrowsingChecked).toBe(true);
  });

  test("real Safe Browsing threat surfaces on the returned trust result", async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: true, json: async () => ({ matches: [{ threatType: "MALWARE" }] }) }) as unknown as Response
    );

    const trust = await collectWebsiteTrust("<html><body>hi</body></html>", "example.com", NO_GOOGLE, "test-key", NOW, fetchImpl as unknown as typeof fetch);

    expect(trust.safeBrowsingChecked).toBe(true);
    expect(trust.safeBrowsingThreat).toEqual({ threatFound: true, threatTypes: ["MALWARE"] });
  });

  // Oct 11: the real Bagel Emporium case — a phone/hours/address only
  // ever stated on a dedicated Contact page, never the homepage, must
  // still be found and compared before any conflict is reported.
  test("contactPageHtml param: a phone found only on the Contact page resolves a would-be conflict into a match", async () => {
    const homepageHtml = `<html><body><p>Need Catering? Call us: 914-222-4545</p></body></html>`;
    const contactPageHtml = `<html><body><p>Call us: 914-333-0033</p></body></html>`;
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);

    const trust = await collectWebsiteTrust(
      homepageHtml,
      "bagelemporium.com",
      { phone: "+1 914-333-0033", address: null, openingHoursPeriods: null },
      undefined,
      NOW,
      fetchImpl as unknown as typeof fetch,
      contactPageHtml
    );

    const phone = trust.infoConflicts.find((f) => f.field === "phone")!;
    expect(phone.comparison).toBe("matches");
  });

  test("contactPageHtml param: never merged into spam/stale-notice/abandoned-site detection, only info-consistency", async () => {
    const homepageHtml = `<html><body><p>Welcome to our real shop!</p></body></html>`;
    const contactPageHtml = `<html><body><p>replica richard mille CLOSED July 4th to 8th!!! Please put widget here</p></body></html>`;
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);

    const trust = await collectWebsiteTrust(
      homepageHtml,
      "example.com",
      NO_GOOGLE,
      undefined,
      NOW,
      fetchImpl as unknown as typeof fetch,
      contactPageHtml
    );

    expect(trust.spamSignals).toEqual([]);
    expect(trust.staleNotices).toEqual([]);
    expect(trust.abandonedSignals.looksAbandoned).toBe(false);
  });

  test("no contactPageHtml (null, the default) behaves exactly as before — homepage-only comparison", async () => {
    const homepageHtml = `<html><body><p>Call us: 914-222-4545</p></body></html>`;
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);

    const trust = await collectWebsiteTrust(
      homepageHtml,
      "bagelemporium.com",
      { phone: "+1 914-333-0033", address: null, openingHoursPeriods: null },
      undefined,
      NOW,
      fetchImpl as unknown as typeof fetch
    );

    const phone = trust.infoConflicts.find((f) => f.field === "phone")!;
    // No "catering"-style label here, no contact page to check — a
    // real, unlabeled, non-matching number is a genuine conflict.
    expect(phone.comparison).toBe("conflicts");
  });
});

describe("collectWebsiteAnalysis: the Contact page is fetched and shares the existing presence budget", () => {
  const NOW_ISO_PREFIX = new Date().toISOString().slice(0, 4);

  // Needs BOTH .text() (the homepage goes through fetchWebsiteHtml's
  // own .arrayBuffer()-based reader; the Contact-page candidate fetch
  // goes through fetchPresenceCandidate's .text()-based reader) so one
  // mock response works for either real code path.
  function htmlResponse(html: string): Response {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => html,
      arrayBuffer: async () => new TextEncoder().encode(html).buffer,
    } as unknown as Response;
  }

  test("the real Bagel Emporium shape end-to-end: a linked Contact page is fetched and resolves the phone conflict", async () => {
    const homepageHtml = `<html><body><p>Need Catering? Call us: 914-222-4545</p><a href="https://example.com/contact">Contact Us</a></body></html>`;
    const contactHtml = `<html><body><p>Call us: 914-333-0033</p></body></html>`;
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(url.toString());
      if (url.toString().includes("/contact")) return htmlResponse(contactHtml);
      return htmlResponse(homepageHtml);
    });

    const result = await collectWebsiteAnalysis(
      "https://example.com",
      { pageSpeedApiKey: undefined, screenshotApiKey: undefined, safeBrowsingApiKey: undefined },
      { captureScreenshots: false },
      { phone: "+1 914-333-0033", address: null, openingHoursPeriods: null },
      fetchImpl as unknown as typeof fetch
    );

    expect(calls).toContain("https://example.com/contact");
    const phone = result.websiteTrust.infoConflicts.find((f) => f.field === "phone")!;
    expect(phone.comparison).toBe("matches");
    expect(result.websiteTrust.checkedAt.slice(0, 4)).toBe(NOW_ISO_PREFIX);
  });

  test("Step 2d: a click-to-call / email link only on the Contact page counts for contact_conversion", async () => {
    const homepageHtml = `<html><head><meta name=viewport content=width=device-width><title>t</title></head><body><h1>Hi</h1><p>Call (302) 525-2018</p><a href="https://example.com/contact">Contact Us</a></body></html>`;
    const contactHtml = `<html><body><a href=tel:+13025252018>Call</a> <a href=mailto:hi@example.com>Email</a></body></html>`;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      htmlResponse(url.toString().includes("/contact") ? contactHtml : homepageHtml)
    );
    const result = await collectWebsiteAnalysis(
      "https://example.com",
      { pageSpeedApiKey: undefined, screenshotApiKey: undefined, safeBrowsingApiKey: undefined },
      { captureScreenshots: false },
      { phone: null, address: null, openingHoursPeriods: null },
      fetchImpl as unknown as typeof fetch
    );
    expect(result.content?.hasPhoneLink).toBe(true);
    expect(result.content?.hasEmailLink).toBe(true);
    expect(result.content?.hasViewportTag).toBe(true);
  });

  test("no Contact link on the homepage — trust collection still completes normally, no extra fetch attempted", async () => {
    const homepageHtml = `<html><body><p>Call us: 914-222-4545</p></body></html>`;
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(url.toString());
      return htmlResponse(homepageHtml);
    });

    const result = await collectWebsiteAnalysis(
      "https://example.com",
      { pageSpeedApiKey: undefined, screenshotApiKey: undefined, safeBrowsingApiKey: undefined },
      { captureScreenshots: false },
      { phone: "+1 914-333-0033", address: null, openingHoursPeriods: null },
      fetchImpl as unknown as typeof fetch
    );

    expect(calls.every((c) => !c.includes("contact"))).toBe(true);
    const phone = result.websiteTrust.infoConflicts.find((f) => f.field === "phone")!;
    expect(phone.comparison).toBe("conflicts"); // 4545 is a real, non-secondary number here with no label
  });
});

describe("Step 2d: captureScreenshot reads the target page's HTTP status", () => {
  const png = () => new Uint8Array([137, 80, 78, 71]).buffer;
  function res(status: number | null, ok = true) {
    const headers = new Headers({ "content-type": "image/png" });
    if (status !== null) headers.set("X-ScreenshotOne-HTTP-Response-Status-Code", String(status));
    return { ok, status: ok ? 200 : 500, headers, arrayBuffer: async () => png() } as unknown as Response;
  }

  test("asks ScreenshotOne for the status, and keeps a 200 capture", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url);
      return res(200);
    });
    const result = await captureScreenshot("example.com", "key", fetchImpl as unknown as typeof fetch);
    expect(urls[0]).toContain("metadata_http_response_status_code=true");
    expect(result.httpStatus).toBe(200);
    expect(result.bytes).not.toBeNull();
  });

  test("a 404 (e.g. a 'Page Not Found' page) is recorded but the image is discarded", async () => {
    const result = await captureScreenshot("example.com", "key", vi.fn(async () => res(404)) as unknown as typeof fetch);
    expect(result.httpStatus).toBe(404);
    expect(result.bytes).toBeNull();
  });

  test("a 503 is discarded too; no reported status keeps the image", async () => {
    expect((await captureScreenshot("example.com", "key", vi.fn(async () => res(503)) as unknown as typeof fetch)).bytes).toBeNull();
    const none = await captureScreenshot("example.com", "key", vi.fn(async () => res(null)) as unknown as typeof fetch);
    expect(none.httpStatus).toBeNull();
    expect(none.bytes).not.toBeNull();
  });

  test("no API key: nothing is called, nothing counted", async () => {
    const fetchImpl = vi.fn();
    const result = await captureScreenshot("example.com", undefined, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.attempted).toBe(false);
    const all = await captureWebsiteScreenshots("example.com", null, undefined, vi.fn(async () => res(200)) as unknown as typeof fetch);
    expect(all.calls).toBe(0);
  });
});

describe("Step 2d: an embedded map's address feeds Matches your Google listing", () => {
  test("no address in the page text, but the map states it -> matches, source map", async () => {
    const html = `<html><body><h1>Main Street Sweets</h1><p>Visit us in Newark!</p><iframe src="https://maps.google.com/maps?q=209+E+Main+St,+Newark,+DE+19711&output=embed"></iframe></body></html>`;
    const trust = await collectWebsiteTrust(
      html,
      "https://example.com",
      { phone: null, address: "209 E Main St, Newark, DE 19711, USA", openingHoursPeriods: null },
      undefined,
      new Date("2026-10-11T00:00:00Z"),
      (async () => ({ ok: false, status: 404, headers: new Headers() })) as unknown as typeof fetch
    );
    const address = trust.infoConflicts.find((f) => f.field === "address")!;
    expect(address.comparison).toBe("matches");
    expect(address.source).toBe("map");
    expect(trust.embeddedMap).toEqual({ readableAddress: "209 E Main St, Newark, DE 19711" });
  });
});

describe("Step 2d correction: soft 404 seen only by PageSpeed", () => {
  function psi(): Response {
    const body = {
      lighthouseResult: {
        requestedUrl: "https://www.wonder.com/order/thegrove",
        finalUrl: "https://www.wonder.com/order/thegrove",
        finalDisplayedUrl: "https://www.wonder.com/order/404",
        mainDocumentUrl: "https://www.wonder.com/order/thegrove",
        categories: { performance: { score: 0.13 } },
        audits: {},
      },
      loadingExperience: { overall_category: "SLOW" },
      originLoadingExperience: { overall_category: "AVERAGE" },
    };
    return { ok: true, status: 200, headers: new Headers(), json: async () => body } as unknown as Response;
  }
  test("our own fetch bot-blocked -> URL-level real-visitor data is used (real people see the real page)", async () => {
    const r = await fetchMobilePerformance("https://www.wonder.com/order/thegrove", "key", undefined, vi.fn(async () => psi()) as unknown as typeof fetch, true);
    expect(r.measurement).toMatchObject({ method: "field", fieldCategory: "SLOW" });
    expect(r.measurement?.fieldScope).toBeUndefined();
    expect(r.softNotFoundUrl).toBe("https://www.wonder.com/order/404");
  });
  test("not blocked -> whole-site data, labeled; an error-page lab score is never used", async () => {
    const r = await fetchMobilePerformance("https://www.wonder.com/order/thegrove", "key", undefined, vi.fn(async () => psi()) as unknown as typeof fetch, false);
    expect(r.measurement).toMatchObject({ method: "field", fieldCategory: "AVERAGE", fieldScope: "origin" });
  });
});

describe("Step 2d: only a genuine 404/410 is a missing page", () => {
  const resp = (status: number, body = "") =>
    ({ ok: false, status, headers: new Headers(), text: async () => body } as unknown as Response);
  for (const status of [404, 410] as const) {
    test(`${status} -> missingPageStatus ${status}`, async () => {
      const r = await fetchWebsiteHtml("example.com", vi.fn(async () => resp(status)) as unknown as typeof fetch);
      expect(r.html).toBeNull();
      expect(r.missingPageStatus).toBe(status);
    });
  }
  for (const status of [403, 429, 503, 500]) {
    test(`${status} -> never a missing page`, async () => {
      const r = await fetchWebsiteHtml("example.com", vi.fn(async () => resp(status)) as unknown as typeof fetch);
      expect(r.missingPageStatus ?? null).toBeNull();
    });
  }
  test("a 404 carrying a bot-challenge body is a block, not a missing page", async () => {
    const r = await fetchWebsiteHtml("example.com", vi.fn(async () => resp(404, "Just a moment... Checking your browser")) as unknown as typeof fetch);
    expect(r.missingPageStatus ?? null).toBeNull();
  });
});

describe("Step 2g follow-ups", () => {
  test("every plain fetch identifies as PostScoreBot/1.0 (+https://postscore.co)", async () => {
    const agents: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      agents.push(String((init?.headers as Record<string, string>)?.["User-Agent"]));
      return { ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => new TextEncoder().encode("<p>hi</p>").buffer } as unknown as Response;
    });
    await fetchWebsiteHtml("example.com", fetchImpl as unknown as typeof fetch);
    expect(agents[0]).toBe("PostScoreBot/1.0 (+https://postscore.co)");
  });
  test("corporate pages never count as About (charity, foundation, network, careers, franchising, investors, press)", () => {
    for (const [path, label] of [
      ["/about-us/giving/childrens-miracle-network", "About us"],
      ["/foundation", "About our foundation"],
      ["/about/careers", "About"],
      ["/franchising/about", "About franchising"],
      ["/investors/about", "About"],
      ["/press", "About press"],
      ["/about", "About our network"],
    ]) {
      expect(isExcludedAboutPath(path, label), `${path} ${label}`).toBe(true);
    }
    expect(isExcludedAboutPath("/about-us", "About Us")).toBe(false);
    expect(isExcludedAboutPath("/our-story", "Our Story")).toBe(false);
    expect(isExcludedAboutPath("/meet-the-team", "Meet the team")).toBe(false);
  });
});
