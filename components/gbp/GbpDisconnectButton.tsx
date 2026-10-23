"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { disconnectGbp } from "@/app/actions/gbp";
import { t, useLocale } from "@/lib/i18n";

/** Disconnect: revokes PostScore's access at Google, then deletes the
 * stored tokens and Google data (app/actions/gbp.ts). If Google didn't
 * confirm the revoke, says so and where to remove access. */
export function GbpDisconnectButton({ businessId }: { businessId: string }) {
  const router = useRouter();
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "working" | "error" | "notRevoked">("idle");

  async function handleDisconnect() {
    setState("working");
    const result = await disconnectGbp(businessId);
    if (result.status === "ok") {
      if (!result.revoked) setState("notRevoked");
      router.refresh();
    } else {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="default" size="sm" onClick={handleDisconnect} disabled={state === "working"}>
        {state === "working" ? t(locale, "dashboard.connectGbp.disconnecting") : t(locale, "dashboard.connectGbp.disconnect")}
      </Button>
      {state === "error" && <span className="text-sm text-red">{t(locale, "dashboard.connectGbp.disconnectError")}</span>}
      {state === "notRevoked" && (
        <span role="status" className="text-[12.5px] text-ink-soft">
          {t(locale, "dashboard.gbpDisconnect.notRevoked")}
        </span>
      )}
    </div>
  );
}
