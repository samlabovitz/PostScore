import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { createClient } from "@/lib/supabase/server";
import { AddBusinessSearch } from "./AddBusinessSearch";

export default async function AddBusinessPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6 nav:gap-8">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">Add a business</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Search for your real Google Business Profile listing to start scoring it.
          </p>
        </div>
        <AddBusinessSearch />
      </div>
    </DashboardShell>
  );
}
