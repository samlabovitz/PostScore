// WCAG color math for generated pages (the starter website): contrast
// ratios, and nudging a color just far enough to be readable on a given
// background. Pure; #rrggbb only.

const HEX = /^#[0-9a-f]{6}$/i;

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}

export function isHex(value: string): boolean {
  return HEX.test(value);
}

export function luminance(hex: string): number {
  const c = channels(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** WCAG contrast ratio of two #rrggbb colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `a` mixed toward `b` by `amount` (0 = a, 1 = b). */
export function mix(a: string, b: string, amount: number): string {
  const x = channels(a);
  const y = channels(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * amount));
}

/** `fg` as-is when it already reads on `bg` at `min`:1; otherwise moved
 * toward black or white (whichever the background contrasts with more)
 * in small steps until it does. Keeps the hue as long as possible. */
export function readableOn(fg: string, bg: string, min = 4.5): string {
  if (contrastRatio(fg, bg) >= min) return fg;
  const target = contrastRatio("#000000", bg) >= contrastRatio("#ffffff", bg) ? "#000000" : "#ffffff";
  for (let step = 1; step <= 20; step++) {
    const candidate = mix(fg, target, step * 0.05);
    if (contrastRatio(candidate, bg) >= min) return candidate;
  }
  return target;
}

/** Readable on every background in `bgs` (the strictest one wins). */
export function readableOnAll(fg: string, bgs: string[], min = 4.5): string {
  let color = fg;
  for (let i = 0; i < 3; i++) for (const bg of bgs) color = readableOn(color, bg, min);
  return color;
}

/** Text color for a filled button: white or `dark`, whichever reads better. */
export function textOn(bg: string, dark: string): string {
  return contrastRatio("#ffffff", bg) >= contrastRatio(dark, bg) ? "#ffffff" : dark;
}
