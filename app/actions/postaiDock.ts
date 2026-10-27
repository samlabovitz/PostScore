"use server";

// The "Ask PostAI" panel's data, loaded only when the owner opens it —
// never on page load (components/assistant/PostAIDock.tsx). Same limits
// and checks as before, all on the server: Free 3 questions a week
// (lib/freeAiUsage.server.ts), Grow 100 a month, Premium/Multi unlimited,
// the fact checker and FREE_AI_MONTHLY_CAP (sendAssistantMessage).

import { getBusinessSummary } from "@/app/actions/businesses";
import { getAssistantPageData, getPostaiMonthlyStatus } from "@/app/actions/assistant";
import { freeAiAllowance } from "@/lib/freeAiUsage.server";
import type { FreeAiAllowance } from "@/lib/freeAiAllowance";
import type { AssistantBusinessContext } from "@/lib/assistant";
import { getPlan } from "@/lib/premium";
import { createClient } from "@/lib/supabase/server";

export type PostaiDockData =
  | { status: "ok"; kind: "free"; allowance: FreeAiAllowance }
  | {
      status: "ok";
      kind: "paid";
      context: AssistantBusinessContext;
      /** Grow: questions left this month; null on Premium/Multi (unlimited). */
      monthly: { left: number; total: number; resetsAt: string } | null;
    }
  | { status: "unavailable" };

export async function loadPostaiDock(businessId: string): Promise<PostaiDockData> {
  try {
    // Ownership first (not_found for anyone else's business).
    const summary = await getBusinessSummary(businessId);
    if (summary.status !== "ok") return { status: "unavailable" };
    if ((await getPlan()) === "free") {
      return { status: "ok", kind: "free", allowance: await freeAiAllowance(businessId, "postai") };
    }
    const [page, monthly] = await Promise.all([getAssistantPageData(businessId), getPostaiMonthlyStatus(businessId)]);
    if (page.status !== "ok") return { status: "unavailable" };
    return { status: "ok", kind: "paid", context: page.context, monthly };
  } catch {
    return { status: "unavailable" };
  }
}

/** "Got it" on the one-time intro: remembered on the account (every
 * device), in the signed-in user's own metadata. */
export async function markPostaiIntroSeen(): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.user_metadata?.postai_intro_seen === true) return;
    await supabase.auth.updateUser({ data: { postai_intro_seen: true } });
  } catch {
    // The device remembers it too (localStorage) — never an error for the owner.
  }
}
