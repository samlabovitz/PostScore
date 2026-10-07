import { describe, expect, test } from "vitest";
import { classifyUnreachableResponse } from "./websiteReachability";

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
