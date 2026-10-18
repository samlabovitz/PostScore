// Server: the sign fonts from public/sign-fonts (traced into the PDF
// route's bundle by next.config.mjs).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { FONTS } from "@/lib/signStudio/design";

const ALLOWED = new Set(Object.values(FONTS).flatMap((f) => [f.regular, f.bold]));

export async function readSignFont(file: string): Promise<Uint8Array> {
  if (!ALLOWED.has(file)) throw new Error(`Unknown sign font: ${file}`);
  return new Uint8Array(await readFile(path.join(process.cwd(), "public", "sign-fonts", file)));
}
