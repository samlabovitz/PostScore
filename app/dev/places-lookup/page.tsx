import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { createClient } from "@/lib/supabase/server";
import { PlacesLookupClient } from "./PlacesLookupClient";

export default async function PlacesLookupPage() {
  // A developer tool: never served outside local development.
  if (process.env.NODE_ENV !== "development") notFound();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <DashboardShell>
      <PlacesLookupClient isLoggedIn={!!user} />
    </DashboardShell>
  );
}
