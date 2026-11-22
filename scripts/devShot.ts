// Signed-in screenshots of localhost pages for self-checks (CLAUDE.md).
// Signs in through /dev/test-login (the DEV_TEST_LOGIN_* account in
// .env.local) and drives the installed Google Chrome with playwright-core.
//
//   npx --no-install tsx --env-file=.env.local scripts/devShot.ts <path> [<path>…] [--lang=es] [--plan=premium] [--width=390] [--out=<dir>]
//
// --scroll=N takes N+1 screens while scrolling (lists that load as rows come into view).
// --lang=en|es shows the pages (and any drafts) in that language through a
// dev-only cookie in this script's own browser (/api/dev/locale) — it NEVER
// changes a business's saved language, so an owner testing at the same time
// sees nothing change. Without it, pages show in the business's saved language.
// --plan=free|grow|premium|multi views the pages as that plan (the dev plan
// switcher's cookie, in this script's own browser only).
import { mkdirSync } from "node:fs";
import path from "node:path";
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
    console.error("usage: devShot.ts </path> [</path>…] [--lang=en|es] [--plan=free|grow|premium|multi] [--width=390] [--out=<dir>] [--scroll=N]");
    process.exit(1);
  }
  const lang = arg("lang");
  if (lang && lang !== "en" && lang !== "es") throw new Error("--lang must be en or es");
  const plan = arg("plan");
  const width = Number(arg("width") ?? 390);
  const out = arg("out") ?? path.join(process.cwd(), ".devshots");
  mkdirSync(out, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: width < 600 });
    const login = await page.goto(`${BASE}/dev/test-login?next=/`);
    if (!login || login.status() >= 400) throw new Error(`test login refused (${login?.status()} ${login?.headers()["x-dev-test-login"] ?? (await login?.text())?.slice(0, 120)}) — see CLAUDE.md "Self-check"`);
    if (plan) {
      const set = await page.goto(`${BASE}/api/dev/plan?plan=${encodeURIComponent(plan)}&back=/`);
      if (!set || set.status() >= 400) throw new Error(`plan switch refused (${set?.status()})`);
    }
    // --lang: this browser only (a dev cookie, /api/dev/locale) — never a real business's saved language.
    const lc = await page.goto(`${BASE}/api/dev/locale?lang=${lang ?? "clear"}&back=/`);
    if (lang && (!lc || lc.status() >= 400)) throw new Error(`language override refused (${lc?.status()})`);
    for (const p of paths) {
      await page.goto(`${BASE}${p}`, { waitUntil: "networkidle", timeout: 90_000 });
      // `next dev` can go idle while it's still compiling: wait until the
      // styles are in and the route's loading skeleton (PageSkeleton) is gone.
      const ready = await page
        .waitForFunction(() => document.styleSheets.length > 0 && !document.querySelector('[role="status"][aria-busy="true"]'), null, { timeout: 60_000 })
        .then(() => true, () => false);
      if (!ready) console.warn(`${p}: still loading after 60s — the screenshot may show the loading screen`);
      const file = path.join(out, `${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}${lang ? `.${lang}` : ""}${plan ? `.${plan}` : ""}.${width}.png`);
      const steps = Number(arg("scroll") ?? 0);
      if (steps > 0) {
        // --scroll=N: what the owner sees while scrolling — one screen per step,
        // with how many names are still loading ("business-name-loading").
        for (let i = 0; i <= steps; i++) {
          await page.waitForTimeout(2500);
          const shot = file.replace(/\.png$/, `.scroll${i}.png`);
          await page.screenshot({ path: shot });
          const loading = await page.locator('[data-testid="business-name-loading"]').count();
          const fallback = await page.getByText(/^(Your business|Su negocio)$/).count();
          console.log(`${p} step ${i} → ${shot} (still loading: ${loading}, "Your business": ${fallback})`);
          await page.mouse.wheel(0, 800);
        }
        continue;
      }
      await page.screenshot({ path: file, fullPage: true });
      console.log(`${p} → ${file}`);
    }
  } finally {
    await browser.close();
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
