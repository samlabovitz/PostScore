import { describe, expect, test, vi } from "vitest";
import { fetchMobilePerformance } from "./websiteAnalysis";

// Day 3b: the real measurement behind website.performance_mobile — see
// fetchMobilePerformance's own doc for the method order (URL-level field
// data, then origin-level field data, then a median-of-3 lab fallback)
// this suite pins down. Every test drives fetchMobilePerformance through
// its injectable `fetchImpl` param, never a real network call.

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
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
  test("null measurement when every attempt fails (no field data, all 3 lab runs fail)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false));

    const result = await fetchMobilePerformance("example.com", "key", undefined, fetchImpl as unknown as typeof fetch);

    expect(result.measurement).toBeNull();
    expect(result.callCount).toBe(3);
  });

  test("no measurement and zero calls when no website or no API key is configured", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(labBody(90)));

    const noWebsite = await fetchMobilePerformance("", "key", undefined, fetchImpl as unknown as typeof fetch);
    const noKey = await fetchMobilePerformance("example.com", undefined, undefined, fetchImpl as unknown as typeof fetch);

    expect(noWebsite.measurement).toBeNull();
    expect(noWebsite.callCount).toBe(0);
    expect(noKey.measurement).toBeNull();
    expect(noKey.callCount).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
