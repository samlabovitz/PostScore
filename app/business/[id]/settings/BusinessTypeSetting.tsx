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
}: {
  businessId: string;
  initialBusinessTypeId: string;
  autoDetectedBusinessTypeId: string;
  autoDetectedBusinessType: string;
  initialOverridden: boolean;
}) {
  const [state, setState] = useState({
    businessTypeId: initialBusinessTypeId,
    overridden: initialOverridden,
  });

  return (
    <BusinessTypeField
      businessId={businessId}
      businessTypeId={state.businessTypeId}
      autoDetectedBusinessTypeId={autoDetectedBusinessTypeId}
      autoDetectedBusinessType={autoDetectedBusinessType}
      businessTypeOverridden={state.overridden}
      onSaved={({ businessTypeId, overridden }) => setState({ businessTypeId, overridden })}
    />
  );
}
