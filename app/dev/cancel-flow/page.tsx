import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { createClient } from "@/lib/supabase/server";
import { CancelFlowPreviewClient } from "./CancelFlowPreviewClient";

// Same protection as app/dev/places-lookup: local development only (a 404
// everywhere else, production included), then a real login.
export default async function CancelFlowPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
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
