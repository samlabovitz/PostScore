// Open/closed state remembered on this device (localStorage). Every read
// and write is guarded: a private window or blocked storage just means the
// default, never a crash. Per-viewer convenience only.

export type ToggleStorage = Pick<Storage, "getItem" | "setItem">;

const deviceStorage = (): ToggleStorage | null => (typeof window === "undefined" ? null : window.localStorage);

/** The remembered state, or `fallback` when unknown or blocked. */
export function readRememberedOpen(key: string, fallback: boolean, storage: () => ToggleStorage | null = deviceStorage): boolean {
  try {
    const value = storage()?.getItem(key);
    return value === "1" ? true : value === "0" ? false : fallback;
  } catch {
    return fallback;
  }
}

/** Remember open/closed; blocked storage is fine. */
export function rememberOpen(key: string, open: boolean, storage: () => ToggleStorage | null = deviceStorage): void {
  try {
    storage()?.setItem(key, open ? "1" : "0");
  } catch {
    // Not remembered — fine.
  }
}
