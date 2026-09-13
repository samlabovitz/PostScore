// Service-role Supabase client for the small set of trusted server-side
// writes that don't map to a direct, RLS-checkable user action — e.g.
// uploading a server-fetched website screenshot after ownership has
// already been verified through the normal RLS-scoped client
// (lib/supabase/server.ts). This bypasses Row-Level Security entirely, so
// every caller is responsible for having already proven the current user
// owns whatever it's about to write, before ever reaching this client.
//
// "server-only" makes any accidental import from client code a build
// error rather than a leaked service_role key.
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
