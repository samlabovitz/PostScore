// Server-only. Reads a connected business's own monthly numbers from
// Google's Business Profile Performance API and keeps only the monthly
// totals (lib/gbpInsights.ts, supabase/gbp-monthly-insights.sql) — the
// daily series are summed here and dropped.
//
// When it runs:
//   - the 1st of every month: the month that just ended, for every
//     connected business (app/api/cron/gbp-insights, driven by
//     netlify/functions/gbp-insights-*.mts);
//   - once, on connect or on the first Google Profile tab visit with no
//     rows: the last 18 full months (for "vs the same months last year");
//   - by hand: scripts/fetch-insights.ts.
//
// Two reads per run (the daily series for the whole range in one call, and
// the newest month's search terms), counted against the 300/min with the
// other Google calls (lib/gbpQuota.ts). A rejected token (401) is
// refreshed and the call tried once more — one failure never deletes the
// tokens. Any failure writes nothing, so the stored months stay as they were.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessTokenWithClient, markGbpReconnect } from "@/lib/gbpTokens.server";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import {
  BACKFILL_MONTHS,
  DAILY_METRICS,
  addMonths,
  fromRow,
  lastFullMonth,
  monthBounds,
  monthlyTotals,
  monthRange,
  topKeywords,
  toRow,
  type InsightsMonth,
  type InsightsRow,
  type KeywordsResponse,
  type MultiDailyResponse,
} from "@/lib/gbpInsights";

const BASE = "https://businessprofileperformance.googleapis.com/v1";
const MAX_KEYWORD_PAGES = 3;

type Call<T> = { ok: true; data: T } | { ok: false; status: number | null; reason: string | null };

async function getJson<T>(f: typeof fetch, token: string, url: string): Promise<Call<T>> {
  try {
    const res = await f(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json().catch(() => null)) as (T & { error?: { status?: string; message?: string } }) | null;
    if (!res.ok) return { ok: false, status: res.status, reason: body?.error?.status ?? null };
    return { ok: true, data: (body ?? {}) as T };
  } catch {
    return { ok: false, status: null, reason: "network" };
  }
}

/** One call: every daily metric for the whole range of months. */
export function dailyMetricsUrl(locationName: string, months: string[], metrics: readonly string[] = DAILY_METRICS): string {
  const url = new URL(`${BASE}/${locationName}:fetchMultiDailyMetricsTimeSeries`);
  for (const m of metrics) url.searchParams.append("dailyMetrics", m);
  const { start } = monthBounds(months[0]);
  const { end } = monthBounds(months[months.length - 1]);
  url.searchParams.set("dailyRange.start_date.year", String(start.year));
  url.searchParams.set("dailyRange.start_date.month", String(start.month));
  url.searchParams.set("dailyRange.start_date.day", String(start.day));
  url.searchParams.set("dailyRange.end_date.year", String(end.year));
  url.searchParams.set("dailyRange.end_date.month", String(end.month));
  url.searchParams.set("dailyRange.end_date.day", String(end.day));
  return url.toString();
}

export function keywordsUrl(locationName: string, month: string, pageToken?: string): string {
  const [year, m] = month.split("-");
  const url = new URL(`${BASE}/${locationName}/searchkeywords/impressions/monthly`);
  url.searchParams.set("monthlyRange.start_month.year", year);
  url.searchParams.set("monthlyRange.start_month.month", String(Number(m)));
  url.searchParams.set("monthlyRange.end_month.year", year);
  url.searchParams.set("monthlyRange.end_month.month", String(Number(m)));
  url.searchParams.set("pageSize", "100");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  return url.toString();
}

/** The months' totals from Google (and the newest month's search terms). */
export async function fetchMonths(
  f: typeof fetch,
  token: string,
  locationName: string,
  months: string[]
): Promise<{ ok: true; months: InsightsMonth[]; keywordsOk: boolean } | { ok: false; status: number | null; reason: string | null }> {
  let daily = await getJson<MultiDailyResponse>(f, token, dailyMetricsUrl(locationName, months));
  // Food orders aren't offered for every business: ask again without them.
  if (!daily.ok && daily.status === 400) daily = await getJson<MultiDailyResponse>(f, token, dailyMetricsUrl(locationName, months, DAILY_METRICS.filter((m) => m !== "BUSINESS_FOOD_ORDERS")));
  if (!daily.ok) return daily;
  const rows = monthlyTotals(daily.data, months);

  // Search terms: the newest month only (Google keeps them per month).
  const newest = months[months.length - 1];
  const pages: KeywordsResponse[] = [];
  let pageToken: string | undefined;
  let keywordsOk = true;
  for (let i = 0; i < MAX_KEYWORD_PAGES; i++) {
    const page = await getJson<KeywordsResponse>(f, token, keywordsUrl(locationName, newest, pageToken));
    if (!page.ok) {
      keywordsOk = false;
      break;
    }
    pages.push(page.data);
    pageToken = page.data.nextPageToken;
    if (!pageToken) break;
  }
  const last = rows.find((r) => r.month === newest);
  if (last && keywordsOk) last.topKeywords = topKeywords(pages);
  return { ok: true, months: rows, keywordsOk };
}

/** A row without the columns supabase/gbp-insights-interactions.sql adds. */
function withoutInteractionColumns(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  delete out.conversations;
  delete out.food_orders;
  return out;
}

export type InsightsRun =
  | { status: "ok"; months: number }
  | { status: "skipped"; reason: "not_connected" | "no_table" }
  | { status: "reconnect" }
  | { status: "failed"; step: string };

function logFailure(step: string, details: Record<string, unknown> = {}) {
  console.warn(`[gbp-insights] ${step} failed`, JSON.stringify(details));
}

/** Read `months` from Google and save their totals. Nothing is written on
 * any failure, so stored months stay as they were. */
export async function runInsightsFetchWithClient(admin: SupabaseClient, businessId: string, months: string[], fetchImpl: typeof fetch = fetch, now: Date = new Date()): Promise<InsightsRun> {
  if (months.length === 0) return { status: "ok", months: 0 };
  const { data: conn } = await admin.from("gbp_connections").select("status, google_location_id").eq("business_id", businessId).maybeSingle();
  const location = (conn as { status?: string; google_location_id?: string | null } | null)?.google_location_id;
  if ((conn as { status?: string } | null)?.status !== "connected" || typeof location !== "string" || !location.startsWith("locations/")) return { status: "skipped", reason: "not_connected" };

  const counter = { calls: 0 };
  const f = gbpFetch(counter, fetchImpl);
  try {
    let token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl, now.getTime());
    if (token.status !== "ok") {
      if (token.reason === "not_connected") return { status: "skipped", reason: "not_connected" };
      logFailure("token", { reason: token.reason });
      return token.reason === "reconnect" ? { status: "reconnect" } : { status: "failed", step: "token" };
    }
    let fetched = await fetchMonths(f, token.accessToken, location, months);
    if (!fetched.ok && fetched.status === 401) {
      // A stale token: refresh and try once more. Only a refused refresh loses the connection.
      const checked = await markGbpReconnect(admin, businessId, fetchImpl);
      if (checked.status === "error" && checked.reason === "reconnect") return { status: "reconnect" };
      token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl);
      if (token.status !== "ok") return { status: "failed", step: "token" };
      fetched = await fetchMonths(f, token.accessToken, location, months);
    }
    if (!fetched.ok) {
      logFailure("performance", { status: fetched.status, reason: fetched.reason });
      return { status: "failed", step: `performance ${fetched.status ?? "network"}${fetched.reason ? ` ${fetched.reason}` : ""}` };
    }
    if (fetched.months.length === 0) return { status: "ok", months: 0 };

    const at = now.toISOString();
    // Search terms are saved only when Google answered for them, so a
    // failed read never blanks the ones already stored.
    const rows = fetched.months.map((m) => {
      const row = toRow(businessId, m, at);
      const { top_keywords, ...rest } = row;
      return m.topKeywords ? { ...rest, top_keywords } : rest;
    });
    const withTerms = rows.filter((r) => "top_keywords" in r);
    const without = rows.filter((r) => !("top_keywords" in r));
    for (const batch of [without, withTerms]) {
      if (batch.length === 0) continue;
      let { error } = await admin.from("gbp_monthly_insights").upsert(batch, { onConflict: "business_id,month" });
      // Before supabase/gbp-insights-interactions.sql: save without messages / food orders.
      if (error && (error.code === "PGRST204" || error.code === "42703")) ({ error } = await admin.from("gbp_monthly_insights").upsert(batch.map(withoutInteractionColumns), { onConflict: "business_id,month" }));
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") return { status: "skipped", reason: "no_table" };
        logFailure("save", { code: error.code ?? null });
        return { status: "failed", step: "save" };
      }
    }
    return { status: "ok", months: fetched.months.length };
  } finally {
    logGbpCalls("insights", counter);
  }
}

/** The stored months, oldest first (RLS client on pages, admin in jobs). */
export async function loadInsights(db: SupabaseClient, businessId: string, count = BACKFILL_MONTHS + 1): Promise<{ ok: true; months: InsightsMonth[] } | { ok: false }> {
  const { data, error } = await db.from("gbp_monthly_insights").select("*").eq("business_id", businessId).order("month", { ascending: false }).limit(count);
  if (error) return { ok: false };
  return { ok: true, months: ((data ?? []) as InsightsRow[]).map(fromRow).reverse() };
}

export type SyncResult =
  | { status: "ok"; months: number; hasLastMonth: boolean }
  | { status: "busy" }
  | { status: "skipped"; reason: "not_connected" | "no_table" }
  | { status: "reconnect" }
  | { status: "failed"; step: string };

const SYNC_LOCK_MS = 5 * 60 * 1000;
const MISSING_COLUMN = new Set(["PGRST204", "42703"]);

/** The months to read: all 18 when nothing is stored, else every month
 * after the newest stored one up to the last full month (at most 18). */
export function monthsToSync(stored: string[], now: Date): string[] {
  const target = lastFullMonth(now);
  const newest = [...stored].sort().pop();
  if (!newest) return monthRange(target, BACKFILL_MONTHS);
  const missing: string[] = [];
  for (let m = addMonths(newest, 1); m <= target && missing.length < BACKFILL_MONTHS; m = addMonths(m, 1)) missing.push(m);
  return missing;
}

/** Bring a connected business's stored months up to the last full month:
 * the 18-month backfill when nothing is stored, else only what's missing.
 * One run at a time per business (a 5-minute claim on gbp_connections);
 * a second caller gets "busy". Nothing is written on failure. */
export async function syncInsights(admin: SupabaseClient, businessId: string, fetchImpl: typeof fetch = fetch, now: Date = new Date()): Promise<SyncResult> {
  const stored = await loadInsights(admin, businessId);
  if (!stored.ok) return { status: "skipped", reason: "no_table" };
  const months = monthsToSync(stored.months.map((m) => m.month), now);
  if (months.length === 0) return { status: "ok", months: 0, hasLastMonth: true };

  // The claim: only if nobody started a sync in the last 5 minutes.
  const stale = new Date(now.getTime() - SYNC_LOCK_MS).toISOString();
  const claim = await admin
    .from("gbp_connections")
    .update({ insights_sync_started_at: now.toISOString() })
    .eq("business_id", businessId)
    .eq("status", "connected")
    .or(`insights_sync_started_at.is.null,insights_sync_started_at.lt.${stale}`)
    .select("business_id");
  // Before supabase/gbp-insights-interactions.sql there's no claim column: go on without it.
  if (claim.error && !MISSING_COLUMN.has(claim.error.code ?? "")) return { status: "failed", step: "claim" };
  if (!claim.error && (claim.data ?? []).length === 0) {
    const { data: conn } = await admin.from("gbp_connections").select("status").eq("business_id", businessId).maybeSingle();
    return (conn as { status?: string } | null)?.status === "connected" ? { status: "busy" } : { status: "skipped", reason: "not_connected" };
  }

  const run = await runInsightsFetchWithClient(admin, businessId, months, fetchImpl, now);
  const release: Record<string, unknown> = claim.error ? {} : { insights_sync_started_at: null };
  if (run.status === "ok") release.insights_backfilled_at = now.toISOString();
  if (Object.keys(release).length > 0) await admin.from("gbp_connections").update(release).eq("business_id", businessId);
  if (run.status !== "ok") return run;
  const after = await loadInsights(admin, businessId, 2);
  return { status: "ok", months: run.months, hasLastMonth: after.ok && after.months.some((m) => m.month === lastFullMonth(now)) };
}

/** Kept for the connect callback: the same as a sync. */
export async function backfillInsightsIfNeeded(admin: SupabaseClient, businessId: string, fetchImpl: typeof fetch = fetch, now: Date = new Date()): Promise<SyncResult> {
  return syncInsights(admin, businessId, fetchImpl, now);
}

/** The monthly job for one business: everything missing up to the month
 * that just ended (the 18-month backfill when nothing is stored yet). */
export async function runMonthlyInsightsForBusiness(admin: SupabaseClient, businessId: string, fetchImpl: typeof fetch = fetch, now: Date = new Date()): Promise<SyncResult> {
  return syncInsights(admin, businessId, fetchImpl, now);
}

export interface DayDate {
  year: number;
  month: number;
  day: number;
}

/** Live totals for an exact date range, nothing saved — for checking our
 * numbers against Google's own Performance screen (scripts/check-insights.ts). */
export async function readRangeTotalsLive(
  admin: SupabaseClient,
  businessId: string,
  from: DayDate,
  to: DayDate,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: true; views: number; interactions: number; byMetric: Record<string, number> } | { ok: false; error: string }> {
  const { data: conn } = await admin.from("gbp_connections").select("status, google_location_id").eq("business_id", businessId).maybeSingle();
  const location = (conn as { google_location_id?: string | null } | null)?.google_location_id;
  if (typeof location !== "string" || !location.startsWith("locations/")) return { ok: false, error: "not connected" };
  const token = await getValidAccessTokenWithClient(admin, businessId, fetchImpl);
  if (token.status !== "ok") return { ok: false, error: `token: ${token.reason}` };
  const url = new URL(`${BASE}/${location}:fetchMultiDailyMetricsTimeSeries`);
  for (const m of DAILY_METRICS) url.searchParams.append("dailyMetrics", m);
  for (const [k, d] of [["start", from], ["end", to]] as const) {
    url.searchParams.set(`dailyRange.${k}_date.year`, String(d.year));
    url.searchParams.set(`dailyRange.${k}_date.month`, String(d.month));
    url.searchParams.set(`dailyRange.${k}_date.day`, String(d.day));
  }
  const counter = { calls: 0 };
  const res = await getJson<MultiDailyResponse>(gbpFetch(counter, fetchImpl), token.accessToken, url.toString());
  logGbpCalls("insights-check", counter);
  if (!res.ok) return { ok: false, error: `Google ${res.status ?? "network"} ${res.reason ?? ""}`.trim() };
  const byMetric: Record<string, number> = {};
  for (const g of res.data.multiDailyMetricTimeSeries ?? [])
    for (const sr of g.dailyMetricTimeSeries ?? []) {
      const key = sr.dailyMetric ?? "?";
      byMetric[key] = (byMetric[key] ?? 0) + (sr.timeSeries?.datedValues ?? []).reduce((a, dv) => a + (Number(dv.value) || 0), 0);
    }
  const views = ["BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_DESKTOP_MAPS"].reduce((a, k) => a + (byMetric[k] ?? 0), 0);
  const interactions = ["CALL_CLICKS", "BUSINESS_DIRECTION_REQUESTS", "WEBSITE_CLICKS", "BUSINESS_BOOKINGS", "BUSINESS_CONVERSATIONS", "BUSINESS_FOOD_ORDERS"].reduce((a, k) => a + (byMetric[k] ?? 0), 0);
  return { ok: true, views, interactions, byMetric };
}

/** When the last sync finished (gbp_connections.insights_backfilled_at). */
export async function loadInsightsSyncedAt(db: SupabaseClient, businessId: string): Promise<string | null> {
  const { data, error } = await db.from("gbp_connections").select("insights_backfilled_at").eq("business_id", businessId).maybeSingle();
  if (error) return null;
  return (data as { insights_backfilled_at?: string | null } | null)?.insights_backfilled_at ?? null;
}

/** Connected businesses, a page at a time (the job's chunks). */
export async function connectedBusinessIds(admin: SupabaseClient, offset: number, limit: number): Promise<string[]> {
  const { data } = await admin.from("gbp_connections").select("business_id").eq("status", "connected").order("business_id").range(offset, offset + limit - 1);
  return ((data ?? []) as Array<{ business_id: string }>).map((r) => r.business_id);
}

/** The booking button and whether Google can count its bookings
 * (lib/bookingPartners.ts), for a connected business: the real link (cached
 * read), the stored months' bookings and the "I turned it on" snooze. */
export async function loadBookingState(admin: SupabaseClient, businessId: string, months: InsightsMonth[], now: Date = new Date()) {
  const { readRealListingCached } = await import("@/lib/gbpRealListing.server");
  const { bookingLink, bookingTracking } = await import("@/lib/bookingPartners");
  const read = await readRealListingCached(admin, businessId);
  if (!read.ok) return null;
  const link = bookingLink(read.listing.placeActionLinks);
  const { data } = await admin.from("gbp_connections").select("booking_reminder_snoozed_at").eq("business_id", businessId).maybeSingle();
  const snoozedAt = (data as { booking_reminder_snoozed_at?: string | null } | null)?.booking_reminder_snoozed_at ?? null;
  return { link, tracking: bookingTracking(link, months.map((m) => m.bookings + m.foodOrders), snoozedAt, now.getTime()) };
}
