"use server";

// Premium "Edit on Google" (the Google Profile tab): hours, phone and
// description on the owner's own Google Business Profile
// (lib/gbpProfileEdits.server.ts). The same gate as "Update website on
// Google" (lib/gbpEditGate.server.ts: the signed-in owner, Premium, not
// archived, Google connected with a matched location). Opening and
// drafting only read; only "Approve" and "Yes, undo" write to Google.
//
// Two test switches (lib/gbpReviewPractice.ts):
// - practice mode (REVIEW_REPLIES_PRACTICE=1, never in production): the
//   same code against a fake Google with a sample listing — no connection
//   needed, nothing ever sent;
// - otherwise the real values load read-only, and Approve / Undo are
//   refused here unless the business's place id is in
//   GOOGLE_WRITES_LIVE_PLACES (default: none).
// Editing never marks a recommendation done: a later scan confirms it.

import { revalidatePath } from "next/cache";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import { googleWritesAllowed, reviewRepliesPracticeOn } from "@/lib/gbpReviewPractice";
import {
  cleanDescription,
  descriptionProblems,
  descriptionSystemPrompt,
  hoursProblems,
  isProfileField,
  samePhone,
  sameWeek,
  usPhone,
  weekFromSite,
  weekInput,
  type DescriptionProblem,
  type HoursProblem,
  type ProfileField,
  type ProfileValue,
  type WeeklyHours,
} from "@/lib/gbpProfileEdits";
import type { ProfileEditError, ProfileUndo } from "@/lib/gbpProfileEdits.server";

type Context = {
  ok: true;
  admin: import("@supabase/supabase-js").SupabaseClient;
  target: import("@/lib/gbpProfileEdits.server").ProfileTarget;
  practice: boolean;
  canEdit: boolean;
  fetchImpl: typeof fetch;
  business: { name: string | null; language: string | null };
};
type Blocked = { ok: false; result: { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: ProfileEditError } };

async function context(businessId: string): Promise<Context | Blocked> {
  if (reviewRepliesPracticeOn()) {
    const [{ practiceOwnerGate }, practice] = await Promise.all([import("@/lib/gbpPracticeGate.server"), import("@/lib/gbpProfilePractice.server")]);
    const gate = await practiceOwnerGate(businessId);
    if (!gate.ok) return gate;
    return {
      ok: true,
      admin: gate.admin,
      target: { businessId, userId: gate.userId, locationName: practice.PRACTICE_PROFILE_LOCATION, accessToken: "practice-token" },
      practice: true,
      canEdit: true,
      fetchImpl: practice.practiceProfileFetch(businessId),
      business: { name: gate.business.name, language: gate.business.language },
    };
  }
  const { gbpEditGate } = await import("@/lib/gbpEditGate.server");
  const gate = await gbpEditGate(businessId, { requirePremium: true });
  if (!gate.ok) return { ok: false, result: gate.result.status === "blocked" ? gate.result : { status: "error", error: gate.result.error } };
  const { data: row } = await gate.admin.from("businesses").select("place_id, name").eq("id", businessId).maybeSingle();
  const r = row as { place_id: string | null; name: string | null } | null;
  return {
    ok: true,
    admin: gate.admin,
    target: { businessId, userId: gate.target.userId, locationName: gate.target.locationName, accessToken: gate.target.accessToken },
    practice: false,
    canEdit: googleWritesAllowed(r?.place_id),
    fetchImpl: fetch,
    business: { name: r?.name ?? null, language: gate.business.language },
  };
}

async function markReconnect(c: Context, error: ProfileEditError) {
  if (error === "reconnect" && !c.practice) {
    const { markGbpReconnect } = await import("@/lib/gbpTokens.server");
    await markGbpReconnect(c.admin, c.target.businessId);
  }
}

export interface ProfileEditsView {
  status: "ok";
  hours: WeeklyHours | null;
  phone: string | null;
  description: string | null;
  /** Fields Google is still reviewing. */
  pending: ProfileField[];
  /** What the website shows, when it differs from Google (from the last scan; practice: the sample site). */
  fromWebsite: { hours: WeeklyHours | null; phone: string | null };
  undo: Partial<Record<ProfileField, ProfileUndo>>;
  practice: boolean;
  canEdit: boolean;
}

export type OpenProfileEditsResult = ProfileEditsView | { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: ProfileEditError };

async function undoMap(c: Context): Promise<ProfileEditsView["undo"]> {
  const { getProfileUndo, supabaseProfileEditStore } = await import("@/lib/gbpProfileEdits.server");
  const store = supabaseProfileEditStore(c.admin);
  const out: ProfileEditsView["undo"] = {};
  for (const field of ["hours", "phone", "description"] as ProfileField[]) {
    const u = await getProfileUndo(store, c.target.businessId, c.target.locationName, field, c.practice);
    if (u) out[field] = u;
  }
  return out;
}

/** The website's hours and phone, from the last scan's comparison with Google. */
async function websiteValues(c: Context): Promise<{ hours: WeeklyHours | null; phone: string | null }> {
  if (c.practice) {
    const practice = await import("@/lib/gbpProfilePractice.server");
    return { hours: weekFromSite(practice.PRACTICE_SITE_WEEK), phone: practice.PRACTICE_SITE_PHONE };
  }
  const { data } = await c.admin.from("businesses").select("website_analysis_json").eq("id", c.target.businessId).maybeSingle();
  const { parseWebsiteAnalysis } = await import("@/lib/scoring");
  const findings = parseWebsiteAnalysis((data as { website_analysis_json: unknown } | null)?.website_analysis_json)?.websiteTrust?.infoConflicts ?? [];
  const hours = findings.find((f) => f.field === "hours");
  const phone = findings.find((f) => f.field === "phone");
  return { hours: weekFromSite(hours?.siteWeek), phone: phone?.siteValue ? usPhone(phone.siteValue) : null };
}

/** Opening the section: what Google has now (read live), what the website says, and any undo. */
export async function openProfileEdits(businessId: string): Promise<OpenProfileEditsResult> {
  const c = await context(businessId);
  if (!c.ok) return c.result;
  const { readLiveProfile } = await import("@/lib/gbpProfileEdits.server");
  const live = await readLiveProfile(c.target, c.fetchImpl);
  if (!live.ok) {
    await markReconnect(c, live.error);
    return { status: "error", error: live.error };
  }
  const site = await websiteValues(c);
  return {
    status: "ok",
    hours: live.data.hours.value,
    phone: live.data.phone.value,
    description: live.data.description.value,
    pending: live.data.pending,
    // Offered only when the website says something different.
    fromWebsite: {
      hours: site.hours && !sameWeek(site.hours, live.data.hours.value) ? site.hours : null,
      phone: site.phone && !samePhone(site.phone, live.data.phone.value) ? site.phone : null,
    },
    undo: await undoMap(c),
    practice: c.practice,
    canEdit: c.canEdit,
  };
}

export type ApplyProfileEditActionResult =
  | { status: "updated"; value: ProfileValue; undo: ProfileUndo | null }
  | { status: "pending_review"; undo: ProfileUndo | null }
  | { status: "unconfirmed"; undo: ProfileUndo | null }
  | { status: "no_change" }
  /** Checked here before anything is sent. */
  | { status: "invalid"; hours?: HoursProblem[]; description?: DescriptionProblem[] }
  /** Not practice mode, and this business isn't on GOOGLE_WRITES_LIVE_PLACES. Nothing sent. */
  | { status: "editing_off" }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: ProfileEditError | "undo_expired" | "changed_since" };

/** The value from the browser, checked like it will be by Google — or why not. */
function checkValue(field: ProfileField, raw: unknown): { ok: true; value: ProfileValue } | { ok: false; result: Extract<ApplyProfileEditActionResult, { status: "invalid" }> } {
  if (field === "hours") {
    const week = weekInput(raw);
    if (!week) return { ok: false, result: { status: "invalid", hours: [] } };
    const problems = hoursProblems(week);
    return problems.length ? { ok: false, result: { status: "invalid", hours: problems } } : { ok: true, value: { field, value: week } };
  }
  if (field === "phone") {
    const phone = usPhone(raw);
    return phone ? { ok: true, value: { field, value: phone } } : { ok: false, result: { status: "invalid" } };
  }
  const text = cleanDescription(raw) ?? "";
  const problems = descriptionProblems(text);
  return problems.length ? { ok: false, result: { status: "invalid", description: problems } } : { ok: true, value: { field, value: text } };
}

async function afterChange(c: Context, field: ProfileField, result: Awaited<ReturnType<typeof import("@/lib/gbpProfileEdits.server").applyProfileEdit>>): Promise<ApplyProfileEditActionResult> {
  if (result.status === "error") {
    await markReconnect(c, result.error);
    return { status: "error", error: result.error };
  }
  if (result.status === "no_change") return result;
  // The score and recommendations wait for the next scan to see it live.
  if (!c.practice) revalidatePath(`/business/${c.target.businessId}`, "layout");
  const undo = (await undoMap(c))[field] ?? null;
  if (result.status === "updated") return { status: "updated", value: result.value, undo };
  return { status: result.status, undo };
}

/** "Approve" (Beta) — after the owner saw Google's value and theirs. */
export async function applyProfileEditAction(businessId: string, field: ProfileField, raw: unknown, practiceOutcome: unknown = null): Promise<ApplyProfileEditActionResult> {
  if (!isProfileField(field)) return { status: "invalid" };
  const checked = checkValue(field, raw);
  if (!checked.ok) return checked.result;
  const c = await context(businessId);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  const server = await import("@/lib/gbpProfileEdits.server");
  if (c.practice) {
    const practice = await import("@/lib/gbpProfilePractice.server");
    practice.setPracticeOutcome(businessId, practice.isPracticeOutcome(practiceOutcome) ? practiceOutcome : "accept");
  }
  const result = await server.applyProfileEdit(c.target, checked.value, server.supabaseProfileEditStore(c.admin), { fetchImpl: c.fetchImpl, practice: c.practice });
  return afterChange(c, field, result);
}

/** "Yes, undo": the previous value back on Google. */
export async function undoProfileEditAction(businessId: string, field: ProfileField, batchId: string, practiceOutcome: unknown = null): Promise<ApplyProfileEditActionResult> {
  if (!isProfileField(field) || typeof batchId !== "string" || !batchId) return { status: "error", error: "undo_expired" };
  const c = await context(businessId);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  const server = await import("@/lib/gbpProfileEdits.server");
  if (c.practice) {
    const practice = await import("@/lib/gbpProfilePractice.server");
    practice.setPracticeOutcome(businessId, practice.isPracticeOutcome(practiceOutcome) ? practiceOutcome : "accept");
  }
  const result = await server.undoProfileEdit(c.target, field, batchId, server.supabaseProfileEditStore(c.admin), { fetchImpl: c.fetchImpl, practice: c.practice });
  if (result.status === "error" && (result.error === "undo_expired" || result.error === "changed_since")) return { status: "error", error: result.error };
  return afterChange(c, field, result as Awaited<ReturnType<typeof server.applyProfileEdit>>);
}

export type DraftDescriptionResult = { status: "ok"; text: string } | { status: "rules" } | { status: "unavailable" } | { status: "blocked"; reason: GbpEditBlock };

/** "Draft with PostAI": a description from what PostScore knows, following Google's rules. Reads only. */
export async function draftProfileDescription(businessId: string): Promise<DraftDescriptionResult> {
  const c = await context(businessId);
  if (!c.ok) return c.result.status === "blocked" ? c.result : { status: "unavailable" };
  const { data } = await c.admin
    .from("businesses")
    .select("name, category, primary_type, address, services, differentiator, language, listing_has_accessibility, listing_has_parking, listing_has_payment")
    .eq("id", businessId)
    .maybeSingle();
  const b = (data ?? {}) as Record<string, unknown>;
  const { normalizeLocale } = await import("@/lib/i18n");
  const { extractCityFromAddress } = await import("@/lib/websiteTrust");
  const locale = normalizeLocale(typeof b.language === "string" ? b.language : null);
  const facts = [
    `Name: ${b.name ?? c.business.name ?? ""}`,
    b.category ? `Category: ${b.category}` : null,
    typeof b.address === "string" && extractCityFromAddress(b.address) ? `City: ${extractCityFromAddress(b.address)}` : null,
    Array.isArray(b.services) && b.services.length ? `Services: ${(b.services as unknown[]).filter((s) => typeof s === "string").slice(0, 12).join(", ")}` : null,
    typeof b.differentiator === "string" && b.differentiator.trim() ? `What sets it apart (the owner's words): ${b.differentiator.trim().slice(0, 300)}` : null,
    b.listing_has_accessibility === true ? "Wheelchair accessible: yes" : null,
    b.listing_has_parking === true ? "Parking information is on the listing" : null,
  ].filter(Boolean);
  const { callAnthropicMessage } = await import("@/lib/anthropicClient");
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string;
    try {
      text = (await callAnthropicMessage({ system: descriptionSystemPrompt(locale), userMessage: `<facts>\n${facts.join("\n")}\n</facts>`, maxTokens: 400 })).trim().replace(/^["“]|["”]$/g, "");
    } catch {
      return { status: "unavailable" };
    }
    // The same rules as the owner's own text — never shown if it breaks one.
    if (text && descriptionProblems(text).length === 0) return { status: "ok", text };
  }
  return { status: "rules" };
}
