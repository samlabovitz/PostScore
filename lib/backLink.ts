// Plain helpers for the "← Back" link on public info pages
// (components/legal/BackLink.tsx). Kept out of the client component's file
// so server pages can call them.

/** "Back" / "Volver" — the arrow is the icon. */
export function backLabel(locale: "en" | "es"): string {
  return locale === "es" ? "Volver" : "Back";
}

/** Go back in history only when there is somewhere to go back to (a page
 * opened from an email or in a new tab has a history of one). */
export function canGoBack(historyLength: number): boolean {
  return historyLength > 1;
}
