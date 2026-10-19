// A small set of original, simple card icons (filled shapes on a 24×24
// grid), and which one suits a business type. Holes wind the opposite
// way to their shape, so they stay open under the nonzero fill rule the
// preview and the PDF both use.

export const CARD_ICON_IDS = ["star", "gift", "tag", "bag", "bottle", "cup", "cutlery", "scissors", "paw", "wrench", "flower", "dumbbell"] as const;
export type CardIconId = (typeof CARD_ICON_IDS)[number];

const r = (n: number) => Math.round(n * 100) / 100;

/** A circle; `hole` winds the other way (a cut-out). */
function circle(cx: number, cy: number, rad: number, hole = false): string {
  const s = hole ? 0 : 1;
  return `M${r(cx - rad)} ${r(cy)}a${rad} ${rad} 0 1 ${s} ${r(2 * rad)} 0a${rad} ${rad} 0 1 ${s} ${r(-2 * rad)} 0Z`;
}

/** A rectangle; `hole` winds the other way. */
function rect(x: number, y: number, w: number, h: number, hole = false): string {
  return hole ? `M${x} ${y}v${h}h${w}v${-h}Z` : `M${x} ${y}h${w}v${h}h${-w}Z`;
}

/** A rounded rectangle (clockwise). */
function rrect(x: number, y: number, w: number, h: number, rad: number): string {
  return `M${x + rad} ${y}h${w - 2 * rad}a${rad} ${rad} 0 0 1 ${rad} ${rad}v${h - 2 * rad}a${rad} ${rad} 0 0 1 ${-rad} ${rad}h${-(w - 2 * rad)}a${rad} ${rad} 0 0 1 ${-rad} ${-rad}v${-(h - 2 * rad)}a${rad} ${rad} 0 0 1 ${rad} ${-rad}Z`;
}

function starShape(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${r(cx + rad * Math.cos(a))} ${r(cy + rad * Math.sin(a))}`);
  }
  return `M${pts.join("L")}Z`;
}

export const CARD_ICONS: Record<CardIconId, string> = {
  star: starShape(12, 12.6, 10.5, 4.6),
  gift: rect(3, 9, 18, 4) + rect(4.5, 13, 15, 8.5) + rect(10.6, 9, 2.8, 12.5, true) + circle(9, 6.5, 2.6) + circle(15, 6.5, 2.6),
  tag: "M3 3h9l9.5 9.5-9 9L3 12Z" + circle(7.5, 7.5, 1.8, true),
  bag: rrect(4, 8, 16, 13.5, 2) + "M8 8v-2.2a4 4 0 0 1 8 0V8h-2v-2.2a2 2 0 0 0-4 0V8Z",
  bottle: rect(10, 2, 4, 2.2) + "M10.4 4.2h3.2v3.4c0 1.2 3.4 2.2 3.4 5.4v7.2a1.8 1.8 0 0 1-1.8 1.8H8.8A1.8 1.8 0 0 1 7 20.2V13c0-3.2 3.4-4.2 3.4-5.4Z",
  cup: "M4 9h13v6.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" + circle(18.3, 12.6, 3) + circle(18.3, 12.6, 1.4, true) + rect(7, 3, 1.8, 4.2) + rect(11.2, 2.2, 1.8, 5) + rect(3, 21.2, 15, 1.6),
  cutlery: rect(5, 2.5, 1.4, 6) + rect(7.6, 2.5, 1.4, 6) + rect(10.2, 2.5, 1.4, 6) + "M5 8.5h6.6c0 2-1.4 3-2.4 3.4V21.5H7.4V11.9C6.4 11.5 5 10.5 5 8.5Z" + "M15 2.5c2.6 1 3.8 4.4 3.8 8.4H17.4V21.5H15.6V2.5Z",
  scissors: circle(6.5, 17.5, 3.6) + circle(6.5, 17.5, 1.7, true) + circle(17.5, 17.5, 3.6) + circle(17.5, 17.5, 1.7, true) + "M8.6 14.6 17 2.6l1.5 1L10.4 15.6Z" + "M15.4 14.6 7 2.6l-1.5 1 8.1 12Z",
  paw: circle(12, 16, 4.6) + circle(5.4, 10.6, 2.2) + circle(9.2, 6.4, 2.3) + circle(14.8, 6.4, 2.3) + circle(18.6, 10.6, 2.2),
  wrench: "M14.6 2.4a5.6 5.6 0 0 0-5.5 7.1L2.8 15.8a2.2 2.2 0 0 0 3.1 3.1l6.3-6.3a5.6 5.6 0 0 0 7.1-5.5l-3.2 3.2-3.1-.9-.9-3.1Z",
  flower: circle(12, 6.6, 3.2) + circle(6.9, 10.3, 3.2) + circle(8.9, 16.2, 3.2) + circle(15.1, 16.2, 3.2) + circle(17.1, 10.3, 3.2) + circle(12, 12, 2.2, true),
  dumbbell: rect(2, 8.5, 2.6, 7) + rect(4.6, 6.5, 3, 11) + rect(7.6, 10.8, 8.8, 2.4) + rect(16.4, 6.5, 3, 11) + rect(19.4, 8.5, 2.6, 7),
};

/** The icon that suits a business, from its Google category words. */
export function iconForBusiness(...words: Array<string | null | undefined | string[]>): CardIconId {
  const text = words.flat().filter(Boolean).join(" ").toLowerCase();
  const rules: Array<[RegExp, CardIconId]> = [
    [/liquor|wine|spirits|bar\b|brew|beer|bottle/, "bottle"],
    [/cafe|café|coffee|tea|bakery|donut|dessert/, "cup"],
    [/restaurant|food|meal|pizza|deli|burrito|taco|grill|diner|kitchen|sandwich|chicken|sushi/, "cutlery"],
    [/salon|hair|barber|nail|beauty|spa|lash|brow/, "scissors"],
    [/pet|veterinar|groom|dog|cat\b/, "paw"],
    [/auto|car\b|repair|hardware|mechanic|tire|plumb/, "wrench"],
    [/florist|flower|garden|nursery|plant/, "flower"],
    [/gym|fitness|yoga|pilates|crossfit|martial|dance/, "dumbbell"],
    [/store|shop|retail|grocery|supermarket|market|boutique|cloth/, "bag"],
  ];
  return rules.find(([re]) => re.test(text))?.[1] ?? "star";
}

/** An icon path placed at (x, y), `size` wide. */
export function placeIcon(id: CardIconId, x: number, y: number, size: number): string {
  const s = size / 24;
  // Re-emit the path in absolute page units by scaling every number;
  // arcs keep their flags. Paths here use M/h/v/l/a/c/L/Z only.
  const tokens = CARD_ICONS[id].match(/[a-zA-Z]|-?\d*\.?\d+/g) ?? [];
  const out: string[] = [];
  let cmd = "";
  let argIndex = 0;
  for (const tok of tokens) {
    if (/[a-zA-Z]/.test(tok)) {
      cmd = tok;
      argIndex = 0;
      out.push(tok);
      continue;
    }
    const v = parseFloat(tok);
    const upper = cmd.toUpperCase();
    const abs = cmd === upper;
    let value = v * s;
    if (upper === "A") {
      const k = argIndex % 7;
      if (k === 2 || k === 3 || k === 4) value = v; // rotation and flags
      else if (k === 5 && abs) value = x + v * s;
      else if (k === 6 && abs) value = y + v * s;
    } else if (abs && (upper === "M" || upper === "L" || upper === "C")) value = argIndex % 2 === 0 ? x + v * s : y + v * s;
    else if (abs && upper === "H") value = x + v * s;
    else if (abs && upper === "V") value = y + v * s;
    out.push(String(r(value)));
    argIndex++;
  }
  return out.join(" ").replace(/ ([a-zA-Z]) /g, "$1").replace(/ ([a-zA-Z])$/, "$1");
}
