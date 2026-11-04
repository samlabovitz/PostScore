// Per-account UI choices — the keys, and the device fallback used until
// supabase/ui-preferences.sql is run (or when the account read fails).
// Browser-safe; the account read/write is app/actions/uiPreferences.ts.

// "overview.breakdownCollapsed.v2" (Nov 2026): the Score breakdown opens by
// default for every owner — a new key resets everyone's earlier
// "collapsed" choice once (the old key is simply never read again);
// collapsing it again is remembered under the new key.
export const UI_PREFERENCE_KEYS = ["overview.breakdownCollapsed.v2", "free.planListCollapsed"] as const;
export type UiPreferenceKey = (typeof UI_PREFERENCE_KEYS)[number];

const storageKey = (key: UiPreferenceKey) => `postscore:pref:${key}`;

export function readDevicePreference(key: UiPreferenceKey): boolean | null {
  try {
    const v = window.localStorage.getItem(storageKey(key));
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function writeDevicePreference(key: UiPreferenceKey, value: boolean): void {
  try {
    window.localStorage.setItem(storageKey(key), value ? "1" : "0");
  } catch {
    // Private mode: the account still remembers it (once its SQL is run).
  }
}
