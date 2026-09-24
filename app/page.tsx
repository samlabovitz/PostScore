import Link from "next/link";
import { redirect } from "next/navigation";
import { IconBuildingStore, IconPlus } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { createClient } from "@/lib/supabase/server";
import { listMyBusinesses, type MyBusinessRow } from "@/app/actions/businesses";
import { DEFAULT_LOCALE, normalizeLocale, t, tPlural, type Locale } from "@/lib/i18n";

/**
 * This page has no single business in context — it lists every business
 * this owner has saved, each with its own real language. It's only
 * honest to show the list itself in one of those languages when they
 * all genuinely agree; a mixed-language list stays in the honest
 * default (English) rather than picking one business's language to
 * impose on everyone else's row.
 */
function pageLocale(businesses: MyBusinessRow[]): Locale {
  if (businesses.length === 0) return DEFAULT_LOCALE;
  const locales = new Set(businesses.map((b) => normalizeLocale(b.language)));
  return locales.size === 1 ? (locales.values().next().value as Locale) : DEFAULT_LOCALE;
}

function BusinessCard({ business, locale }: { business: MyBusinessRow; locale: Locale }) {
  return (
    <Link href={`/business/${business.id}`}>
      <Card className="flex items-center gap-4 p-5 transition-colors hover:border-ink-soft">
        <GradeBadge grade={business.score?.grade ?? null} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-base font-semibold text-ink">
            {business.name ?? t(locale, "dashboard.home.untitledBusiness")}
          </div>
          <div className="truncate text-sm text-ink-soft">
            {business.address ?? t(locale, "dashboard.home.noAddressOnFile")}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-serif text-xl font-semibold text-ink">
            {business.score ? business.score.total : "—"}
          </div>
          <div className="text-[11px] text-ink-mute">/ 100</div>
        </div>
      </Card>
    </Link>
  );
}

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const result = await listMyBusinesses();
  const businesses = result.status === "ok" ? result.businesses : [];
  const locale = pageLocale(businesses);

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6 nav:gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">
              {t(locale, "dashboard.home.pageTitle")}
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              {businesses.length === 0
                ? t(locale, "dashboard.home.nothingAddedYet")
                : tPlural(locale, "dashboard.home.savedBusinessCount", businesses.length)}
            </p>
          </div>
          {businesses.length > 0 && (
            <Link href="/business/new">
              <Button variant="brass" size="sm">
                <IconPlus size={15} />
                {t(locale, "dashboard.home.addBusinessButton")}
              </Button>
            </Link>
          )}
        </div>

        {businesses.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brass/10 text-brass">
              <IconBuildingStore size={22} stroke={1.75} />
            </span>
            <h2 className="font-serif text-lg font-semibold text-ink">
              {t(locale, "dashboard.home.emptyStateHeading")}
            </h2>
            <p className="max-w-sm text-sm text-ink-soft">{t(locale, "dashboard.home.emptyStateBody")}</p>
            <Link href="/business/new" className="mt-2">
              <Button variant="brass">
                <IconPlus size={15} />
                {t(locale, "dashboard.home.addFirstBusinessButton")}
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {businesses.map((business) => (
              <BusinessCard key={business.id} business={business} locale={locale} />
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
