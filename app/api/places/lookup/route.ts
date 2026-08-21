import { NextRequest, NextResponse } from "next/server";
import { lookupBusiness, lookupBusinessByPlaceId } from "@/lib/google/places";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { status: "error", message: "Invalid request body." },
      { status: 400 }
    );
  }

  const { name, location, placeId } = body as {
    name?: string;
    location?: string;
    placeId?: string;
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

  const result = await lookupBusiness(name.trim(), location.trim());
  return NextResponse.json(result);
}
