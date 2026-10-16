// Places the Competitors page lineup's labels (#1, lowest, area average,
// you) so they never overlap: each label goes in the first free lane —
// its preferred side of the line first, then the other side, then a
// second row — and is kept inside the strip's edges. Pure; pixels in,
// pixels out, so it's testable and works at any width (375px phones).

export type Lane = "above1" | "above2" | "below1" | "below2";

export interface LabelRequest {
  key: string;
  /** Where the label points (the dot or tick), in px from the left. */
  anchor: number;
  /** The label's rendered width in px (an estimate is fine). */
  width: number;
  prefer: "above" | "below";
}

export interface PlacedLabel {
  key: string;
  lane: Lane;
  /** Left edge in px. */
  left: number;
  width: number;
}

const GAP = 6;

/** Rough width of an 11.5px label. */
export function estimateLabelWidth(text: string): number {
  return Math.ceil(text.length * 6.3 + 8);
}

/** Shortens a name for a label; the full name goes in a tooltip. */
export function shortName(name: string, max = 16): string {
  return name.length <= max ? name : `${name.slice(0, max - 1).trimEnd()}…`;
}

export function layoutLabels(requests: LabelRequest[], containerWidth: number): PlacedLabel[] {
  const lanes: Record<Lane, Array<{ left: number; right: number }>> = { above1: [], above2: [], below1: [], below2: [] };
  const placed: PlacedLabel[] = [];
  for (const r of requests) {
    const width = Math.min(r.width, containerWidth);
    const left = Math.min(Math.max(r.anchor - width / 2, 0), containerWidth - width);
    const order: Lane[] = r.prefer === "above" ? ["above1", "below1", "above2", "below2"] : ["below1", "above1", "below2", "above2"];
    const lane =
      order.find((l) => lanes[l].every((o) => left + width + GAP <= o.left || left >= o.right + GAP)) ?? order[order.length - 1];
    lanes[lane].push({ left, right: left + width });
    placed.push({ key: r.key, lane, left, width });
  }
  return placed;
}
