import Link from "next/link";
import { IconArrowLeft, type Icon } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";

/**
 * Honest placeholder for a nav section that doesn't have real data or
 * logic behind it yet. Says plainly that it's not built, rather than
 * showing an empty table or fabricated numbers.
 */
export function ComingTogether({
  section,
  businessId,
  businessName,
  icon: Icon,
}: {
  section: string;
  businessId: string;
  businessName: string | null;
  icon: Icon;
}) {
  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div>
        <Link
          href={`/business/${businessId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={15} />
          Back to {businessName ?? "business"}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
          {section}
        </h1>
      </div>

      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brass/10 text-brass">
          <Icon size={22} stroke={1.75} />
        </span>
        <h2 className="font-serif text-lg font-semibold text-ink">
          {section} is coming together
        </h2>
        <p className="max-w-sm text-sm text-ink-soft">
          We&apos;re still building this section out — nothing fake to show you in the
          meantime. Check back soon.
        </p>
      </Card>
    </div>
  );
}
