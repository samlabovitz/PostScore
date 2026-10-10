import { describe, expect, test, vi } from "vitest";
import {
  captureScreenshotBytes,
  captureWebsiteScreenshots,
  detectPagePresence,
  fetchMobilePerformance,
  fetchWebsiteHtml,
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

    expect(result).toEqual({ state: "not_found", url: "https://example.com/menu", locatedOnHomepage: false, reason: null, note: null });
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

    expect(result).toEqual({ state: "not_found", url: "https://example.com/about", locatedOnHomepage: false, reason: null, note: null });
  });

  test("a matched dedicated page with real substantial content: found, url points at the real page", async () => {
    const html = `<main><h1>About Us</h1><p>${"Real substantial about content with real sentences. ".repeat(6)}</p></main>`;
    const fetchImpl = vi.fn(async () => htmlResponse(html));
    const candidates = [{ url: "https://example.com/about", label: "About" }];

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, candidates, newPresenceBudget(), fetchImpl);

    expect(result).toEqual({ state: "found", url: "https://example.com/about", locatedOnHomepage: false, reason: null, note: null });
  });

  test("no matching candidate link and no matching homepage section: honest not_found, zero network calls", async () => {
    const fetchImpl = vi.fn();

    const result = await detectPagePresence("about", NO_MATCH_HOMEPAGE_HTML, HOMEPAGE_URL, [], newPresenceBudget(), fetchImpl);

    expect(result).toEqual({ state: "not_found", url: null, locatedOnHomepage: false, reason: null, note: null });
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
});
