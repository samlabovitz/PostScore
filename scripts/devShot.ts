// Signed-in screenshots of localhost pages for self-checks (CLAUDE.md).
// Signs in through /dev/test-login (the DEV_TEST_LOGIN_* account in
// .env.local) and drives the installed Google Chrome with playwright-core.
//
//   npx --no-install tsx --env-file=.env.local scripts/devShot.ts <path> [<path>…] [--lang=es] [--plan=premium] [--width=390] [--out=<dir>]
//
// --lang=en|es shows a business's pages in that language: it sets that
// business's saved language (from /business/<id>/… in the path) for the
// screenshot and puts the owner's own setting back afterwards, even on a
// failure. Without it, pages show in the business's saved language.
// --plan=free|grow|premium|multi views the pages as that plan (the dev plan
// switcher's cookie, in this script's own browser only).
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const BASE = process.env.DEV_SHOT_BASE_URL ?? "http://localhost:3000";

setTimeout(() => {
  console.error("timed out");
  process.exit(1);
}, 5 * 60_000);

function arg(name: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}

async function main() {
  const paths = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (paths.length === 0 || !paths.every((p) => p.startsWith("/"))) {
    console.error("usage: devShot.ts </path> [</path>…] [--lang=en|es] [--plan=free|grow|premium|multi] [--width=390] [--out=<dir>]");
    process.exit(1);
  }
  const lang = arg("lang");
  if (lang && lang !== "en" && lang !== "es") throw new Error("--lang must be en or es");
  const plan = arg("plan");
  const width = Number(arg("width") ?? 390);
  const out = arg("out") ?? path.join(process.cwd(), ".devshots");
  mkdirSync(out, { recursive: true });

  const businessIds = Array.from(new Set(paths.map((p) => p.match(/^\/business\/([0-9a-f-]{36})/)?.[1]).filter((id): id is string => !!id)));
  const db = lang ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) : null;
  const original = new Map<string, string | null>();
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    if (db && lang) {
      for (const id of businessIds) {
        const { data, error } = await db.from("businesses").select("language").eq("id", id).single();
        if (error) throw error;
        original.set(id, (data as { language: string | null }).language);
        if (data.language !== lang) await db.from("businesses").update({ language: lang }).eq("id", id);
      }
    }
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: width < 600 });
    const login = await page.goto(`${BASE}/dev/test-login?next=/`);
    if (!login || login.status() >= 400) throw new Error(`test login refused (${login?.status()} ${login?.headers()["x-dev-test-login"] ?? (await login?.text())?.slice(0, 120)}) — see CLAUDE.md "Self-check"`);
    if (plan) {
      const set = await page.goto(`${BASE}/api/dev/plan?plan=${encodeURIComponent(plan)}&back=/`);
      if (!set || set.status() >= 400) throw new Error(`plan switch refused (${set?.status()})`);
    }
    for (const p of paths) {
      await page.goto(`${BASE}${p}`, { waitUntil: "networkidle", timeout: 90_000 });
      const file = path.join(out, `${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}${lang ? `.${lang}` : ""}${plan ? `.${plan}` : ""}.${width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`${p} → ${file}`);
    }
  } finally {
    await browser.close();
    if (db) {
      for (const [id, language] of Array.from(original)) {
        if (language !== lang) await db.from("businesses").update({ language }).eq("id", id);
      }
      if (original.size) console.log(`language put back for ${original.size} business(es)`);
    }
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
