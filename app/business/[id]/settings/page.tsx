import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconLogout } from "@tabler/icons-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { getBusinessSummary, listMyBusinesses } from "@/app/actions/businesses";
import { getReportsData } from "@/app/actions/reports";
import { logout } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { bizProfile, resolveBizProfile } from "@/config/bizProfiles";
import { tradeLabel } from "@/lib/tradeSearch";
import { BusinessLanguageToggle } from "@/components/layout/BusinessLanguageToggle";
import { MonthlyEmailReportCard } from "@/components/reports/MonthlyEmailReportCard";
import { BusinessTypeSetting } from "./BusinessTypeSetting";
import { CancelPlanButton, PlanCard, SavedToast, SettingsNav, SettingsSection, UnsubscribeAllButton } from "@/components/settings/SettingsParts";
import { LegalLinks } from "@/components/legal/LegalPage";
import { cancelAtPeriodEndAction } from "@/app/actions/subscription";
import { hasActiveSubscription } from "@/lib/subscription";
import { getPlan } from "@/lib/premium";
import { REFUND_POLICY_SHORT, legalHref } from "@/lib/legal/policies";
import { normalizeLocale, t, type MessageKey } from "@/lib/i18n";

/**
 * Settings — owner-only (getBusinessSummary, RLS-scoped). Every control
 * reuses existing, working code: the language toggle, the monthly report
 * toggle, the business-type override, sign out. Nothing here pretends:
 * there's no profile name to edit and no account deletion yet, so neither
 * is shown; "Cancel subscription" appears only for a real paid
 * subscription (none exist until checkout ships — see the TODO below).
 */
export default async function SettingsPage({ params }: { params: { id: string } }) {
  const [summary, reportsResult, hasSubscription, businessesResult] = await Promise.all([
    getBusinessSummary(params.id),
    getReportsData(params.id),
    hasActiveSubscription(params.id),
    listMyBusinesses(),
  ]);
  if (summary.status === "unauthenticated") redirect("/login");
  if (summary.status === "not_found") notFound();

  const { business } = summary;
  const locale = normalizeLocale(business.language);
  const lang = locale === "es" ? "es" : "en";
  const plan = getPlan();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const autoDetectedProfile = bizProfile(business.category, business.primary_type, locale, business.categories, null);
  const businessTypeOverride = business.business_type_override ?? null;
  const profile = resolveBizProfile(business.category, business.primary_type, businessTypeOverride, locale, business.categories, business.name);
  const tradeName = business.trade_id ? tradeLabel(business.trade_id, locale) : null;
  const businesses = businessesResult.status === "ok" ? businessesResult.businesses : [];
  const k = (key: string) => t(locale, `dashboard.settings.${key}` as MessageKey);

  const sections = [
    { id: "profile", label: k("nav.profile"), icon: "user" as const },
    { id: "businesses", label: k("nav.businesses"), icon: "store" as const },
    { id: "plan", label: k("nav.plan"), icon: "card" as const },
    { id: "email", label: k("nav.email"), icon: "bell" as const },
    { id: "business-type", label: k("nav.businessType"), icon: "tag" as const },
    { id: "account", label: k("nav.account"), icon: "account" as const },
  ];

  return (
    <DashboardShell business={business}>
      <div className="flex flex-col gap-6">
        <div>
          <Link href={`/business/${params.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink">
            <IconArrowLeft size={15} />
            {t(locale, "dashboard.settings.backTo", { name: business.name ?? t(locale, "dashboard.settings.businessFallback") })}
          </Link>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">{t(locale, "dashboard.nav.settings")}</h1>
        </div>

        <div className="grid grid-cols-1 gap-5 nav:grid-cols-[200px_minmax(0,1fr)]">
          <SettingsNav sections={sections} />
          <div className="flex min-w-0 flex-col gap-5">
            <SettingsSection id="profile" icon="user" title={k("nav.profile")} helper={k("profile.helper")}>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-mute">{k("accountEmailLabel")}</p>
                <p className="mt-1 text-sm text-ink">{user?.email ?? t(locale, "dashboard.common.notAvailable")}</p>
                <p className="mt-0.5 text-[12px] text-ink-mute">{k("profile.emailHelp")}</p>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.05em] text-ink-mute">{k("languageHeading")}</p>
                <BusinessLanguageToggle businessId={params.id} language={business.language} />
              </div>
            </SettingsSection>

            <SettingsSection id="businesses" icon="store" title={k("nav.businesses")} helper={k("businesses.helper")}>
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {businesses.map((b) => (
                  <li key={b.id} className="flex flex-col gap-2 rounded-xl border border-paper-deep p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-ink">{b.name ?? k("businessFallback")}</p>
                        {b.address && <p className="truncate text-[12px] text-ink-mute">{b.address}</p>}
                      </div>
                      <span className="shrink-0 rounded-full border border-paper-deep bg-paper px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{k(`plan.name.${plan}`)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] font-medium">
                      <Link href={`/business/${b.id}`} className="text-ink underline decoration-brass underline-offset-2">
                        {k("businesses.overview")}
                      </Link>
                      {!b.websiteOnly && (
                        <Link href={`/business/${b.id}/growth`} className="text-ink-soft hover:text-ink">
                          {k("businesses.growth")}
                        </Link>
                      )}
                      <Link href={`/business/${b.id}/settings`} className="text-ink-soft hover:text-ink">
                        {k("businesses.settings")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </SettingsSection>

            <SettingsSection id="plan" icon="card" title={k("nav.plan")} helper={k("plan.helper")}>
              <PlanCard plan={plan} />
              {plan === "free" ? (
                <p data-testid="nothing-to-cancel" className="text-[13px] text-ink-soft">
                  {k("plan.freeNothingToCancel")}
                </p>
              ) : hasSubscription ? (
                // TODO(checkout): hasActiveSubscription() is always false until
                // checkout ships; then this cancels at period end for real (see
                // lib/billing/compliance.ts — no more than 2 clicks).
                <CancelPlanButton onConfirm={cancelAtPeriodEndAction} />
              ) : (
                <p className="text-[13px] text-ink-soft">{k("plan.noSubscription")}</p>
              )}
              <div className="rounded-xl bg-paper p-3.5">
                <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{k("plan.refundTitle")}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink">{REFUND_POLICY_SHORT[lang]}</p>
                <Link href={legalHref("refund", lang)} className="mt-1.5 inline-block text-[13px] font-medium text-ink underline decoration-brass underline-offset-2">
                  {k("plan.refundLink")}
                </Link>
              </div>
            </SettingsSection>

            <SettingsSection id="email" icon="bell" title={k("nav.email")} helper={k("email.helper")}>
              {reportsResult.status === "ok" ? (
                <MonthlyEmailReportCard businessId={params.id} status={reportsResult.monthlyEmailReport} />
              ) : (
                <Card className="p-5 text-sm text-ink-soft">{k("monthlyEmailUnavailable")}</Card>
              )}
              <UnsubscribeAllButton />
            </SettingsSection>

            <SettingsSection id="business-type" icon="tag" title={k("nav.businessType")} helper={k("businessType.helper")}>
              <BusinessTypeSetting
                businessId={params.id}
                initialBusinessTypeId={profile.id}
                autoDetectedBusinessTypeId={autoDetectedProfile.id}
                autoDetectedBusinessType={autoDetectedProfile.label}
                initialOverridden={businessTypeOverride !== null}
                initialTradeName={tradeName}
              />
            </SettingsSection>

            <SettingsSection id="account" icon="account" title={k("nav.account")} helper={k("account.helper")}>
              <form action={logout}>
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-paper-deep bg-white px-3.5 py-2 text-[13.5px] font-medium text-ink hover:border-ink-soft">
                  <IconLogout size={15} aria-hidden />
                  {k("account.signOut")}
                </button>
              </form>
              <LegalLinks locale={lang} />
            </SettingsSection>
          </div>
        </div>
      </div>
      <SavedToast />
    </DashboardShell>
  );
}
