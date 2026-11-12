import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The crash after reconnecting Google ("connectedScoreChange is not a
// function"): on the server, everything a "use client" file exports is
// only a client reference — a component can be rendered, but a plain
// function can't be called. Vitest doesn't apply that boundary, so this
// checks it: no server code — a page, layout or route, a "use server"
// actions file, or a server-only module — calls a function imported from
// a "use client" file. Pure helpers belong in a plain module. (A plain
// component file imported by client components runs on the client, so it
// isn't checked.)

const ROOTS = ["app", "components", "lib"];
const isServer = (file: string, src: string) =>
  /(^|\/)(page|layout|route|template|not-found|default)\.tsx?$/.test(file) || /^\s*["']use server["']/.test(src) || src.includes('import "server-only"') || /\.server\.tsx?$/.test(file);
const isClient = (src: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\s*["']use client["']/.test(src);

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : files(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? path.join(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [`${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")]) if (fs.existsSync(c)) return c;
  return null;
}

/** [server file, imported name, client file] for every call across the boundary. */
function violations(): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  for (const file of ROOTS.flatMap(files)) {
    const src = fs.readFileSync(file, "utf8");
    if (isClient(src) || !isServer(file, src)) continue;
    for (const m of Array.from(src.matchAll(/import\s+(?!type\b)\{([^}]+)\}\s+from\s+["']([^"']+)["']/g))) {
      const target = resolve(file, m[2]);
      if (!target || !isClient(fs.readFileSync(target, "utf8"))) continue;
      const names = m[1]
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n && !n.startsWith("type "))
        .map((n) => n.split(/\s+as\s+/).pop()!.trim());
      for (const name of names) {
        // Rendering <Name /> is fine; calling name(…) is not.
        // (A spread "...name(" is a call too; "obj.name(" is someone else's.)
        if (new RegExp(`(?<![<\\w])(?<![\\w)\\]]\\.)${name}\\s*\\(`).test(src.replace(m[0], ""))) out.push([file, name, target]);
      }
    }
  }
  return out;
}

describe("the server never calls a function from a \"use client\" file", () => {
  test("no server page, layout, route or module does", () => {
    expect(violations()).toEqual([]);
  });

  test("the check catches the real bug: the Overview calling connectedScoreChange from the notices file", () => {
    const page = fs.readFileSync("app/business/[id]/page.tsx", "utf8");
    expect(page).toContain('import { connectedScoreChange } from "@/lib/gbpConnectedNote";');
    expect(isClient(fs.readFileSync("lib/gbpConnectedNote.ts", "utf8"))).toBe(false);
    expect(isClient(fs.readFileSync("components/gbp/GoogleConnectionNotices.tsx", "utf8"))).toBe(true);
    expect(fs.readFileSync("components/gbp/GoogleConnectionNotices.tsx", "utf8")).not.toMatch(/export function [a-z]/);
  });
});
