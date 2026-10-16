// Day 4 Step 3: which website builder a site is made with — read from
// data every scan already has (no extra request): the homepage HTML's
// generator tag and asset hosts, the site's own hostname, and
// PageSpeed's own platform detection (Lighthouse "stack packs"). Pure.
// "Unknown" is a real answer — never a guess.

export type WebsiteBuilderId =
  | "wix"
  | "squarespace"
  | "godaddy"
  | "shopify"
  | "wordpress"
  | "square"
  | "weebly"
  | "google_sites"
  | "webflow"
  | "duda";

export const WEBSITE_BUILDER_NAMES: Record<WebsiteBuilderId, string> = {
  wix: "Wix",
  squarespace: "Squarespace",
  godaddy: "GoDaddy Website Builder",
  shopify: "Shopify",
  wordpress: "WordPress",
  square: "Square Online",
  weebly: "Weebly",
  google_sites: "Google Sites",
  webflow: "Webflow",
  duda: "Duda",
};

/** Hosted builders that take care of SSL, phone layout and hosting —
 * an owner can usually fix those settings themselves (lib/websiteFixes.ts). */
export const HOSTED_BUILDERS: ReadonlySet<WebsiteBuilderId> = new Set<WebsiteBuilderId>([
  "wix",
  "squarespace",
  "godaddy",
  "shopify",
  "square",
  "weebly",
  "google_sites",
  "webflow",
  "duda",
]);

export type WebsiteBuilderSource = "generator" | "assets" | "hostname" | "pagespeed";

export interface WebsiteBuilderDetection {
  id: WebsiteBuilderId | null;
  source: WebsiteBuilderSource | null;
}

const GENERATOR_PATTERNS: Array<[RegExp, WebsiteBuilderId]> = [
  [/wix\.com/i, "wix"],
  [/squarespace/i, "squarespace"],
  [/go ?daddy|starfield/i, "godaddy"],
  [/shopify/i, "shopify"],
  [/wordpress/i, "wordpress"],
  [/square online|weebly/i, "square"],
  [/google sites/i, "google_sites"],
  [/webflow/i, "webflow"],
  [/duda/i, "duda"],
];

const ASSET_PATTERNS: Array<[RegExp, WebsiteBuilderId]> = [
  [/static\.wixstatic\.com|parastorage\.com/i, "wix"],
  [/static1\.squarespace\.com|assets\.squarespace\.com|SQUARESPACE_CONTEXT/, "squarespace"],
  [/img1\.wsimg\.com|websites\.godaddy\.com/i, "godaddy"],
  [/cdn\.shopify\.com|Shopify\.theme/, "shopify"],
  [/\/wp-content\/|\/wp-includes\//i, "wordpress"],
  [/editmysite\.com|squareup\.com\/online-store|square\.site/i, "square"],
  [/weebly\.com\/(?:uploads|editor)/i, "weebly"],
  [/website-files\.com|webflow\.(?:com|io)\/js/i, "webflow"],
  [/irp\.cdn-website\.com|multiscreensite\.com/i, "duda"],
];

const HOSTNAME_PATTERNS: Array<[RegExp, WebsiteBuilderId]> = [
  [/(^|\.)wixsite\.com$/i, "wix"],
  [/(^|\.)squarespace\.com$/i, "squarespace"],
  [/(^|\.)godaddysites\.com$/i, "godaddy"],
  [/(^|\.)myshopify\.com$/i, "shopify"],
  [/(^|\.)wordpress\.com$/i, "wordpress"],
  [/(^|\.)square\.site$/i, "square"],
  [/(^|\.)weebly\.com$/i, "weebly"],
  [/^sites\.google\.com$/i, "google_sites"],
  [/(^|\.)webflow\.io$/i, "webflow"],
];

const STACK_PACK_IDS: Record<string, WebsiteBuilderId> = {
  wordpress: "wordpress",
  wix: "wix",
  shopify: "shopify",
  squarespace: "squarespace",
  "godaddy-website-builder": "godaddy",
  webflow: "webflow",
  duda: "duda",
};

function generatorContent(html: string): string | null {
  const m =
    html.match(/<meta[^>]+name\s*=\s*["']generator["'][^>]*content\s*=\s*["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']generator["']/i);
  return m ? m[1] : null;
}

/** In order of how certain each signal is: the site's own generator tag,
 * then builder-owned asset hosts, then the hostname, then PageSpeed. */
export function detectWebsiteBuilder(input: {
  html: string | null;
  hostname: string | null;
  stackPackIds?: string[] | null;
}): WebsiteBuilderDetection {
  const html = input.html ?? "";
  const generator = html ? generatorContent(html) : null;
  if (generator) {
    for (const [re, id] of GENERATOR_PATTERNS) if (re.test(generator)) return { id, source: "generator" };
  }
  if (html) {
    for (const [re, id] of ASSET_PATTERNS) if (re.test(html)) return { id, source: "assets" };
  }
  const host = (input.hostname ?? "").replace(/^www\./i, "").toLowerCase();
  if (host) {
    for (const [re, id] of HOSTNAME_PATTERNS) if (re.test(host)) return { id, source: "hostname" };
  }
  for (const pack of input.stackPackIds ?? []) {
    const id = STACK_PACK_IDS[pack.toLowerCase()];
    if (id) return { id, source: "pagespeed" };
  }
  return { id: null, source: null };
}

export function isWebsiteBuilderId(value: unknown): value is WebsiteBuilderId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(WEBSITE_BUILDER_NAMES, value);
}
