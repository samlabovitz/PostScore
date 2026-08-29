"use client";

import { useState } from "react";
import { IconBrandGoogle, IconFileText } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CopyBlock } from "@/components/ui/CopyBlock";
import { formatExpiry } from "@/lib/coupons";
import { buildFaqDraft, buildGooglePostDraft, type PromoRow } from "@/lib/promos";

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
        {disabled ? "Start a coupon first" : "Generate draft"}
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
        More ways to bring people in
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DraftCard
          icon={IconBrandGoogle}
          title="Draft a Google Post"
          body="Generates text about your active offer for a Google Business Profile update — you copy it and post it yourself."
          onOpen={() => setOpen("google-post")}
          disabled={!promo}
        />
        <DraftCard
          icon={IconFileText}
          title="Write an FAQ"
          body="Generates a Q&A about your active offer for your Google profile's Q&A section or your website — you post it yourself."
          onOpen={() => setOpen("faq")}
          disabled={!promo}
        />
      </div>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === "google-post" ? "Draft Google post" : "Draft FAQ"}
      >
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-ink-mute">
            This is draft text based on your active &quot;{promo?.offer}&quot; coupon. Copy it and post
            it yourself — PostScore doesn&apos;t post to Google or anywhere else on your behalf.
          </p>
          <CopyBlock text={draft} rows={open === "faq" ? 8 : 5} />
        </div>
      </Modal>
    </div>
  );
}
