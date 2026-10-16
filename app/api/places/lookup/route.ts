import { NextRequest, NextResponse } from "next/server";
import { lookupBusinessByPlaceId } from "@/lib/google/places";
import { findBusiness } from "@/lib/google/businessSearch";
import { createClient } from "@/lib/supabase/server";

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
    const result = await lookupBusinessByPlaceId(placeId.trim());
    return NextResponse.json(result);
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

  // Day 2b: the owner's name and website are optional extra ways to find
  // a listing the plain name + town search misses (see findBusiness).
  const result = await findBusiness({
    name: name.trim().slice(0, 200),
    location: location.trim().slice(0, 200),
    ownerName: typeof ownerName === "string" ? ownerName.slice(0, 120) : null,
    websiteUrl: typeof websiteUrl === "string" ? websiteUrl.slice(0, 2048) : null,
  });
  return NextResponse.json(result);
}
