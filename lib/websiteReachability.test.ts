import { describe, expect, test } from "vitest";
import { classifyUnreachableResponse, moreSpecificReason, reachabilityReasonMessageKey } from "./websiteReachability";

describe("classifyUnreachableResponse", () => {
  test("403/429/503 are always blocked_automated_check, regardless of body", () => {
    expect(classifyUnreachableResponse(403, null)).toBe("blocked_automated_check");
    expect(classifyUnreachableResponse(429, null)).toBe("blocked_automated_check");
    expect(classifyUnreachableResponse(503, null)).toBe("blocked_automated_check");
  });

  test("a known bot-challenge page body is blocked_automated_check even on a non-blocked status code", () => {
    expect(classifyUnreachableResponse(200, "<html><title>Just a moment...</title></html>")).toBe(
      "blocked_automated_check"
    );
    expect(classifyUnreachableResponse(200, "Checking your browser before accessing example.com")).toBe(
      "blocked_automated_check"
    );
    expect(classifyUnreachableResponse(200, "<h1>Attention Required! | Cloudflare</h1>")).toBe(
      "blocked_automated_check"
    );
  });

  test("case-insensitive body match", () => {
    expect(classifyUnreachableResponse(200, "JUST A MOMENT...")).toBe("blocked_automated_check");
  });

  test("a genuine other error status with no bot-challenge body is http_error", () => {
    expect(classifyUnreachableResponse(404, "<html>Not Found</html>")).toBe("http_error");
    expect(classifyUnreachableResponse(500, null)).toBe("http_error");
    expect(classifyUnreachableResponse(502, "Bad Gateway")).toBe("http_error");
  });

  test("no body at all on a non-blocked status is http_error, never guessed as blocked", () => {
    expect(classifyUnreachableResponse(410, null)).toBe("http_error");
  });
});

describe("moreSpecificReason — Day 4 Task: 'timed_out' ranks below every other real reason", () => {
  test("timed_out never beats any other reason", () => {
    expect(moreSpecificReason("timed_out", "down")).toBe("down");
    expect(moreSpecificReason("down", "timed_out")).toBe("down");
    expect(moreSpecificReason("timed_out", "http_error")).toBe("http_error");
    expect(moreSpecificReason("timed_out", "blocked_automated_check")).toBe("blocked_automated_check");
  });

  test("full ranking order: blocked > http_error > down > timed_out", () => {
    expect(moreSpecificReason("down", "http_error")).toBe("http_error");
    expect(moreSpecificReason("http_error", "blocked_automated_check")).toBe("blocked_automated_check");
    expect(moreSpecificReason("down", "blocked_automated_check")).toBe("blocked_automated_check");
  });

  test("a tie (same reason on both sides) returns that reason", () => {
    expect(moreSpecificReason("timed_out", "timed_out")).toBe("timed_out");
    expect(moreSpecificReason("down", "down")).toBe("down");
  });
});

describe("reachabilityReasonMessageKey", () => {
  test("maps every reason to its own distinct message key, including the new 'timed_out' one", () => {
    expect(reachabilityReasonMessageKey("timed_out")).toBe("dashboard.website.reachabilityTimedOut");
    expect(reachabilityReasonMessageKey("down")).toBe("dashboard.website.reachabilityDown");
    expect(reachabilityReasonMessageKey("blocked_automated_check")).toBe("dashboard.website.reachabilityBlocked");
    expect(reachabilityReasonMessageKey("http_error")).toBe("dashboard.website.reachabilityHttpError");
  });
});
