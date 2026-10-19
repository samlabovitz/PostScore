// The one rule for drawing a row of 5 stars from a real rating: each star
// is filled by how much of it the rating covers — 4.7 is 4 full stars and
// a star 70% filled, never rounded up to 5. Everywhere else in the app a
// rating shows as its number with a single ★ ("4.7 ★"), which needs no
// rule. Pure.

/** Fill of each of the 5 stars, 0–1 (one decimal, so 4.66 → 0.7). */
export function starFills(rating: number | null): number[] {
  const r = typeof rating === "number" && Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating * 10) / 10)) : 0;
  return Array.from({ length: 5 }, (_, i) => Math.round(Math.max(0, Math.min(1, r - i)) * 10) / 10);
}

/** The row as HTML (the starter site): an outline star with the filled
 * part clipped to its fill. `label` is the accessible text. */
export function starRowHtml(rating: number | null, label: string): string {
  const stars = starFills(rating)
    .map((fill) => `<span class="star"><span class="star-fill" style="width:${Math.round(fill * 100)}%">★</span>★</span>`)
    .join("");
  return `<span class="stars" role="img" aria-label="${label.replace(/"/g, "&quot;")}">${stars}</span>`;
}

/** CSS for starRowHtml: `fill` is the filled color, `empty` the outline. */
export function starRowCss(fill: string, empty: string): string {
  return `.stars { display: inline-flex; gap: 3px; font-size: 22px; line-height: 1; }
  .star { position: relative; display: inline-block; color: ${empty}; }
  .star-fill { position: absolute; left: 0; top: 0; overflow: hidden; white-space: nowrap; color: ${fill}; }`;
}
