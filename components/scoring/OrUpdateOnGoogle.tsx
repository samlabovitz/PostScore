"use client";

// Day 23B: under the Website page's hours-mismatch fix steps — the other
// side of the fix. Premium with Google writes: "PostScore can do this for
// you" (the Hours compare panel). Everyone else: "Or update it on Google
// yourself:" with "Open on Google ↗".

import { useParams } from "next/navigation";
import { FixButton, useFixContext } from "@/components/scoring/FixButton";
import { canDoForYou } from "@/lib/fixDestination";
import { GOOGLE_BUSINESS_URL } from "@/lib/googleProfileTab";
import { t, useLocale } from "@/lib/i18n";

function useBusinessId(): string {
  try {
    const params = useParams<{ id?: string }>();
    return typeof params?.id === "string" ? params.id : "";
  } catch {
    return "";
  }
}

export function OrUpdateOnGoogle() {
  const locale = useLocale();
  const businessId = useBusinessId();
  const ctx = useFixContext(businessId);
  if (!businessId) return null;
  if (canDoForYou(ctx)) {
    return (
      <div data-testid="or-update-on-google" className="mt-2">
        <FixButton businessId={businessId} item={{ checkId: "website.info_consistency", hoursMismatch: true }} />
      </div>
    );
  }
  return (
    <p data-testid="or-update-on-google" className="mt-2 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-soft">
      {t(locale, "dashboard.fix.orOnGoogle")}
      <a href={GOOGLE_BUSINESS_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline decoration-brass underline-offset-2">
        {t(locale, "dashboard.fix.openOnGoogle")} ↗
      </a>
    </p>
  );
}
