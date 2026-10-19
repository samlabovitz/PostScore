// The shared print building blocks for every PostScore printout — the
// review sign and the coupon / referral cards: the drawable elements, a
// page of panels, and text measuring/wrapping. The SVG preview
// (svg.ts) and the server PDF (pdf.ts) both draw exactly these, so the
// preview and the PDF always match.

export type FontRole = "headline" | "headlineRegular" | "body" | "bodyBold";
export const FONT_ROLES: FontRole[] = ["headline", "headlineRegular", "body", "bodyBold"];

export interface Measurer {
  /** Width in points; letterSpacing (points) is added after each character. */
  width(text: string, role: FontRole, size: number, letterSpacing?: number): number;
  /** Whether the role's font can draw this character. */
  supports(ch: string, role: FontRole): boolean;
}

export interface Gradient {
  from: string;
  to: string;
  /** 0 = left → right, 90 = top → bottom, 45 = diagonal. */
  angle: 0 | 45 | 90;
}

export type SignElement =
  | {
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      r: number;
      fill: string | null;
      stroke: string | null;
      strokeWidth: number;
      /** A two-color gradient fill (instead of `fill`). */
      gradient?: Gradient | null;
      dash?: boolean;
    }
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      role: FontRole;
      color: string;
      /** A slanted (oblique) style, the same in the preview and the PDF. */
      italic?: boolean;
      letterSpacing?: number;
    }
  /** A filled shape; with `stroke` (and fill "none") an outline. */
  | { kind: "path"; d: string; fill: string; stroke?: string; strokeWidth?: number; dash?: boolean }
  /** `qr` names the code to draw (a page can hold several, e.g. a review
   * link on the front and the Google listing on the back). */
  | { kind: "qr"; x: number; y: number; size: number; qr: string; ink: string; star: string }
  | { kind: "logo"; x: number; y: number; w: number; h: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dash: boolean; dots?: boolean };

export interface SignPanel {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 180 = printed upside down (the back of the tent card). */
  rotate: 0 | 180;
  elements: SignElement[];
  /** Everything on the panel is clipped to this card shape (rounded
   * corners, ticket notches) — so the background follows the edge
   * exactly in the preview, the PNG and the PDF. */
  clip?: CardShape | null;
}

/** A card's outline: a rectangle with optional rounded corners and
 * half-circle "ticket" notches cut into the middle of the left and right
 * sides. */
export interface CardShape {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  notch: number;
}

export type ShapeCommand = ["M", number, number] | ["L", number, number] | ["C", number, number, number, number, number, number] | ["Z"];

const K = 0.5523; // circle quarter as a cubic Bézier

/** The shape as path commands (y down), clockwise — one source for the
 * SVG clip, the PDF clip and the outline. */
export function shapeCommands(s: CardShape): ShapeCommand[] {
  const { x, y, w, h } = s;
  const r = Math.min(s.r, w / 2, h / 2);
  const n = Math.min(s.notch, h / 2 - r - 0.5);
  const cmds: ShapeCommand[] = [];
  const corner = (cx: number, cy: number, sx: number, sy: number, ex: number, ey: number) => {
    // From (sx, sy) to (ex, ey) around the corner whose square point is (cx, cy).
    cmds.push(["C", sx + (cx - sx) * K, sy + (cy - sy) * K, ex + (cx - ex) * K, ey + (cy - ey) * K, ex, ey]);
  };
  const notch = (cx: number, cy: number, inward: 1 | -1, down: boolean) => {
    // A half circle bitten into a side, centered at (cx, cy).
    const sy = down ? cy - n : cy + n;
    const ey = down ? cy + n : cy - n;
    const dir = down ? 1 : -1;
    cmds.push(["C", cx + inward * n * K, sy, cx + inward * n, cy - dir * n * K, cx + inward * n, cy]);
    cmds.push(["C", cx + inward * n, cy + dir * n * K, cx + inward * n * K, ey, cx, ey]);
  };
  cmds.push(["M", x + r, y]);
  cmds.push(["L", x + w - r, y]);
  if (r > 0) corner(x + w, y, x + w - r, y, x + w, y + r);
  if (n > 0) {
    cmds.push(["L", x + w, y + h / 2 - n]);
    notch(x + w, y + h / 2, -1, true);
  }
  cmds.push(["L", x + w, y + h - r]);
  if (r > 0) corner(x + w, y + h, x + w, y + h - r, x + w - r, y + h);
  cmds.push(["L", x + r, y + h]);
  if (r > 0) corner(x, y + h, x + r, y + h, x, y + h - r);
  if (n > 0) {
    cmds.push(["L", x, y + h / 2 + n]);
    notch(x, y + h / 2, 1, false);
  }
  cmds.push(["L", x, y + r]);
  if (r > 0) corner(x, y, x, y + r, x + r, y);
  cmds.push(["Z"]);
  return cmds;
}

export function shapePath(s: CardShape): string {
  const f = (v: number) => String(Math.round(v * 100) / 100);
  return shapeCommands(s)
    .map((c) => c[0] + c.slice(1).map((v) => f(v as number)).join(" "))
    .join("");
}

/** The same shape moved in by `d` on every side (for borders). */
export function insetShape(s: CardShape, d: number): CardShape {
  return { x: s.x + d, y: s.y + d, w: s.w - 2 * d, h: s.h - 2 * d, r: Math.max(0, s.r - d), notch: s.notch > 0 ? s.notch + d : 0 };
}

export interface PrintPage {
  width: number;
  height: number;
  panels: SignPanel[];
  /** Page-level marks: fold, cut and perforation lines. */
  marks: SignElement[];
}

/** Keeps characters every font in the role can draw; collapses spaces. */
export function printable(text: string, m: Measurer, role: FontRole): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    if (/\s/.test(ch)) out += " ";
    else if (m.supports(ch, role)) out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Greedy wrap (overlong words are broken); null if more than maxLines. */
export function wrap(text: string, m: Measurer, role: FontRole, size: number, maxWidth: number, maxLines: number, letterSpacing = 0): string[] | null {
  const words = text
    .split(" ")
    .filter(Boolean)
    .flatMap((word) => {
      if (m.width(word, role, size, letterSpacing) <= maxWidth) return [word];
      const pieces: string[] = [];
      let piece = "";
      for (const ch of word) {
        if (piece && m.width(piece + ch, role, size, letterSpacing) > maxWidth) {
          pieces.push(piece);
          piece = ch;
        } else piece += ch;
      }
      return piece ? [...pieces, piece] : pieces;
    });
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && m.width(next, role, size, letterSpacing) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length > maxLines ? null : lines;
}

export function mixColor(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  const out = [1, 3, 5].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** A rounded rectangle as an SVG path (y down). */
export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  if (r <= 0) return `M${x} ${y}h${w}v${h}h${-w}Z`;
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
}

/** Tan of the oblique slant used for "italic" text. */
export const ITALIC_SKEW = 0.2;
