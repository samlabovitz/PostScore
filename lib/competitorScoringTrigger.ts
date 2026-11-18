// Starts a saved scan's full competitor scoring in the background — never
// on page view. On Netlify it hands off to the competitor-scoring
// Background Function (netlify/functions/competitor-scoring-batch.mts,
// up to 15 minutes), which works through the scan one site per call to
// app/api/cron/competitor-scoring. Locally (next dev, a long-lived
// server) it simply runs in this process after the response.
//
// Day 23 2d-4b: each competitor's listing from the scan's own search rides
// along in memory — in the request body to the Background Function and on
// to each step — and is never saved or logged.

import { createAdminClient } from "@/lib/supabase/admin";
import { runCompetitorScoringJob, scoreAddedCompetitor, type CompetitorListingInputs } from "@/lib/competitorScoringJob";
import type { CompetitorListingInput } from "@/lib/competitorFullScoring";

export function startCompetitorScoring(scanId: string, inputs: CompetitorListingInputs | null = null): void {
  const siteUrl = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (siteUrl && secret) {
    fetch(`${siteUrl}/.netlify/functions/competitor-scoring-batch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scanId, inputs }),
    }).catch((err) => console.error(`[competitor-scoring] could not start the background run for ${scanId}:`, err));
    return;
  }
  void runCompetitorScoringJob(createAdminClient(), scanId, {
    inputs,
    log: (line) => console.log(`[competitor-scoring ${scanId.slice(0, 8)}]${line}`),
  }).catch((err) => console.error(`[competitor-scoring] ${scanId} failed:`, err));
}

/** An added competitor's full scoring ("Add a competitor"), in the
 * background the same way: one step on Netlify, in this process locally. */
export function startAddedCompetitorScoring(scanId: string, placeId: string, input: CompetitorListingInput): void {
  const siteUrl = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (siteUrl && secret) {
    fetch(`${siteUrl}/.netlify/functions/competitor-scoring-batch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scanId, inputs: { [placeId]: input }, addedPlaceId: placeId }),
    }).catch((err) => console.error(`[competitor-scoring] could not start the added competitor's scoring for ${scanId}:`, err));
    return;
  }
  void scoreAddedCompetitor(createAdminClient(), scanId, placeId, { input })
    .then((out) => console.log(`[competitor-scoring ${scanId.slice(0, 8)}] added ${placeId}: ${out}`))
    .catch((err) => console.error(`[competitor-scoring] added ${placeId} failed:`, err));
}
