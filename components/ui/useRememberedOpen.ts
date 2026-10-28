"use client";

// Open by default; a collapse is remembered per account (and on this
// device, as a fallback). `accountCollapsed` is the account's saved
// choice, read on the server (null = none saved, or not available).
// `toggle` is the owner's own click (saved); `reveal` opens without
// saving (e.g. a link to one of the rows).

import { useCallback, useEffect, useState } from "react";
import { setUiPreference } from "@/app/actions/uiPreferences";
import { readDevicePreference, writeDevicePreference, type UiPreferenceKey } from "@/lib/uiPreferences";

export function useRememberedOpen(key: UiPreferenceKey, accountCollapsed: boolean | null): { open: boolean; toggle: () => void; reveal: () => void } {
  const [open, setOpen] = useState(accountCollapsed !== true);
  useEffect(() => {
    if (accountCollapsed !== null) return;
    const device = readDevicePreference(key);
    if (device !== null) setOpen(!device);
  }, [key, accountCollapsed]);
  function toggle() {
    const next = !open;
    setOpen(next);
    writeDevicePreference(key, !next);
    void setUiPreference(key, !next);
  }
  const reveal = useCallback(() => setOpen(true), []);
  return { open, toggle, reveal };
}
