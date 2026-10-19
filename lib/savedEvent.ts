// A tiny "this setting saved" signal: controls call announceSaved() after
// a real, confirmed save; the Settings page shows a short toast.
export const SAVED_EVENT = "postscore:saved";

export function announceSaved(): void {
  try {
    window.dispatchEvent(new CustomEvent(SAVED_EVENT));
  } catch {
    // No window (tests): nothing to show.
  }
}
