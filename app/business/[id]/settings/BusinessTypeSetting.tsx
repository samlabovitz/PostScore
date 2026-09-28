"use client";

import { useState } from "react";
import { BusinessTypeField } from "@/components/assistant/BusinessMemoryPanel";

/**
 * Thin state wrapper so this page (a Server Component) can reuse the
 * exact same BusinessTypeField control PostAI's "What I know about your
 * business" panel uses — no new save logic, no new validation, just the
 * local state a controlled <select> needs to reflect a successful save
 * (BusinessTypeField itself calls updateBusinessTypeOverride and only
 * reports the result back via onSaved).
 */
export function BusinessTypeSetting({
  businessId,
  initialBusinessTypeId,
  autoDetectedBusinessTypeId,
  autoDetectedBusinessType,
  initialOverridden,
  initialTradeName,
}: {
  businessId: string;
  initialBusinessTypeId: string;
  autoDetectedBusinessTypeId: string;
  autoDetectedBusinessType: string;
  initialOverridden: boolean;
  /** The saved trade's own display name (in the business's language),
   * already resolved server-side from business.trade_id — null when no
   * specific trade is behind the current type. */
  initialTradeName: string | null;
}) {
  const [state, setState] = useState({
    businessTypeId: initialBusinessTypeId,
    overridden: initialOverridden,
    tradeName: initialTradeName,
  });

  return (
    <BusinessTypeField
      businessId={businessId}
      businessTypeId={state.businessTypeId}
      autoDetectedBusinessTypeId={autoDetectedBusinessTypeId}
      autoDetectedBusinessType={autoDetectedBusinessType}
      businessTypeOverridden={state.overridden}
      tradeName={state.tradeName}
      onSaved={({ businessTypeId, overridden }) =>
        // A change through this dropdown always clears trade_id
        // server-side (see updateBusinessTypeOverride) — a specific
        // intake-typeahead trade can never survive a manual correction
        // here, so the locally-held trade name is cleared to match.
        setState({ businessTypeId, overridden, tradeName: null })
      }
    />
  );
}
