"use client";

import { useState } from "react";
import { IconHandClick, IconInfoCircle, IconSend, IconWalk } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";

const STEPS = [
  {
    icon: IconSend,
    title: "1. Share it",
    body: "Download the coupon image and post it, text it, or print it yourself — see \"How to share.\"",
  },
  {
    icon: IconWalk,
    title: "2. Customer brings it",
    body: "They show the image or code — on their phone or printed — at checkout.",
  },
  {
    icon: IconHandClick,
    title: "3. Tap to log it",
    body: "Staff taps \"+1 Redeemed\" in Active promotions. That's the entire tracking system.",
  },
];

export function HowCouponsWork() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
            How it works, in 3 steps
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brass hover:underline"
          >
            <IconInfoCircle size={14} />
            What you need to know
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.title} className="flex flex-col gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brass/10 text-brass">
                <step.icon size={16} />
              </span>
              <div className="text-[13px] font-semibold text-ink">{step.title}</div>
              <p className="text-[12.5px] text-ink-soft">{step.body}</p>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Running a coupon — what you need">
        <div className="flex flex-col gap-3 text-[13px] text-ink-soft">
          <p>
            <span className="font-semibold text-ink">Build.</span> Pick an offer angle or write your
            own, set an expiry, and PostScore generates a real coupon image with a code and QR code.
          </p>
          <p>
            <span className="font-semibold text-ink">Share the image.</span> Download it and post it
            yourself — to your Google Business Profile, Instagram, Facebook, a text to regulars, or
            print it for the counter. PostScore never posts or sends anything on your behalf.
          </p>
          <p>
            <span className="font-semibold text-ink">Customer shows it.</span> They bring the image or
            code in — on their phone or printed — and show it at checkout.
          </p>
          <p>
            <span className="font-semibold text-ink">Staff taps +1.</span> Whoever&apos;s at the
            register taps &quot;+1 Redeemed&quot; on that coupon in Active promotions.
          </p>
          <div className="mt-1 rounded-lg bg-paper p-3 text-[12.5px] text-ink-mute">
            Be honest with yourself about what this is: the redemption count is a simple stored tally
            that a human increments by hand. It is not a POS integration and nothing detects a
            redemption automatically — if staff forgets to tap it, that redemption isn&apos;t counted.
          </div>
        </div>
      </Modal>
    </>
  );
}
