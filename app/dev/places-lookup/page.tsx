import { DashboardShell } from "@/components/layout/DashboardShell";
import { createClient } from "@/lib/supabase/server";
import { PlacesLookupClient } from "./PlacesLookupClient";

export default async function PlacesLookupPage() {
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
