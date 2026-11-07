import { NextRequest, NextResponse } from "next/server";
import { lookupBusinessByPlaceId } from "@/lib/google/places";
import { findBusiness } from "@/lib/google/businessSearch";
import { createClient } from "@/lib/supabase/server";
import {
  onboardingDecision,
  placesOnboardingMonthlyCap,
  WORST_CASE_PICK_CALLS,
  WORST_CASE_SEARCH_CALLS,
  type OnboardingDecision,
} from "@/lib/onboardingLookupBudget";
import { logOnboardingCalls, onboardingCallsThisMonth, onboardingLookupsToday, recordOnboardingLookup } from "@/lib/onboardingLookupBudget.server";

// Onboarding has its own Google ceiling (PLACES_ONBOARDING_MONTHLY_CAP) and
// a per-user daily limit — lib/onboardingLookupBudget.ts. The client shows
// these by `code`, in the owner's language.
const BLOCKED: Record<Exclude<OnboardingDecision, "ok">, { status: number; message: string }> = {
  busy: { status: 503, message: "Search is busy right now — please try again later." },
  rate_limited: { status: 429, message: "You've reached today's search limit — please try again tomorrow." },
};

/** Checks the ceiling and this user's limit, then marks the lookup (before Google is called). */
async function gate(userId: string, worstCase: number): Promise<NextResponse | null> {
  const [usedThisMonth, today] = await Promise.all([onboardingCallsThisMonth(), onboardingLookupsToday(userId)]);
  const decision = today === "error" ? "busy" : onboardingDecision({ usedThisMonth, cap: placesOnboardingMonthlyCap(), worstCase, lookupsToday: today });
  if (decision !== "ok") {
    const { status, message } = BLOCKED[decision];
    return NextResponse.json({ status: "error", code: decision, message }, { status });
  }
  await recordOnboardingLookup(userId);
  return null;
}

export async function POST(req: NextRequest) {
  // Every lookup is a paid Google call — signed-in owners only (the add
  // page itself already requires sign-in).
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) {
    return NextResponse.json({ status: "error", message: "Please sign in again." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { status: "error", message: "Invalid request body." },
      { status: 400 }
    );
  }

  const { name, location, placeId, ownerName, websiteUrl } = body as {
    name?: string;
    location?: string;
    placeId?: string;
    ownerName?: string;
    websiteUrl?: string;
  };

  // A specific place was picked from a disambiguation list — fetch its full details.
  if (typeof placeId === "string" && placeId.trim().length > 0) {
    const blocked = await gate(user.id, WORST_CASE_PICK_CALLS);
    if (blocked) return blocked;
    try {
      return NextResponse.json(await lookupBusinessByPlaceId(placeId.trim()));
    } finally {
      // One Place Details call, counted even when it failed (it may be billed).
      await logOnboardingCalls({ textSearch: 0, details: 1, geocode: 0 });
    }
  }

  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    typeof location !== "string" ||
    location.trim().length === 0
  ) {
    return NextResponse.json(
      {
        status: "error",
        message: "Both a business name and a location are required.",
      },
      { status: 400 }
    );
  }

  const blocked = await gate(user.id, WORST_CASE_SEARCH_CALLS);
  if (blocked) return blocked;

  // Day 2b: the owner's name and website are optional extra ways to find
  // a listing the plain name + town search misses (see findBusiness).
  const result = await findBusiness({
    name: name.trim().slice(0, 200),
    location: location.trim().slice(0, 200),
    ownerName: typeof ownerName === "string" ? ownerName.slice(0, 120) : null,
    websiteUrl: typeof websiteUrl === "string" ? websiteUrl.slice(0, 2048) : null,
  });
  // Every Text Search, Geocode and Details call it made (findBusiness never throws).
  await logOnboardingCalls(result.paidCalls ?? { textSearch: 0, details: 0, geocode: 0 });
  return NextResponse.json(result);
}
