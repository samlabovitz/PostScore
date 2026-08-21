// Browser-side Supabase client. Safe to import from "use client" components —
// it only ever uses the public URL and the publishable/anon key, both of
// which are meant to be exposed to the browser.

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
