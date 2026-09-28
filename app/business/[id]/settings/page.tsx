import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getReportsData } from "@/app/actions/reports";
import { createClient } from "@/lib/supabase/server";
import { bizProfile, resolveBizProfile } from "@/config/bizProfiles";
import { tradeLabel } from "@/lib/tradeSearch";
import { BusinessLanguageToggle } from "@/components/layout/BusinessLanguageToggle";
import { MonthlyEmailReportCard } from "@/components/reports/MonthlyEmailReportCard";
import { BusinessTypeSetting } from "./BusinessTypeSetting";
import { CancelSubscriptionFlow } from "@/components/settings/CancelSubscriptionFlow";
import { cancelSubscriptionAction } from "@/app/actions/subscription";
import { hasActiveSubscription } from "@/lib/subscription";
import { normalizeLocale, t } from "@/lib/i18n";

/**
 * Per-business settings — owner-only, same access check every other
 * business page uses (getBusinessSummary, RLS-scoped). Every section
 * here reuses an existing, already-working control rather than adding
 * new logic: the same language toggle from the sidebar's account menu,
 * the same monthly-email-report toggle the Reports page shows, and the
 * same business-type override control PostAI's "What I know about your
 * business" panel shows — this page doesn't duplicate any of their save
 * behavior, only presents them together in one place.
 *
 * The Subscription section (lib/subscription.ts's hasActiveSubscription)
 * is real, working UI code — but no paid subscription exists yet, so it
 * renders for no one today. Never shown without a real, currently-active
 * subscription to actually cancel.
 */
export default async function SettingsPage({ params }: { params: { id: string } }) {
  const summary = await getBusinessSummary(params.id);

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }
  if (summary.status === "not_found") {
    notFound();
  }

  const { business } = summary;
  const locale = normalizeLocale(business.language);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const reportsResult = await getReportsData(params.id);
  const hasSubscription = await hasActiveSubscription(params.id);
  // TODO(stripe): once hasActiveSubscription can ever be true, this must
  // read the real period-end date off the actual Stripe subscription —
  // never hardcoded or guessed. Stays null until that exists, which is
  // exactly why hasSubscription itself is always false today too, so
  // this whole section never actually renders yet.
  const subscriptionPeriodEndDate: string | null = null;

  const autoDetectedProfile = bizProfile(business.category, business.primary_type, locale);
  const businessTypeOverride = business.business_type_override ?? null;
  const profile = resolveBizProfile(business.category, business.primary_type, businessTypeOverride, locale);
  const tradeName = business.trade_id ? tradeLabel(business.trade_id, locale) : null;

  return (
    <DashboardShell business={business}>
      <div className="flex flex-col gap-8 nav:gap-10">
        <div>
          <Link
            href={`/business/${params.id}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
          >
            <IconArrowLeft size={15} />
            {t(locale, "dashboard.settings.backTo", {
              name: business.name ?? t(locale, "dashboard.settings.businessFallback"),
            })}
          </Link>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
            {t(locale, "dashboard.nav.settings")}
          </h1>
        </div>

        <div>
          <SectionHeading title={t(locale, "dashboard.settings.languageHeading")} className="mb-3" />
          <Card className="p-5">
            <BusinessLanguageToggle businessId={params.id} language={business.language} />
          </Card>
        </div>

        <div>
          <SectionHeading title={t(locale, "dashboard.settings.monthlyEmailHeading")} className="mb-3" />
          {reportsResult.status === "ok" ? (
            <MonthlyEmailReportCard businessId={params.id} status={reportsResult.monthlyEmailReport} />
          ) : (
            <Card className="p-5 text-sm text-ink-soft">
              {t(locale, "dashboard.settings.monthlyEmailUnavailable")}
            </Card>
          )}
        </div>

        <div>
          <SectionHeading title={t(locale, "dashboard.settings.businessTypeHeading")} className="mb-3" />
          <Card className="p-5">
            <BusinessTypeSetting
              businessId={params.id}
              initialBusinessTypeId={profile.id}
              autoDetectedBusinessTypeId={autoDetectedProfile.id}
              autoDetectedBusinessType={autoDetectedProfile.label}
              initialOverridden={businessTypeOverride !== null}
              initialTradeName={tradeName}
            />
          </Card>
        </div>

        <div>
          <SectionHeading title={t(locale, "dashboard.nav.account")} className="mb-3" />
          <Card className="p-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-mute">
              {t(locale, "dashboard.settings.accountEmailLabel")}
            </p>
            <p className="mt-1 text-sm text-ink">{user?.email ?? t(locale, "dashboard.common.notAvailable")}</p>
          </Card>
        </div>

        {hasSubscription && subscriptionPeriodEndDate && (
          <div>
            <SectionHeading title={t(locale, "dashboard.settings.subscriptionHeading")} className="mb-3" />
            <CancelSubscriptionFlow
              businessId={params.id}
              periodEndDate={subscriptionPeriodEndDate}
              onConfirm={cancelSubscriptionAction}
            />
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
