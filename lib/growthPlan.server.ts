// Server-only. Day 25B step 6: a business's Growth tier for its pages — the
// real tier, computed from its own facts (lib/growthTier.server.ts) as of
// today (the Monday job is off; nothing is saved here). Free never gets a
// tier (only "?"). The dev test login may show a preview tier (lib/devTier.ts)
// and sees "Test account". Reads only.
import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlan } from "@/lib/premium";
import { DEV_TIER_COOKIE, devPreviewKeep, devPreviewTier, devTierAllowed } from "@/lib/devTier";
import { loadGrowthFacts, loadInternalAccounts, type InternalAccounts } from "@/lib/growthTier.server";
import { growthState, type GrowthState } from "@/lib/growthPlan";
import type { GrowthFacts } from "@/lib/growthTier";

export type GrowthView =
  | { status: "free" }
  | { status: "ok"; state: GrowthState; facts: GrowthFacts; testAccount: boolean }
  | { status: "unavailable" };

// The internal-account list changes rarely: kept 10 minutes per server.
const g = globalThis as { __growthInternal?: { at: number; value: InternalAccounts } };
async function internalAccounts(): Promise<InternalAccounts> {
  if (g.__growthInternal && Date.now() - g.__growthInternal.at < 10 * 60_000) return g.__growthInternal.value;
  const value = await loadInternalAccounts(createAdminClient());
  g.__growthInternal = { at: Date.now(), value };
  return value;
}

export async function loadGrowthView(businessId: string, now: Date = new Date()): Promise<GrowthView> {
  try {
    if ((await getPlan()) === "free") return { status: "free" };
    const db = createClient();
    const [{ data: own }, { data: auth }] = await Promise.all([db.from("businesses").select("id").eq("id", businessId).maybeSingle(), db.auth.getUser()]);
    // Only the owner's own business (RLS) — then the server's own reads.
    if (!own) return { status: "unavailable" };
    const loaded = await loadGrowthFacts(createAdminClient(), businessId, await internalAccounts());
    if (!loaded) return { status: "unavailable" };
    const allowed = devTierAllowed(process.env, auth.user?.email);
    let cookie: string | undefined;
    try {
      cookie = cookies().get(DEV_TIER_COOKIE)?.value;
    } catch {
      cookie = undefined;
    }
    const preview = devPreviewTier(cookie, allowed);
    return { status: "ok", state: growthState(loaded.facts, now, preview, devPreviewKeep(cookie, allowed)), facts: loaded.facts, testAccount: loaded.ownerKind === "dev" };
  } catch {
    return { status: "unavailable" };
  }
}
