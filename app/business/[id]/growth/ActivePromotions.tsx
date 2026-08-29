"use client";

import { useState } from "react";
import { IconPlayerStop, IconShare2, IconTicket } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { formatExpiry } from "@/lib/coupons";
import { redemptionLabel, type PromoRow } from "@/lib/promos";
import { ShareCouponModal } from "./ShareCouponModal";
import type { EndPromoResult, IncrementRedemptionResult } from "@/app/actions/promos";

type RedeemState = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string };
type EndState = { kind: "idle" } | { kind: "confirming" } | { kind: "saving" } | { kind: "error"; message: string };

function PromoCard({
  promo,
  businessName,
  businessPhone,
  onRedeem,
  onEnd,
}: {
  promo: PromoRow;
  businessName: string;
  businessPhone: string | null;
  onRedeem: (id: string) => Promise<IncrementRedemptionResult>;
  onEnd: (id: string) => Promise<EndPromoResult>;
}) {
  const [redeemState, setRedeemState] = useState<RedeemState>({ kind: "idle" });
  const [endState, setEndState] = useState<EndState>({ kind: "idle" });
  const [shareOpen, setShareOpen] = useState(false);

  async function handleRedeem() {
    setRedeemState({ kind: "saving" });
    const result = await onRedeem(promo.id);
    setRedeemState(
      result.status === "ok"
        ? { kind: "idle" }
        : { kind: "error", message: result.status === "error" ? result.message : "Couldn't log that — try again." }
    );
  }

  async function handleEnd() {
    setEndState({ kind: "saving" });
    const result = await onEnd(promo.id);
    if (result.status !== "ok") {
      setEndState({
        kind: "error",
        message: result.status === "error" ? result.message : "Couldn't end this — try again.",
      });
    }
    // On success the parent removes this card from the list entirely,
    // so there's no "idle" state to return to here.
  }

  const expiryLabel = formatExpiry(promo.expiry ?? "");

  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink">{promo.offer}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-soft">
            <span className="font-mono text-ink">{promo.code}</span>
            <span className="text-red">{expiryLabel}</span>
          </div>
        </div>
        <Pill variant="brass" className="shrink-0">
          {redemptionLabel(promo.redemptions)}
        </Pill>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="brass" size="sm" onClick={handleRedeem} disabled={redeemState.kind === "saving"}>
          <IconTicket size={14} />
          {redeemState.kind === "saving" ? "Logging…" : "+1 Redeemed"}
        </Button>
        <Button variant="default" size="sm" onClick={() => setShareOpen(true)}>
          <IconShare2 size={14} />
          Share
        </Button>
        {endState.kind === "confirming" || endState.kind === "saving" ? (
          <>
            <span className="text-[12.5px] text-ink-mute">End this coupon?</span>
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

      <ShareCouponModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        businessName={businessName}
        offer={promo.offer}
        code={promo.code}
        expiryLabel={expiryLabel}
        phone={businessPhone}
      />
    </div>
  );
}

export function ActivePromotions({
  promos,
  businessName,
  businessPhone,
  maxActive,
  onRedeem,
  onEnd,
}: {
  promos: PromoRow[];
  businessName: string;
  businessPhone: string | null;
  maxActive: number;
  onRedeem: (id: string) => Promise<IncrementRedemptionResult>;
  onEnd: (id: string) => Promise<EndPromoResult>;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        Active promotions ({promos.length}/{maxActive})
      </div>
      {promos.length === 0 ? (
        <Card className="p-5 text-sm text-ink-soft">
          Nothing running yet. Build a coupon above and hit &quot;Start &amp; track this offer&quot; to
          see it here.
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex flex-col divide-y divide-paper-line">
            {promos.map((promo) => (
              <PromoCard
                key={promo.id}
                promo={promo}
                businessName={businessName}
                businessPhone={businessPhone}
                onRedeem={onRedeem}
                onEnd={onEnd}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
