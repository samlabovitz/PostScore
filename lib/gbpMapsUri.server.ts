// Server-only: the link Google's API gives for the owner's own location
// (locations.get readMask=metadata → metadata.mapsUri) — for "View on
// Google" after a change. One read through gbpFetch; never a write.
// null when Google can't be read or the link isn't a Google Maps link.
import "server-only";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { safeMapsUri } from "@/lib/gbpMapsUri";

const BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";

export async function readGbpMapsUri(target: { locationName: string; accessToken: string }, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const counter = { calls: 0 };
  try {
    const url = new URL(`${BASE}/${target.locationName}`);
    url.searchParams.set("readMask", "metadata");
    const res = await gbpFetch(counter, fetchImpl)(url.toString(), { headers: { Authorization: `Bearer ${target.accessToken}` } });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { metadata?: { mapsUri?: unknown } } | null;
    return safeMapsUri(body?.metadata?.mapsUri);
  } catch {
    return null;
  } finally {
    logGbpCalls("maps-uri", counter);
  }
}
