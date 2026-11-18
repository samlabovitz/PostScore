import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import { t, type Locale } from "@/lib/i18n";

/** Day 23 2d-3: one line on the Overview until the owner confirms their
 * business details (Settings → "Your business details"). */
export function ConfirmDetailsPrompt({ businessId, locale }: { businessId: string; locale: Locale }) {
  return (
    <Link
      href={`/business/${businessId}/settings#details`}
      data-testid="confirm-details-prompt"
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink underline decoration-brass underline-offset-2 hover:text-ink-soft"
    >
      {t(locale, "dashboard.overview.confirmDetails")}
      <IconArrowRight size={14} aria-hidden />
    </Link>
  );
}
