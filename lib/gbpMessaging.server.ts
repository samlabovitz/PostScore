// Server-only: whether the owner's OWN connected location has a texting
// or WhatsApp option (lib/gbpMessaging.ts). One read (locations.
// getAttributes) through gbpFetch; never a write. null = not connected,
// or Google couldn't be read — the step then shows no ✓, never a guess.
import "server-only";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { messagingOnFromAttributes, type GbpUrlAttribute } from "@/lib/gbpMessaging";
import { requestCache } from "@/lib/requestCache";

const BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";

export async function readGbpMessagingWith(locationName: string, accessToken: string, fetchImpl: typeof fetch = fetch): Promise<boolean | null> {
  const counter = { calls: 0 };
  try {
    const res = await gbpFetch(counter, fetchImpl)(`${BASE}/${locationName}/attributes`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { attributes?: GbpUrlAttribute[] } | null;
    return body ? messagingOnFromAttributes(body.attributes ?? []) : null;
  } catch {
    return null;
  } finally {
    logGbpCalls("messaging-status", counter);
  }
}

async function readGbpMessagingUncached(businessId: string): Promise<boolean | null> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { getValidAccessTokenWithClient } = await import("@/lib/gbpTokens.server");
    const admin = createAdminClient();
    const { data: conn } = await admin.from("gbp_connections").select("google_location_id").eq("business_id", businessId).maybeSingle();
    const location = (conn as { google_location_id?: string | null } | null)?.google_location_id;
    if (!location) return null;
    const token = await getValidAccessTokenWithClient(admin, businessId);
    if (token.status !== "ok") return null;
    return await readGbpMessagingWith(location, token.accessToken);
  } catch {
    return null;
  }
}

/** Request-scoped: one Google read per page render. */
export const readGbpMessaging = requestCache(readGbpMessagingUncached);
