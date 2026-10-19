import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { TERMS, policyLocale } from "@/lib/legal/policies";

export const metadata: Metadata = { title: "Terms of service — PostScore" };

export default function TermsPage({ searchParams }: { searchParams: { lang?: string } }) {
  const locale = policyLocale(searchParams.lang);
  const terms = TERMS[locale];
  return <LegalPage locale={locale} title={terms.title} updated={terms.updated} sections={terms.sections} />;
}
