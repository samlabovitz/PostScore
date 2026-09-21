import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { AddBusinessSearch } from "./AddBusinessSearch";

export default async function AddBusinessPage() {
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

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6 nav:gap-8">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">
            {t(locale, "dashboard.intake.pageTitle")}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{t(locale, "dashboard.intake.pageSubtitle")}</p>
        </div>
        <AddBusinessSearch />
      </div>
    </DashboardShell>
  );
}
