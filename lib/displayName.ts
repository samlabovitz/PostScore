// Long business names (some Google listings stuff keywords into the name:
// "Hair Extension Sew ins Weave Microlinks Hair Extensions Tape in Crochet
// Box Braids Wigs White Plains Peekskill Yonkers") shortened for DISPLAY —
// with "…", the full name on hover. The stored name never changes. Pure.

export const DISPLAY_NAME_MAX = 40;

export function shortName(name: string | null | undefined, max: number = DISPLAY_NAME_MAX): string {
  const n = (name ?? "").replace(/\s+/g, " ").trim();
  if (n.length <= max) return n;
  const cut = n.slice(0, max - 1);
  // End on a whole word when that keeps most of the room.
  const wholeWord = n[max - 1] === " ";
  const space = cut.lastIndexOf(" ");
  const base = wholeWord ? cut : space >= Math.floor(max * 0.6) ? cut.slice(0, space) : cut;
  return `${base.replace(/[\s,;:·|–—&-]+$/, "")}…`;
}
