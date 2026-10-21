// The starter website's download (Website page → "Download site"): the
// browser sends the page it built; this checks the owner and the plan and
// returns it as a file. Free is refused here (403) — Free customizes and
// previews the site freely, but downloading it is Grow. No outside calls.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/premium";
import { starterSiteDownload } from "@/lib/starterSiteDownload";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  // RLS: only the owner can read their business row.
  const { data: business } = await supabase.from("businesses").select("id").eq("id", params.id).maybeSingle();
  if (!business) return NextResponse.json({ error: "not_found" }, { status: 404 });
  let html: unknown = null;
  try {
    html = ((await request.json()) as { html?: unknown }).html;
  } catch {
    // Bad body → 400 below.
  }
  const result = starterSiteDownload(await getPlan(), html);
  if (result.status !== "ok") return NextResponse.json({ error: result.status }, { status: result.status === "plan_required" ? 403 : 400 });
  return new NextResponse(result.html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "content-disposition": "attachment" } });
}
