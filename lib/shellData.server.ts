// Server-only. Day 25B step 4: the sidebar's values (components/layout/ShellData.tsx)
// — the latest saved scan's total and grade (our own result, never a
// re-score, no Google call), the plan, and whether this is the dev test
// login (the "Test account" tag). Null when the business isn't readable.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/premium";
import type { ShellData } from "@/components/layout/ShellData";
import { isMonthlyReportsLive } from "@/lib/monthlyReportsFeatureFlag";
import { reportDotVisible } from "@/lib/reportDot";
import type { Plan } from "@/lib/plan";
import type { SupabaseClient } from "@supabase/supabase-js";

export function isDevTestAccount(env: { NODE_ENV?: string; DEV_TEST_LOGIN_EMAIL?: string }, email: string | null | undefined): boolean {
  if (env.NODE_ENV !== "development" || !env.DEV_TEST_LOGIN_EMAIL || !email) return false;
  return email.trim().toLowerCase() === env.DEV_TEST_LOGIN_EMAIL.trim().toLowerCase();
}

export async function loadShellData(businessId: string): Promise<ShellData | null> {
  try {
    const db = createClient();
    const [{ data: score }, plan, auth] = await Promise.all([
      db.from("scores").select("total, grade").eq("business_id", businessId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      getPlan(),
      db.auth.getUser(),
    ]);
    const row = score as { total: number; grade: string } | null;
    const userId = auth.data.user?.id ?? null;
    return {
      presence: row ? { score: Math.round(Number(row.total)), grade: row.grade } : null,
      plan,
      testAccount: isDevTestAccount(process.env, auth.data.user?.email),
      reportsNew: userId ? await reportsNew(db, businessId, userId, plan).catch(() => false) : false,
    };
  } catch {
    return null;
  }
}

/** The Reports "New" dot (lib/reportDot.ts): never on Free; test reports only under `next dev` while not live. */
async function reportsNew(db: SupabaseClient, businessId: string, userId: string, plan: Plan): Promise<boolean> {
  const live = isMonthlyReportsLive();
  const dev = process.env.NODE_ENV === "development";
  if (plan === "free" || (!live && !dev)) return false;
  const newest = async (): Promise<string | null> => {
    if (live) {
      const { data } = await db.from("monthly_reports").select("sent_at").eq("business_id", businessId).order("sent_at", { ascending: false }).limit(1).maybeSingle();
      return (data as { sent_at: string } | null)?.sent_at ?? null;
    }
    // Testing mode: the month's test runs (server-only table) that included this business.
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data } = await createAdminClient().from("monthly_report_test_runs").select("created_at").contains("business_ids", [businessId]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return (data as { created_at: string } | null)?.created_at ?? null;
  };
  const [newestAt, opened] = await Promise.all([newest(), db.from("report_opens").select("opened_at").eq("user_id", userId).eq("business_id", businessId).maybeSingle()]);
  return reportDotVisible({ plan, live, dev, newestAt, openedAt: (opened.data as { opened_at: string } | null)?.opened_at ?? null });
}

/** Opening Reports clears the dot: this owner's "last opened" for the business. Never fails the page. */
export async function markReportsOpened(businessId: string): Promise<void> {
  try {
    const db = createClient();
    const { data } = await db.auth.getUser();
    if (!data.user) return;
    await db.from("report_opens").upsert({ user_id: data.user.id, business_id: businessId, opened_at: new Date().toISOString() }, { onConflict: "user_id,business_id" });
  } catch {
    // The dot just stays until the next open.
  }
}
