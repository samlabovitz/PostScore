// Starts a saved scan's full competitor scoring in the background — never
// on page view. On Netlify it hands off to the competitor-scoring
// Background Function (netlify/functions/competitor-scoring-batch.mts,
// up to 15 minutes), which works through the scan one site per call to
// app/api/cron/competitor-scoring. Locally (next dev, a long-lived
// server) it simply runs in this process after the response.

import { createAdminClient } from "@/lib/supabase/admin";
import { runCompetitorScoringJob } from "@/lib/competitorScoringJob";

export function startCompetitorScoring(scanId: string): void {
  const siteUrl = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (siteUrl && secret) {
    fetch(`${siteUrl}/.netlify/functions/competitor-scoring-batch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scanId }),
    }).catch((err) => console.error(`[competitor-scoring] could not start the background run for ${scanId}:`, err));
    return;
  }
  void runCompetitorScoringJob(createAdminClient(), scanId, {
    log: (line) => console.log(`[competitor-scoring ${scanId.slice(0, 8)}]${line}`),
  }).catch((err) => console.error(`[competitor-scoring] ${scanId} failed:`, err));
}
