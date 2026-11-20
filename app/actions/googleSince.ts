"use server";

// Day 23C. "Since you did this": the Google Profile tab's card asks for the
// 30 days after vs the 30 days before each recent action. The daily numbers
// are read live from Google's Performance API (connected owners only), kept
// in memory for 10 minutes, and never stored. The owner check is RLS: a
// business the user doesn't own isn't found.
//
// And the revenue estimate's "how many of these become paying visits"
// (businesses.visit_share, supabase/day23c-google-tab.sql).

import type { WindowTotals } from "@/lib/googleRecommendations";

export type SinceResult =
  | { status: "ok"; results: Array<{ date: string; days: number; before: WindowTotals; after: WindowTotals } | { date: string; days: null }> }
  | { status: "not_connected" | "reconnect" | "failed" };

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: SinceResult }>();

export async function loadSinceNumbers(businessId: string, dates: string[]): Promise<SinceResult> {
  const clean = Array.from(new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))).slice(0, 3);
  if (clean.length === 0) return { status: "ok", results: [] };
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = createClient();
  const { data: owned } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!owned) return { status: "failed" };
  const key = `${businessId}|${clean.sort().join(",")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const { addDays, beforeAfter, sinceRange } = await import("@/lib/googleRecommendations");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { readDailyNumbers } = await import("@/lib/gbpInsights.server");
  const yesterday = addDays(new Date().toISOString().slice(0, 10), -1);
  const start = sinceRange(clean[0]).start;
  const end = [sinceRange(clean[clean.length - 1]).end, yesterday].sort()[0];
  const read = await readDailyNumbers(createAdminClient(), businessId, start, end).catch(() => ({ ok: false as const, reason: "failed" as const }));
  if (!read.ok) return { status: read.reason };
  const through = read.dataThrough ?? start;
  const value: SinceResult = {
    status: "ok",
    results: clean.map((date) => {
      const r = beforeAfter(read.days, date, through);
      return r ? { date, ...r } : { date, days: null };
    }),
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

export type SaveVisitShareResult = { status: "ok"; value: number | null } | { status: "error"; error: "invalid" | "not_ready" | "failed" };

/** null: back to PostScore's default (a third to all). */
export async function saveVisitShare(businessId: string, share: number | null): Promise<SaveVisitShareResult> {
  if (share !== null && !(Number.isFinite(share) && share > 0 && share <= 1)) return { status: "error", error: "invalid" };
  const { createClient } = await import("@/lib/supabase/server");
  const { revalidatePath } = await import("next/cache");
  const supabase = createClient();
  const { data, error } = await supabase.from("businesses").update({ visit_share: share }).eq("id", businessId).select("id");
  if (error) return { status: "error", error: error.code === "PGRST204" || error.code === "42703" ? "not_ready" : "failed" };
  if (!data || data.length === 0) return { status: "error", error: "failed" };
  revalidatePath(`/business/${businessId}/growth`);
  return { status: "ok", value: share };
}

export type MonthSoFarResult = { status: "ok"; month: string; through: string; calls: number; websiteClicks: number; directions: number } | { status: "none" | "not_connected" | "reconnect" | "failed" };
const soFarCache = new Map<string, { at: number; value: MonthSoFarResult }>();

/** "November so far": this month's calls, website clicks and directions,
 * from the 1st (business time zone) to the last day Google has. Read live,
 * never stored; 10 minutes in memory. */
export async function loadMonthSoFar(businessId: string, timeZone: string): Promise<MonthSoFarResult> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = createClient();
  const { data: owned } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!owned) return { status: "failed" };
  const { localToday, monthSoFar } = await import("@/lib/googleRecommendations");
  let today: string;
  try {
    today = localToday(Date.now(), timeZone).date;
  } catch {
    return { status: "failed" };
  }
  const key = `${businessId}|${today}`;
  const hit = soFarCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const first = `${today.slice(0, 7)}-01`;
  if (first === today) return { status: "none" };
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { readDailyNumbers } = await import("@/lib/gbpInsights.server");
  const { addDays } = await import("@/lib/googleRecommendations");
  const read = await readDailyNumbers(createAdminClient(), businessId, first, addDays(today, -1)).catch(() => ({ ok: false as const, reason: "failed" as const }));
  if (!read.ok) return { status: read.reason };
  const sum = monthSoFar(read.days, first, read.dataThrough);
  const value: MonthSoFarResult = sum ? { status: "ok", month: today.slice(0, 7), ...sum } : { status: "none" };
  soFarCache.set(key, { at: Date.now(), value });
  return value;
}
