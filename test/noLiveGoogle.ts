// Tests never call Google: the live reads (lib/placesLive.server.ts)
// answer "couldn't reach Google" unless a test supplies its own values.
import { vi } from "vitest";

vi.mock("@/lib/google/places", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/google/places")>();
  // vi.fn, so a test can give its own live values (vi.mocked(getPlaceLive)…).
  return { ...actual, searchTextLive: vi.fn(async () => null), searchNearbyLive: vi.fn(async () => null), getPlaceLive: vi.fn(async () => null) };
});
