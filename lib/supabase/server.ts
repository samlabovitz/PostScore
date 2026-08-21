// Server-only Supabase client for Server Components, Server Actions, and
// Route Handlers. Reads the current user's session from cookies, so calls
// made through this client are scoped to whoever is actually logged in —
// Row-Level Security in the database does the rest. This never uses the
// service_role key, so it can never bypass RLS.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Writing cookies from a Server Component (not a Server Action
            // or Route Handler) throws — safe to ignore because the
            // middleware below refreshes the session on every request.
          }
        },
      },
    }
  );
}
