// Test-only: paints the SVG paths our QR/sign code produces (M, L, H, V,
// A, Z — absolute or relative, circular arcs) into an RGBA pixel buffer,
// so a real QR reader (jsQR) can scan exactly what we draw.

import jsQR from "jsqr";
import { qrLayers, reviewQrGeometry } from "@/lib/reviewQr";

type Pt = [number, number];

function arcPoints(x1: number, y1: number, r: number, large: boolean, sweep: boolean, x2: number, y2: number): Pt[] {
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  let rr = r;
  const lambda = (dx * dx + dy * dy) / (rr * rr);
  if (lambda > 1) rr *= Math.sqrt(lambda);
  const num = rr * rr * rr * rr - rr * rr * dy * dy - rr * rr * dx * dx;
  const den = rr * rr * dy * dy + rr * rr * dx * dx;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = coef * dy;
  const cyp = coef * -dx;
  const cx = cxp + (x1 + x2) / 2;
  const cy = cyp + (y1 + y2) / 2;
  const t1 = Math.atan2((dy - cyp) / rr, (dx - cxp) / rr);
  let dt = Math.atan2((-dy - cyp) / rr, (-dx - cxp) / rr) - t1;
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const steps = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 16)));
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const a = t1 + (dt * i) / steps;
    out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return out;
}

/** Flattens a path into closed polygons (one per subpath). */
export function pathPolygons(d: string): Pt[][] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const polys: Pt[][] = [];
  let cur: Pt[] = [];
  let x = 0;
  let y = 0;
  let i = 0;
  let cmd = "";
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case "M": {
        if (cur.length) polys.push(cur);
        const nx = num();
        const ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        cur = [[x, y]];
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": {
        const nx = num();
        const ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        cur.push([x, y]);
        break;
      }
      case "H": {
        const nx = num();
        x = rel ? x + nx : nx;
        cur.push([x, y]);
        break;
      }
      case "V": {
        const ny = num();
        y = rel ? y + ny : ny;
        cur.push([x, y]);
        break;
      }
      case "A": {
        const r = num();
        num(); // ry (always equal to rx here)
        num(); // rotation
        const large = num() === 1;
        const sweep = num() === 1;
        const nx = num();
        const ny = num();
        const ex = rel ? x + nx : nx;
        const ey = rel ? y + ny : ny;
        cur.push(...arcPoints(x, y, r, large, sweep, ex, ey));
        x = ex;
        y = ey;
        break;
      }
      case "Z":
        if (cur.length) {
          polys.push(cur);
          [x, y] = cur[0];
        }
        cur = [];
        break;
      default:
        throw new Error(`Unsupported path command ${cmd}`);
    }
  }
  if (cur.length) polys.push(cur);
  return polys;
}

function inside(poly: Pt[], px: number, py: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export class Raster {
  readonly data: Uint8ClampedArray;
  constructor(readonly width: number, readonly height: number, background = "#ffffff") {
    this.data = new Uint8ClampedArray(width * height * 4);
    this.fillRect(0, 0, width, height, background);
  }
  fillRect(x: number, y: number, w: number, h: number, color: string) {
    const [r, g, b] = hexRgb(color);
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.height, Math.ceil(y + h)); py++) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.width, Math.ceil(x + w)); px++) {
        const o = (py * this.width + px) * 4;
        this.data[o] = r;
        this.data[o + 1] = g;
        this.data[o + 2] = b;
        this.data[o + 3] = 255;
      }
    }
  }
  /** Paints path `d` (in its own units) scaled by `scale`, offset by (ox, oy). */
  fillPath(d: string, color: string, scale: number, ox = 0, oy = 0) {
    const [r, g, b] = hexRgb(color);
    for (const poly of pathPolygons(d)) {
      const pts = poly.map(([x, y]) => [x * scale + ox, y * scale + oy] as Pt);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      for (let py = Math.max(0, Math.floor(Math.min(...ys))); py < Math.min(this.height, Math.ceil(Math.max(...ys))); py++) {
        for (let px = Math.max(0, Math.floor(Math.min(...xs))); px < Math.min(this.width, Math.ceil(Math.max(...xs))); px++) {
          if (!inside(pts, px + 0.5, py + 0.5)) continue;
          const o = (py * this.width + px) * 4;
          this.data[o] = r;
          this.data[o + 1] = g;
          this.data[o + 2] = b;
          this.data[o + 3] = 255;
        }
      }
    }
  }
}

/** Paints the code exactly as every output draws it, then scans it. */
export function scanQr(url: string, badge: boolean, pxPerModule = 8): string | null {
  const geo = reviewQrGeometry(url, { badge });
  const pad = 4 * pxPerModule;
  const side = geo.size * pxPerModule + 2 * pad;
  const raster = new Raster(side, side);
  for (const layer of qrLayers(geo, "#14243f")) raster.fillPath(layer.d, layer.fill, pxPerModule, pad, pad);
  return jsQR(raster.data, side, side)?.data ?? null;
}


/** Scans an RGBA raster with jsQR. */
export function scanRaster(raster: Raster): string | null {
  return jsQR(raster.data, raster.width, raster.height)?.data ?? null;
}
