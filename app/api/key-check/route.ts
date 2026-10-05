// TEMPORARY — delete after diagnosing.
//
// Diagnostic for a 401 "invalid x-api-key" on Netlify when the same
// ANTHROPIC_API_KEY works locally. Reports only metadata about the raw
// env var (presence, length before/after trimming, a short hash
// fingerprint) plus the deployed commit/context — never the key value
// itself, in any form.

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { sanitizeApiKey } from "@/lib/anthropicClient";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "error", message: "Unauthorized." }, { status: 401 });
  }

  const raw = process.env.ANTHROPIC_API_KEY ?? "";
  const trimmed = raw ? sanitizeApiKey(raw) : "";

  return NextResponse.json({
    present: !!process.env.ANTHROPIC_API_KEY,
    rawLength: raw.length,
    trimmedLength: trimmed.length,
    sha256_8: trimmed ? createHash("sha256").update(trimmed).digest("hex").slice(0, 8) : null,
    commit: process.env.COMMIT_REF ?? null,
    context: process.env.CONTEXT ?? null,
  });
}
