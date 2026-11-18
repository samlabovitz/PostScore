import { describe, expect, test } from "vitest";
import { devTestLoginRefusal, safeNextPath } from "./devTestLogin";

const env = { NODE_ENV: "development", DEV_TEST_LOGIN_EMAIL: "test@example.com", DEV_TEST_LOGIN_PASSWORD: "x" };

describe("dev test login", () => {
  test("runs only under next dev, on localhost, when configured", () => {
    expect(devTestLoginRefusal(env, "localhost:3000")).toBeNull();
    expect(devTestLoginRefusal(env, "127.0.0.1:3000")).toBeNull();
    expect(devTestLoginRefusal(env, "[::1]:3000")).toBeNull();
  });

  test("refused in production, in a test run, on any other host, or without credentials", () => {
    expect(devTestLoginRefusal({ ...env, NODE_ENV: "production" }, "localhost:3000")).toBe("not development");
    expect(devTestLoginRefusal({ ...env, NODE_ENV: "test" }, "localhost:3000")).toBe("not development");
    expect(devTestLoginRefusal(env, "postscore.co")).toBe("not localhost");
    expect(devTestLoginRefusal(env, "localhost.evil.com")).toBe("not localhost");
    expect(devTestLoginRefusal(env, null)).toBe("not localhost");
    expect(devTestLoginRefusal(env, "localhost:3000", "192.168.1.20")).toBe("not localhost");
    expect(devTestLoginRefusal(env, "localhost:3000", "::1")).toBeNull();
    expect(devTestLoginRefusal(env, "localhost:3000", "::ffff:127.0.0.1")).toBeNull();
    expect(devTestLoginRefusal({ ...env, DEV_TEST_LOGIN_PASSWORD: "" }, "localhost:3000")).toBe("not configured");
  });

  test("only redirects to a path on this site", () => {
    expect(safeNextPath("/business/abc/website")).toBe("/business/abc/website");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
