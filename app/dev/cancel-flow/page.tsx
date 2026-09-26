import { DashboardShell } from "@/components/layout/DashboardShell";
import { createClient } from "@/lib/supabase/server";
import { CancelFlowPreviewClient } from "./CancelFlowPreviewClient";

// Same protection as app/dev/places-lookup: requires a real login,
// nothing more elaborate (no separate admin role, no NODE_ENV gate) —
// matches this app's existing dev-tooling convention.
export default async function CancelFlowPreviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <DashboardShell>
      <CancelFlowPreviewClient isLoggedIn={!!user} />
    </DashboardShell>
  );
}
