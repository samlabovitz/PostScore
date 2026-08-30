"use client";

import { IconBrandGoogle, IconBrandInstagram, IconMessage, IconPrinter } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { CopyBlock } from "@/components/ui/CopyBlock";

interface ShareOption {
  icon: typeof IconBrandGoogle;
  title: string;
  howTo: string;
}

const OPTIONS: ShareOption[] = [
  {
    icon: IconBrandGoogle,
    title: "Post to your Google Business Profile",
    howTo: "Open your Business Profile, go to Posts → Add update, paste the caption below, and attach the image you downloaded.",
  },
  {
    icon: IconBrandInstagram,
    title: "Post to Instagram or Facebook",
    howTo: "Start a new post or story, attach the image, and paste the caption below.",
  },
  {
    icon: IconMessage,
    title: "Text it to regulars",
    howTo: "Text the caption below (and attach the image, if your phone supports it) to customers you've had before.",
  },
  {
    icon: IconPrinter,
    title: "Print it for the counter",
    howTo: "Print the image and set it by the register, window, or waiting area.",
  },
];

/** Honest hand-off sharing instructions, shared by the coupon and
 * referral features: the caller builds the pre-written caption
 * (buildShareCaption / buildReferralShareCaption in lib/promos.ts and
 * lib/referrals.ts) and this modal just explains where to post it —
 * PostScore never posts or sends anything itself. */
export function ShareModal({
  open,
  onClose,
  title,
  caption,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  caption: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] text-ink-mute">
          PostScore doesn&apos;t post to Google, Instagram, or text anyone automatically — download
          the image, then use any of these to post or send it yourself.
        </p>

        <div className="flex flex-col divide-y divide-paper-line">
          {OPTIONS.map((opt) => (
            <div key={opt.title} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brass/10 text-brass">
                <opt.icon size={16} />
              </span>
              <div>
                <div className="text-[13px] font-semibold text-ink">{opt.title}</div>
                <p className="mt-0.5 text-[12.5px] text-ink-soft">{opt.howTo}</p>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-1.5 text-[13px] font-medium text-ink-soft">Pre-written caption</div>
          <CopyBlock text={caption} rows={3} />
        </div>
      </div>
    </Modal>
  );
}
