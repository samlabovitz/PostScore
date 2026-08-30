"use client";

import { useState } from "react";
import { IconGift, IconPlayerStop, IconShare2 } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { buildReferralShareCaption, type ReferralRow } from "@/lib/referrals";
import { redemptionLabel } from "@/lib/promos";
import { ShareModal } from "./ShareModal";
import type { EndReferralResult, IncrementReferralRedemptionResult } from "@/app/actions/referrals";

type RedeemState = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string };
type EndState = { kind: "idle" } | { kind: "confirming" } | { kind: "saving" } | { kind: "error"; message: string };

export function ActiveReferral({
  referral,
  businessName,
  businessPhone,
  maxActive,
  onRedeem,
  onEnd,
}: {
  referral: ReferralRow | null;
  businessName: string;
  businessPhone: string | null;
  maxActive: number;
  onRedeem: (id: string) => Promise<IncrementReferralRedemptionResult>;
  onEnd: (id: string) => Promise<EndReferralResult>;
}) {
  const [redeemState, setRedeemState] = useState<RedeemState>({ kind: "idle" });
  const [endState, setEndState] = useState<EndState>({ kind: "idle" });
  const [shareOpen, setShareOpen] = useState(false);

  async function handleRedeem() {
    if (!referral) return;
    setRedeemState({ kind: "saving" });
    const result = await onRedeem(referral.id);
    setRedeemState(
      result.status === "ok"
        ? { kind: "idle" }
        : { kind: "error", message: result.status === "error" ? result.message : "Couldn't log that — try again." }
    );
  }

  async function handleEnd() {
    if (!referral) return;
    setEndState({ kind: "saving" });
    const result = await onEnd(referral.id);
    if (result.status !== "ok") {
      setEndState({
        kind: "error",
        message: result.status === "error" ? result.message : "Couldn't end this — try again.",
      });
    }
    // On success the parent clears the referral entirely, so there's
    // no "idle" state to return to here.
  }

  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        Active referral ({referral ? 1 : 0}/{maxActive})
      </div>
      {!referral ? (
        <Card className="p-5 text-sm text-ink-soft">
          Nothing running yet. Build a referral offer above and hit &quot;Start &amp; track this
          referral&quot; to see it here.
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-sm">
                  <span className="font-semibold text-ink">You get: </span>
                  <span className="text-ink-soft">{referral.referrer_reward}</span>
                </div>
                <div className="text-sm">
                  <span className="font-semibold text-ink">Friend gets: </span>
                  <span className="text-ink-soft">{referral.friend_reward}</span>
                </div>
                <span className="mt-1 font-mono text-[12.5px] text-ink">{referral.code}</span>
              </div>
              <Pill variant="brass" className="shrink-0">
                {redemptionLabel(referral.redemptions)}
              </Pill>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="brass" size="sm" onClick={handleRedeem} disabled={redeemState.kind === "saving"}>
                <IconGift size={14} />
                {redeemState.kind === "saving" ? "Logging…" : "+1 Referral"}
              </Button>
              <Button variant="default" size="sm" onClick={() => setShareOpen(true)}>
                <IconShare2 size={14} />
                Share
              </Button>
              {endState.kind === "confirming" || endState.kind === "saving" ? (
                <>
                  <span className="text-[12.5px] text-ink-mute">End this referral program?</span>
                  <Button variant="default" size="sm" onClick={handleEnd} disabled={endState.kind === "saving"}>
                    {endState.kind === "saving" ? "Ending…" : "Yes, end it"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setEndState({ kind: "idle" })}
                    disabled={endState.kind === "saving"}
                    className="text-[12.5px] font-medium text-ink-mute hover:text-ink disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <Button variant="default" size="sm" onClick={() => setEndState({ kind: "confirming" })}>
                  <IconPlayerStop size={14} />
                  End
                </Button>
              )}
            </div>

            {redeemState.kind === "error" && <p className="text-[12px] text-red">{redeemState.message}</p>}
            {endState.kind === "error" && <p className="text-[12px] text-red">{endState.message}</p>}
          </div>

          <ShareModal
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            title="How to share your referral offer"
            caption={buildReferralShareCaption({
              businessName,
              referrerReward: referral.referrer_reward,
              friendReward: referral.friend_reward,
              code: referral.code,
              phone: businessPhone,
            })}
          />
        </Card>
      )}
    </div>
  );
}
