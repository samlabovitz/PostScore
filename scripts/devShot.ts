// Signed-in screenshots of localhost pages for self-checks (CLAUDE.md).
// Signs in through /dev/test-login (the DEV_TEST_LOGIN_* account in
// .env.local) and drives the installed Google Chrome with playwright-core.
//
//   npx --no-install tsx --env-file=.env.local scripts/devShot.ts <path> [<path>…] [--lang=es] [--plan=premium] [--width=390] [--out=<dir>]
//
// --scroll=N takes N+1 screens while scrolling (lists that load as rows come into view).
// --bottom takes one screen scrolled to the end (fixed buttons over the last rows).
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
    console.error("usage: devShot.ts </path> [</path>…] [--lang=en|es] [--plan=free|grow|premium|multi] [--width=390] [--out=<dir>] [--scroll=N] [--tier=1..5[-set|-due|-quiet|-closed]] [--click=<data-testid>[@n][,…]] [--hover=<data-testid>[@n]] [--wait=ms] [--bottom]");
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
    // Cookie-only setup: plain requests in this browser's context, never waiting on the slow page they redirect to.
    const login = await page.request.get(`${BASE}/dev/test-login?next=/`, { maxRedirects: 0 });
    if (!login || login.status() >= 400) throw new Error(`test login refused (${login?.status()} ${login?.headers()["x-dev-test-login"] ?? (await login?.text())?.slice(0, 120)}) — see CLAUDE.md "Self-check"`);
    if (plan) {
      const set = await page.request.get(`${BASE}/api/dev/plan?plan=${encodeURIComponent(plan)}&back=/`, { maxRedirects: 0 });
      if (!set || set.status() >= 400) throw new Error(`plan switch refused (${set?.status()})`);
    }
    // --tier=1..5: the dev-only preview tier (lib/devTier.ts), this browser only.
    const tier = arg("tier");
    if (tier) {
      const set = await page.request.get(`${BASE}/api/dev/tier?tier=${encodeURIComponent(tier)}&back=/`, { maxRedirects: 0 });
      if (!set || set.status() >= 400) throw new Error(`tier preview refused (${set?.status()})`);
    }
    // --lang: this browser only (a dev cookie, /api/dev/locale) — never a real business's saved language.
    const lc = await page.request.get(`${BASE}/api/dev/locale?lang=${lang ?? "clear"}&back=/`, { maxRedirects: 0 });
    if (lang && (!lc || lc.status() >= 400)) throw new Error(`language override refused (${lc?.status()})`);
    for (const p of paths) {
      await page.goto(`${BASE}${p}`, { waitUntil: "networkidle", timeout: 90_000 });
      // `next dev` can go idle while it's still compiling: wait until the
      // styles are in and the route's loading skeleton (PageSkeleton) is gone.
      const ready = await page
        .waitForFunction(() => document.styleSheets.length > 0 && !document.querySelector('[role="status"][aria-busy="true"]'), null, { timeout: 60_000 })
        .then(() => true, () => false);
      if (!ready) console.warn(`${p}: still loading after 60s — the screenshot may show the loading screen`);
      // --click=a,b: open things first (an editor's "Preview / edit"), by data-testid, in order; --wait: then wait (ms).
      const clicks = (arg("click") ?? "").split(",").filter(Boolean);
      // "row-title@2": the third match (0-based), for lists of the same thing.
      const pick = (spec: string) => {
        const [id, n] = spec.split("@");
        return page.locator(`[data-testid="${id}"]`).nth(Number(n ?? 0));
      };
      for (const id of clicks) {
        const target = pick(id);
        if ((await target.count()) === 0) {
          console.warn(`${p}: nothing to click for data-testid="${id}"`);
          continue;
        }
        await target.scrollIntoViewIfNeeded();
        await target.click();
        await page.waitForLoadState("networkidle").catch(() => undefined);
      }
      // --hover=<data-testid>[@n]: the pointer rests on it (hover styles show in the shot).
      const hover = arg("hover");
      if (hover) {
        const target = pick(hover);
        if ((await target.count()) > 0) {
          await target.scrollIntoViewIfNeeded();
          await target.hover();
        } else console.warn(`${p}: nothing to hover for data-testid="${hover}"`);
      }
      if (arg("wait")) await page.waitForTimeout(Number(arg("wait")));
      const file = path.join(out, `${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}${lang ? `.${lang}` : ""}${plan ? `.${plan}` : ""}${tier ? `.tier${tier}` : ""}${clicks.length ? `.${clicks.join("+")}` : ""}.${width}.png`);
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
      if (process.argv.includes("--bottom")) {
        // --bottom: one screen, scrolled to the end, so fixed things (the "Ask PostAI" button) sit where the owner
        // sees them over the last rows (a full-page shot pins them to the first screen).
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(600);
        const shot = file.replace(/\.png$/, ".bottom.png");
        await page.screenshot({ path: shot });
        console.log(`${p} → ${shot}`);
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
