"use client";

// Day 23 2d-4: "Changed on Google since your last scan · Re-scan to update
// your score" — in place of a check's words when Google reads differently
// now than the saved result it shows. Links to the Overview's Re-scan button.

import Link from "next/link";
import { useParams } from "next/navigation";
import { t, useLocale } from "@/lib/i18n";

export function ChangedOnGoogleNote({ businessId = null }: { businessId?: string | null }) {
  const locale = useLocale();
  // The business from the page's own address when not passed (the Website page).
  const params = useParams<{ id?: string }>();
  const id = businessId ?? params?.id ?? null;
  return (
    <p data-testid="changed-on-google" className="pl-[25px] text-[12.5px] text-ink-mute">
      {t(locale, "dashboard.breakdown.changedOnGoogle")}
      {" · "}
      <Link href={id ? `/business/${id}#rescan` : "#rescan"} className="font-medium text-ink underline decoration-brass underline-offset-2 hover:text-ink-soft">
        {t(locale, "dashboard.breakdown.rescanToUpdate")}
      </Link>
    </p>
  );
}
