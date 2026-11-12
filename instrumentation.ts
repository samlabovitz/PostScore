// Runs once when the server starts (Next.js instrumentation hook).
// Warns when GOOGLE_WRITES_LIVE_PLACES is "all" outside production, or an
// old per-feature allow list is still set (lib/gbpReviewPractice.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { googleWritesStartupWarnings } = await import("@/lib/gbpReviewPractice");
  for (const line of googleWritesStartupWarnings()) console.warn(line);
}
