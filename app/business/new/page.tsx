import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { AddBusinessSearch, type AttachTarget } from "./AddBusinessSearch";
import { getListingMode } from "@/lib/listingMode";

export default async function AddBusinessPage({ searchParams }: { searchParams?: { attach?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // No business exists yet at this stage, so there's no business.language
  // to key a locale off of — DEFAULT_LOCALE is the correct, explicit
  // choice here (not a workaround), matching every other unauthenticated
  // or pre-business page.
  const locale = DEFAULT_LOCALE;

  // Day 2b: "Already have a listing? Link it" from a website-only
  // business — only that owner's own website-only business qualifies
  // (RLS limits the read to the owner's rows).
  let attachTo: AttachTarget | null = null;
  if (searchParams?.attach && (await getListingMode(supabase, searchParams.attach)) === "website_only") {
    const { data } = await supabase.from("businesses").select("id, name").eq("id", searchParams.attach).maybeSingle();
    if (data) attachTo = { businessId: data.id, name: data.name };
  }

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6 nav:gap-8">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">
            {t(locale, "dashboard.intake.pageTitle")}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{t(locale, "dashboard.intake.pageSubtitle")}</p>
        </div>
        <AddBusinessSearch attachTo={attachTo} />
      </div>
    </DashboardShell>
  );
}
