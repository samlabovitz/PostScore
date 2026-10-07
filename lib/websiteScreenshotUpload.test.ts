import { describe, expect, test, vi } from "vitest";

// websiteScreenshotUpload.ts itself has a top-level `import "server-only"`
// guard that hard-throws outside Next's own server build/runtime — same
// established workaround as elsewhere in this codebase: mock the guard
// package directly, plus the admin client factory, so the real module
// under test can still be imported directly.
vi.mock("server-only", () => ({}));
const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();
vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}));

import { uploadWebsiteScreenshots } from "./websiteScreenshotUpload";

describe("uploadWebsiteScreenshots — Day 4 Part 2d: a storage failure must never throw/abort the real scan", () => {
  test("a thrown (network-level) error from the storage client degrades to screenshotUrl: null, never propagates", async () => {
    mockUpload.mockRejectedValueOnce(new Error("network blip"));

    const result = await uploadWebsiteScreenshots("biz-1", {
      screenshotBytes: Buffer.from("fake-png-bytes"),
      additionalPages: [],
    });

    expect(result).toEqual({ screenshotUrl: null, additionalPages: [] });
  });

  test("a reported (non-thrown) storage error also degrades to screenshotUrl: null", async () => {
    mockUpload.mockResolvedValueOnce({ error: { message: "bucket quota exceeded" } });

    const result = await uploadWebsiteScreenshots("biz-2", {
      screenshotBytes: Buffer.from("fake-png-bytes"),
      additionalPages: [],
    });

    expect(result).toEqual({ screenshotUrl: null, additionalPages: [] });
  });

  test("a thrown error on one additional page never blocks the others or the homepage", async () => {
    mockUpload
      .mockResolvedValueOnce({ error: null }) // homepage succeeds
      .mockRejectedValueOnce(new Error("network blip")) // page 1 throws
      .mockResolvedValueOnce({ error: null }); // page 2 succeeds
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: "https://example.com/real.png" } });

    const result = await uploadWebsiteScreenshots("biz-3", {
      screenshotBytes: Buffer.from("home"),
      additionalPages: [
        { label: "About", url: "https://biz.com/about", screenshotBytes: Buffer.from("about") },
        { label: "Contact", url: "https://biz.com/contact", screenshotBytes: Buffer.from("contact") },
      ],
    });

    expect(result.screenshotUrl).toBe("https://example.com/real.png");
    expect(result.additionalPages).toHaveLength(2);
    expect(result.additionalPages[0].screenshotUrl).toBeNull();
    expect(result.additionalPages[1].screenshotUrl).toBe("https://example.com/real.png");
  });
});
