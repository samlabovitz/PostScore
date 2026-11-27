"use server";

// Day 23E, "Answer your customers' common questions" (Google retired its
// Q&A API on Nov 3, 2025 — PostScore fills in the listing details Google
// itself answers from: description, services with prices, customer
// details).
// - openAnswers: what's there now (read live), the description draft
//   (PostAI, Google's description rules) when it's under 250 characters,
//   each service with its Google price and the owner's own PostScore price,
//   and the parking / accessibility / payment details. Grow and Premium.
// - applyAnswersAction: Premium only — the parts the owner approved, in one
//   sitting (one approval), each through its existing writer with its own
//   7-day undo. Off GOOGLE_WRITES_LIVE_PLACES (and not practice mode):
//   refused, nothing sent.

import { revalidatePath } from "next/cache";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import type { AnswersListing, AnswersPayload, AnswersResult } from "@/lib/googleAnswers.server";
import type { AnswerFacts, AnswersPlan } from "@/lib/googleAnswers";

type Blocked = { status: "blocked"; reason: GbpEditBlock | "not_found" | "free" } | { status: "error"; error: string };

export type OpenAnswersResult =
  | {
      status: "ok";
      premium: boolean;
      /** Premium: PostScore can apply them (practice mode or GOOGLE_WRITES_LIVE_PLACES). */
      canEdit: boolean;
      practice: boolean;
      plan: AnswersPlan | null;
      listing: AnswersListing;
      /** PostAI's description, when the listing's is under 250 characters. */
      descriptionDraft: string | null;
      /** The owner's own PostScore prices. */
      ownerPrices: Array<{ service: string; price: number }>;
      /** For the website FAQ and the "Good to know" post. */
      facts: Pick<AnswerFacts, "name" | "city" | "hours" | "bookingUrl">;
      locale: "en" | "es";
      /** The business's kind, for the description's example ("our curly hair specialists" for a salon). */
      topic: import("@/lib/gbpPosts").PostTopic | null;
    }
  | Blocked;

/** The answers' description draft, written in the background (lib/postDrafts.server.ts) — read here, never written
 * on page load. Null until the background run has written one. */
async function answersDescription(db: import("@supabase/supabase-js").SupabaseClient, admin: import("@supabase/supabase-js").SupabaseClient, businessId: string): Promise<string | null> {
  const [{ loadDraftInputs }, { savedAnswersDescription }] = await Promise.all([import("@/lib/gbpPostsContext.server"), import("@/lib/postDrafts.server")]);
  const inputs = await loadDraftInputs(db, admin, businessId);
  if (!inputs) return null;
  return savedAnswersDescription(admin, businessId, inputs.locale);
}

export async function openAnswers(businessId: string): Promise<OpenAnswersResult> {
  const { createClient } = await import("@/lib/supabase/server");
  const db = createClient();
  const { data: row } = await db.from("businesses").select("id, place_id, listing_mode, language").eq("id", businessId).maybeSingle();
  if (!row) return { status: "blocked", reason: "not_found" };
  const [{ getPlan }, { isPremiumPlan }, { createAdminClient }, { viewLocale }] = await Promise.all([import("@/lib/premium"), import("@/lib/plan"), import("@/lib/supabase/admin"), import("@/lib/viewLocale.server")]);
  const plan = await getPlan();
  if (plan === "free") return { status: "blocked", reason: "free" };
  const premium = isPremiumPlan(plan);
  const admin = createAdminClient();
  const server = await import("@/lib/googleAnswers.server");

  let listing: AnswersListing | null = null;
  let canEdit = false;
  let practice = false;
  if (premium) {
    const { googleWriteContext } = await import("@/lib/gbpWriteContext.server");
    const c = await googleWriteContext(businessId);
    if (!c.ok) return c.result;
    canEdit = c.canEdit;
    practice = c.practice;
    listing = await server.readAnswersWith(c);
  } else listing = await server.readAnswersReal(admin, businessId);
  if (!listing) return { status: "error", error: "failed" };

  const { answersPlan, DETAIL_PARTS } = await import("@/lib/googleAnswers");
  const has = (p: string) => listing!.details.some((d) => d.part === p && d.current !== null);
  const plan23e = answersPlan({
    description: listing.description,
    services: listing.services.map((s) => s.name),
    pricedServices: listing.services.filter((s) => s.googlePrice !== null).length,
    details: listing.details.length ? (Object.fromEntries(DETAIL_PARTS.map((p) => [p, has(p)])) as { payment: boolean; parking: boolean; accessibility: boolean }) : null,
  });

  let descriptionDraft: string | null = null;
  if (plan23e?.missing.includes("description")) {
    descriptionDraft = await answersDescription(db, admin, businessId).catch(() => null);
  }

  const { data: prices } = await db.from("prices").select("service, price").eq("business_id", businessId).limit(50);
  const { withLiveListingFor } = await import("@/lib/ownerListing.server");
  const { withOwnerDetailsFor } = await import("@/lib/ownerDetails.server");
  const live = (await withLiveListingFor(admin, businessId, row).catch(() => row)) as typeof row & { name?: string | null; address?: string | null; opening_hours?: string[] | null };
  const shown = (await withOwnerDetailsFor(admin, businessId, live).catch(() => live)) as typeof live;
  const { extractCityFromAddress } = await import("@/lib/websiteTrust");
  const { readRealListingCached } = await import("@/lib/gbpRealListing.server");
  const real = await readRealListingCached(admin, businessId).catch(() => null);
  const booking = real?.ok ? (await import("@/lib/bookingPartners")).bookingLink(real.listing.placeActionLinks) : null;

  return {
    status: "ok",
    premium,
    canEdit,
    practice,
    plan: plan23e,
    listing,
    descriptionDraft,
    ownerPrices: ((prices ?? []) as Array<{ service: string; price: number }>).filter((p) => p.service && Number(p.price) > 0).map((p) => ({ service: p.service, price: Number(p.price) })),
    facts: {
      name: shown.name ?? "",
      city: shown.address ? (extractCityFromAddress(shown.address) ?? null) : null,
      hours: await (async () => {
        // From Google's own periods, in the business's language ("Lunes: cerrado"); Google's English text only for an English business.
        const { weekFromGoogle } = await import("@/lib/gbpProfileEdits");
        const { hoursLines } = await import("@/lib/googleAnswers");
        const week = real?.ok ? weekFromGoogle((real.listing.location.regularHours?.periods ?? []) as never) : null;
        if (week) return hoursLines(week, viewLocale(row.language));
        return viewLocale(row.language) === "en" && Array.isArray(shown.opening_hours) && shown.opening_hours.length ? shown.opening_hours : null;
      })(),
      bookingUrl: booking && booking.kind !== "none" ? booking.uri : null,
    },
    locale: viewLocale(row.language),
    topic: await import("@/lib/gbpPostsContext.server")
      .then(({ loadDraftInputs }) => loadDraftInputs(db, admin, businessId))
      .then((i) => i?.topic ?? null)
      .catch(() => null),
  };
}

export type ApplyAnswersResult = { status: "ok"; results: AnswersResult } | { status: "editing_off" } | { status: "wait"; error: "wait_minute" | "daily_cap" } | Blocked;

/** "Apply to Google": the parts the owner approved, one sitting. */
export async function applyAnswersAction(businessId: string, payload: AnswersPayload, practiceOutcome: unknown = null): Promise<ApplyAnswersResult> {
  const { googleWriteContext } = await import("@/lib/gbpWriteContext.server");
  const c = await googleWriteContext(businessId);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  if (c.practice) {
    const practice = await import("@/lib/gbpProfilePractice.server");
    practice.setPracticeOutcome(businessId, practice.isPracticeOutcome(practiceOutcome) ? practiceOutcome : "accept");
  }
  const { startSitting } = await import("@/lib/approveAll.server");
  const start = await startSitting(c.admin, businessId);
  if (start.status !== "ok") return start.status === "wait" ? start : { status: "error", error: "not_enabled" };
  const { applyAnswersWith } = await import("@/lib/googleAnswers.server");
  const results = await applyAnswersWith(c, payload ?? {}, start.at, "answers");
  if (!c.practice) revalidatePath(`/business/${businessId}`, "layout");
  return { status: "ok", results };
}
