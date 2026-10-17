// The in-app link-button style ("Get your review link and QR sign →",
// "See what's included →"): cream fill, thin brass border, rounded pill,
// dark text. color-mix(), not "/40": Tailwind's opacity shorthand emits
// no CSS for this project's var()-based colors.
export const LINK_PILL_CLASS =
  "inline-flex w-fit max-w-full items-center rounded-full border border-[color:color-mix(in_srgb,var(--color-brass)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--color-brass)_10%,transparent)] px-2.5 py-1 text-[12px] font-semibold text-ink transition-colors hover:border-brass hover:bg-[color:color-mix(in_srgb,var(--color-brass)_20%,transparent)]";
