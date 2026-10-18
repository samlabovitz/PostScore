import { describe, expect, it } from "vitest";
import { canConnectGbp, hasPremium, resolvePlan } from "@/lib/premium";

describe("plans", () => {
  it("every real account is Free until checkout exists — a production build ignores the dev switch", () => {
    expect(resolvePlan({ NODE_ENV: "production", POSTSCORE_DEV_PLAN: "premium" }, "premium")).toBe("free");
    expect(resolvePlan({ NODE_ENV: "test" }, "grow")).toBe("free");
  });

  it("local dev: the cookie switch wins, then the env var; junk is ignored", () => {
    expect(resolvePlan({ NODE_ENV: "development" }, "grow")).toBe("grow");
    expect(resolvePlan({ NODE_ENV: "development", POSTSCORE_DEV_PLAN: "multi" }, null)).toBe("multi");
    expect(resolvePlan({ NODE_ENV: "development", POSTSCORE_DEV_PLAN: "multi" }, "premium")).toBe("premium");
    expect(resolvePlan({ NODE_ENV: "development" }, "platinum")).toBe("free");
  });

  it("Premium and Multi have Premium; GBP connect still needs GBP_CONNECT_PUBLIC", () => {
    expect([hasPremium("free"), hasPremium("grow"), hasPremium("premium"), hasPremium("multi")]).toEqual([false, false, true, true]);
    expect(canConnectGbp(true, { GBP_CONNECT_PUBLIC: "true", NODE_ENV: "production" })).toBe(true);
    expect(canConnectGbp(true, { NODE_ENV: "production" })).toBe(false);
  });
});
