import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Day 25B: every link to a page that moves (Growth, the Google tab,
// Reviews, Campaigns) goes through lib/routes.ts, so flipping
// NEW_PAGES_LIVE moves them all at once. A hand-written one anywhere
// else fails here.

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "components", "lib", "emails", "scripts"];
const ALLOWED = new Set(["lib/routes.ts"]);

/** A route segment used as a link: "/growth" followed by a quote, ?, #, ${ or the end of a template. */
const HAND_WRITTEN = /\/(growth|google-profile|search-demand|website-reviews|campaigns)(?=[`"'?#]|\$\{)/;

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** Comments can name these paths freely (file paths, docs). */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("route links", () => {
  it("has no hand-written link to a moving page outside lib/routes.ts", () => {
    const found: string[] = [];
    for (const dir of DIRS) {
      for (const file of files(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file);
        if (ALLOWED.has(rel)) continue;
        withoutComments(readFileSync(file, "utf8"))
          .split("\n")
          .forEach((line, i) => {
            if (HAND_WRITTEN.test(line)) found.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
          });
      }
    }
    expect(found).toEqual([]);
  });

  it("catches a hand-written link (the pattern works)", () => {
    expect(HAND_WRITTEN.test("href={`/business/${id}/growth`}")).toBe(true);
    expect(HAND_WRITTEN.test('path: "/website-reviews"')).toBe(true);
    expect(HAND_WRITTEN.test("`/business/${id}/campaigns?tab=coupons`")).toBe(true);
    expect(HAND_WRITTEN.test("`${base}/growth?tab=google#${hash}`")).toBe(true);
    // Imports and file paths are fine.
    expect(HAND_WRITTEN.test('import { X } from "@/app/business/[id]/campaigns/CouponBuilder";')).toBe(false);
    expect(HAND_WRITTEN.test('import { s } from "../website-reviews/buttonStyles";')).toBe(false);
  });
});
