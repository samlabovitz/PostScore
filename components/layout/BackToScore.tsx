"use client";

// Day 23B: "← Back to your score" on the page a fix button opened from the
// Overview (its link carries ?from=score — lib/fixDestination.ts withFromScore).

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { t, useLocale } from "@/lib/i18n";

export function BackToScore() {
  const locale = useLocale();
  const params = useParams<{ id?: string }>();
  const search = useSearchParams();
  const id = typeof params?.id === "string" ? params.id : null;
  if (!id || search?.get("from") !== "score") return null;
  return (
    <Link href={`/business/${id}#score-breakdown`} data-testid="back-to-score" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink hover:text-brass">
      <IconArrowLeft size={14} aria-hidden />
      {t(locale, "dashboard.fix.backToScore")}
    </Link>
  );
}
