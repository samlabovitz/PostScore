import { describe, expect, test, vi } from "vitest";
import { lookupBusinessByPlaceId, searchNearbyPlaces } from "./places";

// getApiKey() (lib/google/places.ts) throws before any fetch happens if
// this isn't set — a real key is never read from here, only its
// presence is required.
vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key-for-placesTimeout-test");

// Real incident this fixes: lib/google/places.ts's own fetch() calls had
// zero timeout protection — unlike every other probe in this codebase
// (lib/websiteHttps.ts, lib/websiteAnalysis.ts,
// lib/pagePresenceDetection.ts), which all bound every fetch with an
// AbortController. A stalled connection to Google's API could hang for a
// very long time (a real multi-hour incident, not hypothetical) before
// finally throwing. Every test here drives the real retry/timeout logic
// through an injectable `fetchImpl`, never a real network call.

function abortError(): Error {
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}

function detailsResponse(overrides: Record<string, unknown> = {}): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ id: "place-1", displayName: { text: "Test Business" }, ...overrides }),
  } as unknown as Response;
}

function errorResponse(status: number): Response {
  return { ok: false, status, text: async () => `error ${status}` } as unknown as Response;
}

describe("Google Places timeout/retry — lookupBusinessByPlaceId", () => {
  test("timeout then success: one retry recovers, reports found", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(abortError()).mockResolvedValueOnce(detailsResponse());

    const result = await lookupBusinessByPlaceId("place-1", fetchImpl as unknown as typeof fetch);

    expect(result.status).toBe("found");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("timeout then timeout again: an honest, clear failure — never a hang, never partial data", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(abortError());

    const result = await lookupBusinessByPlaceId("place-1", fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ status: "error", message: expect.stringContaining("timed out") });
    expect(fetchImpl).toHaveBeenCalledTimes(2); // exactly one retry, never more
  });

  test("a 503 (5xx) is retried and can succeed", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(errorResponse(503)).mockResolvedValueOnce(detailsResponse());

    const result = await lookupBusinessByPlaceId("place-1", fetchImpl as unknown as typeof fetch);

    expect(result.status).toBe("found");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("a 503 that persists is an honest failure naming the real status, not a hang", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(503));

    const result = await lookupBusinessByPlaceId("place-1", fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ status: "error", message: expect.stringContaining("503") });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("a 400 (client error, not 5xx) is NEVER retried — fails fast, same request would just fail again", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(400));

    const result = await lookupBusinessByPlaceId("place-1", fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ status: "error", message: expect.stringContaining("400") });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("a real network error that isn't a timeout (e.g. DNS failure) is NEVER retried", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    const result = await lookupBusinessByPlaceId("place-1", fetchImpl as unknown as typeof fetch);

    expect(result.status).toBe("error");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("a real result is never fabricated as partial/found when every attempt failed", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(abortError());
    const result = await lookupBusinessByPlaceId("place-1", fetchImpl as unknown as typeof fetch);
    expect(result.status).not.toBe("found");
    expect("place" in result).toBe(false);
  });
});

describe("Google Places timeout/retry — searchNearbyPlaces", () => {
  const PARAMS = { lat: 40.0, lng: -75.0, radiusMeters: 2000 };

  function nearbyResponse(): Response {
    return { ok: true, status: 200, json: async () => ({ places: [{ id: "nearby-1" }] }) } as unknown as Response;
  }

  test("timeout then success: one retry recovers real candidates", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(abortError()).mockResolvedValueOnce(nearbyResponse());

    const result = await searchNearbyPlaces(PARAMS, fetchImpl as unknown as typeof fetch);

    expect(result).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("timeout then timeout again: throws a real, clear error — never hangs, never returns fabricated candidates", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(abortError());

    await expect(searchNearbyPlaces(PARAMS, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/timed out/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
