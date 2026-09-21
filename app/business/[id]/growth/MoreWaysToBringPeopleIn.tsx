"use client";

import { useState } from "react";
import { IconBrandGoogle, IconFileText } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CopyBlock } from "@/components/ui/CopyBlock";
import { formatExpiry } from "@/lib/coupons";
import { buildFaqDraft, buildGooglePostDraft, type PromoRow } from "@/lib/promos";
import { t, useLocale } from "@/lib/i18n";

type DraftKind = "google-post" | "faq";

function DraftCard({
  icon: Icon,
  title,
  body,
  onOpen,
  disabled,
}: {
  icon: typeof IconBrandGoogle;
  title: string;
  body: string;
  onOpen: () => void;
  disabled: boolean;
}) {
  const locale = useLocale();
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brass/10 text-brass">
          <Icon size={16} />
        </span>
        <div className="text-sm font-semibold text-ink">{title}</div>
      </div>
      <p className="flex-1 text-[13px] text-ink-soft">{body}</p>
      <Button variant="default" size="sm" onClick={onOpen} disabled={disabled} className="w-fit">
        {disabled
          ? t(locale, "dashboard.growth.moreWays.startCouponFirst")
          : t(locale, "dashboard.growth.moreWays.generateDraft")}
      </Button>
    </Card>
  );
}

export function MoreWaysToBringPeopleIn({
  promos,
  businessName,
}: {
  promos: PromoRow[];
  businessName: string;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState<DraftKind | null>(null);
  const promo = promos[0] ?? null;

  const expiryLabel = promo ? formatExpiry(promo.expiry ?? "") : "";
  const draft =
    open === "google-post" && promo
      ? buildGooglePostDraft({ businessName, offer: promo.offer, code: promo.code, expiryLabel })
      : open === "faq" && promo
        ? buildFaqDraft({ businessName, offer: promo.offer, code: promo.code, expiryLabel, terms: promo.terms })
        : "";

  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        {t(locale, "dashboard.growth.moreWays.heading")}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DraftCard
          icon={IconBrandGoogle}
          title={t(locale, "dashboard.growth.moreWays.googlePostTitle")}
          body={t(locale, "dashboard.growth.moreWays.googlePostBody")}
          onOpen={() => setOpen("google-post")}
          disabled={!promo}
        />
        <DraftCard
          icon={IconFileText}
          title={t(locale, "dashboard.growth.moreWays.faqTitle")}
          body={t(locale, "dashboard.growth.moreWays.faqBody")}
          onOpen={() => setOpen("faq")}
          disabled={!promo}
        />
      </div>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={
          open === "google-post"
            ? t(locale, "dashboard.growth.moreWays.modalTitleGooglePost")
            : t(locale, "dashboard.growth.moreWays.modalTitleFaq")
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-ink-mute">
            {t(locale, "dashboard.growth.moreWays.modalIntro", { offer: promo?.offer ?? "" })}
          </p>
          <CopyBlock text={draft} rows={open === "faq" ? 8 : 5} />
        </div>
      </Modal>
    </div>
  );
}
