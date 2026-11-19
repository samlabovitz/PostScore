// Day 23 2d-5b: finds code that reads Google's listing values from the
// saved `businesses` columns (blanked by 2d-5). Every page reads them live
// or from the owner's confirmed details (lib/businessIdentity.server.ts).
// Used by lib/noSavedGoogleColumns.test.ts. Node only (reads the repo).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Google listing values the old scans saved on `businesses`. */
export const GOOGLE_BUSINESS_COLUMNS = new Set([
  "name",
  "address",
  "phone",
  "website",
  "rating",
  "review_count",
  "category",
  "categories",
  "primary_type",
  "opening_hours",
  "opening_hours_periods",
  "photo_count",
  "business_status",
  "price_level",
  "google_maps_uri",
  "google_service_options",
  "has_recent_review",
  "recent_reviews_seen",
  "listing_has_accessibility",
  "listing_has_payment",
  "listing_has_parking",
  "pure_service_area_business",
]);

const ROOTS = ["app", "lib", "components", "netlify", "scripts"];
const SKIP = /(\.test\.|\.spec\.|\/test\/|node_modules|\.next)/;

function files(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(e) && !SKIP.test(p)) out.push(p);
  }
  return out;
}

const CONST_RE = /(?:const|let)\s+([A-Z][A-Z0-9_]*)\s*(?::\s*string\s*)?=\s*(?:\n\s*)?(["'`])([\s\S]*?)\2/g;

/** `const NAME = "…"` / `` `…` `` string constants in one file, by name. */
function fileConstants(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of Array.from(src.matchAll(CONST_RE))) if (!out.has(m[1])) out.set(m[1], m[3]);
  return out;
}

/** Exported string constants anywhere in the repo, by name (for imports). */
function constants(sources: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const src of Array.from(sources.values())) for (const m of Array.from(src.matchAll(/export\s+const\s+([A-Z][A-Z0-9_]*)\s*(?::\s*string\s*)?=\s*(?:\n\s*)?(["'`])([\s\S]*?)\2/g))) if (!out.has(m[1])) out.set(m[1], m[3]);
  return out;
}

function expand(text: string, consts: Map<string, string>, depth = 0): string {
  if (depth > 4) return text;
  return text.replace(/\$\{\s*([A-Z][A-Z0-9_]*)\s*\}/g, (_, n) => expand(consts.get(n) ?? "", consts, depth + 1));
}

/** The argument text of the `.select(` call starting at `i` (balanced parens). */
function selectArg(src: string, i: number): string {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "(") depth++;
    else if (src[j] === ")" && --depth === 0) return src.slice(i + 1, j);
  }
  return "";
}

/** The column names a select list names ("a, b:c, d->>e" → a, c, d). */
export function selectedColumns(list: string): string[] {
  return list
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const aliased = part.includes(":") ? part.split(":").pop()!.trim() : part;
      return aliased.split(/->|\s|\(/)[0].trim();
    });
}

export interface SavedGoogleRead {
  file: string;
  line: number;
  columns: string[];
}

/** Every `businesses` select naming a Google column (or `*`). */
export function savedGoogleReads(repo: string): SavedGoogleRead[] {
  const sources = new Map<string, string>();
  for (const root of ROOTS) for (const f of files(join(repo, root))) sources.set(f, readFileSync(f, "utf8"));
  const exported = constants(sources);
  const out: SavedGoogleRead[] = [];
  for (const [file, src] of Array.from(sources.entries())) {
    // A file's own constant wins over an exported one of the same name.
    const consts = new Map(Array.from(exported).concat(Array.from(fileConstants(src))));
    for (const m of Array.from(src.matchAll(/from\(\s*["'`]businesses["'`]\s*\)/g))) {
      // The chain up to its end: the next statement or the next table.
      const rest = src.slice(m.index! + m[0].length, m.index! + m[0].length + 1500);
      const end = rest.search(/;\s*\n|\bfrom\(\s*["'`]/);
      const chain = end >= 0 ? rest.slice(0, end) : rest;
      const at = chain.indexOf(".select(");
      if (at < 0) continue;
      // `.update(...).select("id")` reads back what it wrote, not saved values.
      const arg = selectArg(chain, at + ".select".length).trim();
      if (!arg) continue;
      let list: string;
      const literal = arg.match(/^(["'`])([\s\S]*)\1$/);
      if (literal) list = expand(literal[2], consts);
      else if (/^[A-Z][A-Z0-9_]*$/.test(arg)) list = expand(consts.get(arg) ?? "", consts);
      else list = expand(arg.replace(/["'`+]/g, ","), consts);
      const cols = selectedColumns(list);
      const hit = cols.filter((c) => c === "*" || GOOGLE_BUSINESS_COLUMNS.has(c));
      if (hit.length) out.push({ file: relative(repo, file), line: src.slice(0, m.index!).split("\n").length, columns: Array.from(new Set(hit)) });
    }
  }
  // Embedded in another table's select: `notifications.select("…, businesses(name)")`.
  for (const [file, src] of Array.from(sources.entries())) {
    for (const m of Array.from(src.matchAll(/["'`,\s]businesses(?:!\w+)?\(([^)]*)\)/g))) {
      const hit = selectedColumns(m[1]).filter((c) => c === "*" || GOOGLE_BUSINESS_COLUMNS.has(c));
      if (hit.length) out.push({ file: relative(repo, file), line: src.slice(0, m.index!).split("\n").length, columns: Array.from(new Set(hit)) });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
