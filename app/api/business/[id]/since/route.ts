// "Since you did this" (Google results): the 30 days after vs before each action, read live from Google's
// Performance API (app/actions/googleSince.ts loadSinceNumbers — the owner check is RLS; never stored).
// A plain GET, not a server action: server actions on a page run one at a time, so the card's 20-second
// limit used to start while it waited behind slower ones. A fetch is sent at once, and the card's timer
// starts when it is.
import { NextResponse, type NextRequest } from "next/server";
import { loadSinceNumbers } from "@/app/actions/googleSince";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const dates = (request.nextUrl.searchParams.get("dates") ?? "").split(",").filter(Boolean).slice(0, 3);
  const result = await loadSinceNumbers(params.id, dates).catch(() => ({ status: "failed" as const }));
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
