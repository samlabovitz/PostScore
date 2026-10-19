import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { REFUND_POLICY, policyLocale } from "@/lib/legal/policies";

export const metadata: Metadata = { title: "Refund & cancellation policy — PostScore" };

export default function RefundPolicyPage({ searchParams }: { searchParams: { lang?: string } }) {
  const locale = policyLocale(searchParams.lang);
  const policy = REFUND_POLICY[locale];
  return <LegalPage locale={locale} title={policy.title} updated={policy.updated} intro={policy.summary} sections={policy.sections} />;
}
