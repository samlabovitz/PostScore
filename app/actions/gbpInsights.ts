"use server";

// "Loading your Google numbers…": the Google Profile tab asks for this
// when a connected business has nothing stored for the last full month
// (lib/gbpInsights.server.ts syncInsights — the 18-month backfill, or the
// missing months; one run at a time). The owner check is RLS: a business
// the user doesn't own isn't found. The real error is logged.

export type SyncGoogleNumbersResult = { status: "ok"; hasLastMonth: boolean } | { status: "busy" } | { status: "failed" };

export async function syncGoogleNumbers(businessId: string): Promise<SyncGoogleNumbersResult> {
  // Loaded here, not at the top: the tab (a client component) imports this action.
  const { createClient } = await import("@/lib/supabase/server");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createClient();
  const { data: owned } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!owned) return { status: "failed" };
  const { syncInsights } = await import("@/lib/gbpInsights.server");
  const run = await syncInsights(createAdminClient(), businessId).catch((err: unknown) => {
    console.error(`[gbp-insights] sync for ${businessId} threw: ${err instanceof Error ? err.message.slice(0, 160) : "error"}`);
    return { status: "failed", step: "error" } as const;
  });
  if (run.status === "ok") return { status: "ok", hasLastMonth: run.hasLastMonth };
  if (run.status === "busy") return { status: "busy" };
  console.error(`[gbp-insights] sync for ${businessId}: ${run.status}${run.status === "failed" ? ` (${run.step})` : run.status === "skipped" ? ` (${run.reason})` : ""}`);
  return { status: "failed" };
}
