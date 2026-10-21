# Day 5 — PostStudio Website: plan

Day 5a plan, updated with your Day 5 decisions (see "Decisions" in §7 and the new
step 5k-0). This builds on what exists today:
- the starter website generator (`lib/starterSite.ts`): 18 themes, style accents, 10 font pairings, photos, the hours editor, the rating toggle, the storefront map and the single-file HTML download;
- builder detection (`lib/websiteBuilder.ts`) and the per-builder fix guides (`lib/websiteBuilderGuides.ts`);
- Re-check my website (`lib/websiteRecheck.server.ts`, 3 a day);
- `getPlan()` (`lib/premium.ts`) and `docs/website-studio.md`.

The structure it fits into is `docs/product-structure.md` (in the repo).

Prices and limits for hosting providers below are from my knowledge (to mid‑2026). **Check each provider's current pricing page before signing up.** I mark the numbers that matter most.

---

## 1. Goal

**PostStudio is the real alternative to a bad website.** An owner builds a brand-new multi-page site inside PostScore that:
- scores **100/100 on our own website checks**;
- is **hosted by PostScore**, with nothing to download or upload;
- **refreshes the rating, review count and hours automatically after every PostScore scan**, so it never goes stale like a downloaded file does.

"100/100" means the Website category's full 30 points. That breaks down as follows:

| Check | Points | How a PostStudio site earns it |
|---|---|---|
| Has a website | 4 | It's on the listing once the owner adds the URL to Google (we prompt; Premium can do it via connect) |
| HTTPS | 6 | SSL on every hostname (subdomain + custom domain) |
| Mobile speed | 5 | Static HTML at the edge, lazy images, resized images, no client JS framework; measured by PageSpeed after publish |
| Content depth | 5 | Title, meta, viewport, headings, enough real text (the guided checklist ensures the About/Services text exists) |
| Contact & conversion | 3 | Tap-to-call, "Call now" CTA on every page |
| About / our story | 1 | About page (required in the checklist) |
| Services / products | 1 | Services or Menu page (required) |
| Social links | 1 | Only verified profiles; the checklist asks for them (honest 0 if the owner has none) |
| Security | 2 | We control the code; no third-party scripts; Safe Browsing clean |
| Matches your Google listing | 1 | Name/phone/address/hours auto-filled from the listing and refreshed after every scan |
| Up-to-date notices | 0.5 | Notices have an end date and disappear automatically |
| Site freshness | 0.5 | Copyright year and "updated" date set on each refresh; no template leftovers (empty fields are hidden, never placeholder text) |

The two checks PostStudio can't control alone:
- **Social links:** an owner with no social profile honestly scores 0 here.
- **"Has a website" on Google:** the owner must add the URL to their listing.

The editor's meter says both plainly instead of pretending.

### Gaps in today's fix guides (for owners who keep their current site)
The guides cover the tasks `ssl / seo_meta / add_page / phone_link / social_links / speed / edit_text`. Coverage today:

| Builder | Has guides for | Missing |
|---|---|---|
| Wix | ssl, seo_meta, add_page, phone_link, social_links, speed | edit_text |
| Squarespace | ssl, seo_meta, phone_link, social_links, speed | add_page, edit_text |
| GoDaddy | seo_meta, add_page, phone_link, social_links | ssl, speed, edit_text |
| Shopify | ssl, seo_meta | add_page, phone_link, social_links, speed, edit_text |
| WordPress | seo_meta, social_links | ssl (host-dependent), add_page, phone_link, speed, edit_text |
| Square Online | social_links | everything else |
| Google Sites | add_page, social_links, edit_text, seo_meta | ssl (automatic; say so), phone_link, speed |
| Webflow | seo_meta | everything else |
| Duda | seo_meta | everything else |
| Weebly | none | all (detected as `weebly`, but no guides; today it falls back to the generic guide) |

Gaps across all builders:
- **Viewport.** `guideTaskFor` returns null when the viewport tag is missing, so there's no guide at all.
- **Site security.** `website.security` has no guide task, only the hacked-site banner.
- **Matches your Google listing.** It maps to the generic `edit_text`. It should say exactly which field differs (phone, address or hours) and link to that builder's "edit footer/contact" help.
- **Stale notices and old dates.** They map to `edit_text` too, so they need builder-specific "edit the banner/announcement bar" steps.

Each guide gets its official-docs link and a `GUIDES_VERIFIED_AT` refresh, the same way the current guides were written. I'd fill these in 5b as one step, reviewed through `~/Desktop/builder-guides-review.md` like before.

---

## 2. The guided path in (Website page)

**When it appears.** Today the starter generator shows for `builderOffer.reason`:
- `no_website`;
- `underperforming` (our template beats their measured score by 8+);
- `backup`, collapsed.

The scoring engine also already knows a **Facebook/social page as the website** (`website.has_website` → `socialPage`). The chooser shows for:
- no website;
- a social page only;
- a low website score (today's `underperforming` rule).

For a business with a good site, the same three options stay available in a collapsed "Other options" card, like the collapsed generator today.

**Three options, side by side** (stacked at 375px, same order):

| (a) Fix your current site | (b) Starter website | (c) Build a full site in PostStudio |
|---|---|---|
| Per-builder fix guides for the checks they fail, with Re-check after each fix | The one-page generator (themes, accents, photos, hours, map, download) | Multi-page, hosted, auto-refreshing |
| **Grow+**. Free sees which checks fail and the first step of every failing check's guide | **Included in Grow and Premium.** Free sees a live preview of their own site with their real data + "Unlock with Grow" | **Its own option or an add-on** ("PostStudio only" $30/mo = the free audit + PostStudio; +$15 Grow = $40; +$8 Premium = $58; included in Multi). Everyone sees a preview of their new site with their real data |
| Hidden when there's no website, or it's only a social page (nothing to fix) | **Prominent**: never below PostStudio, never collapsed when there's no website | — |

### No-website businesses: the page is never empty

When a business has **no website, or only a Facebook/social page**, the Website page leads with these, top to bottom. There are no site checks or fix guides above them, because there's nothing to check:

1. **An honest header:** "You don't have a website yet — it's one of the biggest gaps in your PostScore", with the **real points it's costing them**.
   - The number comes from their own breakdown: the Website category's max minus what they earn, on the 100-point scale. That's the same `wholeCategoryPoints` the Overview shows, so for Hudson Shears it's "0 / 30".
   - For a social page, it names the platform: "Your website is a Facebook page".
2. **The Starter website generator, right there**, as it is today, with the live preview built from their real data.
   - Grow / Premium: full use + download.
   - Free: the same live preview, editable but not downloadable, plus "Unlock with Grow".
3. **Directly under it, the PostStudio card:** "Want a full site we host for you?" It compares the two side by side:

   | | Starter website | PostStudio |
   |---|---|---|
   | Pages | One page | Home, About, Services/Menu, Contact |
   | Where it lives | You download it and host it yourself | Hosted for you at `name.postscore.site` or your own domain |
   | Rating & hours | Fixed when downloaded (re-download to update) | Update automatically after every scan |
   | Website checks | Strong on everything a file can prove | Built to pass all of them (100/100) |

   The button "Build it in PostStudio →" opens their **real-data PostStudio preview** (`/studio`).
   - Without PostStudio, the card shows every price: "$30/mo on its own · +$15 on Grow · +$8 on Premium · included in Multi".
   - The card has an "Add PostStudio" button that opens the **PostStudio box** (its own box, not Grow vs Premium): what PostStudio includes — three tiles: Website, Menu & catalog, Logo Studio — and the three ways side by side — "PostStudio only" $30/mo · "Grow + PostStudio" $40/mo · "Premium + PostStudio" $58/mo (Best value) — plus "Included in Multi", with the plan they're on highlighted (Free → PostStudio only). Footer: "Coming soon — nothing is charged today." Checkout isn't built, so nothing in it buys anything; once checkout exists, each option starts the real purchase.
4. **With the add-on (or Multi):** the card becomes "Continue in PostStudio →", with no upsell. If a site is already published, it shows the site's live address and status.

The page is never blank and never shows a fake site: every preview uses only their real listing data, and empty fields are hidden.

**Links in:**
- the Overview's top recommendation, when it's a website check, goes to `/website#options`;
- website tasks in the action plan go to `/website#options`, with the matching option highlighted (e.g. a missing About page → (a) if they have a site, otherwise (b)/(c)).

---

## 3. The maker

Flow, inside `/business/[id]/studio`:

1. **Pick a template.** The suggestion comes from the business type (§4); all templates are selectable.
2. **Auto-fill from real data:**
   - from the Google listing: name, category, address, phone, hours (`starter_site_hours` when the owner set them), rating and review count, Maps link, price level;
   - from the owner: tagline, verified social links, photos already uploaded.
   - The FAQ comes from `renderFaq` with their real name and city.
   - Nothing is invented. An empty field is hidden on the site and shows in the editor as a prompt ("Add 2–3 sentences about your story").
3. **Guided setup checklist**, a progress list beside the editor:
   - **Brand:** colors (the 18 themes + accent picker, AA-checked via `lib/color.ts`), fonts (the existing pairings), logo (later: Logo Studio).
   - **Photos:** storefront, interior, work/products. Resized client-side, like `resizeImageForEmbedding`, then uploaded to storage.
   - **About:** their story; required for the About check.
   - **Services / Menu:** item list with optional prices; required for the Services check. Later: Menu & catalog.
   - **Hours:** the existing hours editor, reused.
   - **Contact:** phone and address (from the listing), and the map (storefronts only).
4. **Editor:**
   - **Text:** inline fields per section.
   - **Photos:** replace or reorder.
   - **Colors and fonts:** the same tokens as the starter site.
   - **Sections:** reorder, hide, or add from a fixed set (hero, at a glance, about, services/menu, gallery, reviews, hours, location/map, FAQ, contact).
   - **Pages:** Home, About, Services (Menu for food types), Contact.
   - No free-form HTML at launch.
5. **Preview** desktop + phone: two iframes rendered from the same HTML the host will serve, like the starter site's identical preview/download test.
6. **Publish** to `name.postscore.site`; custom domain later (§5).

**Live "PostScore website check" meter.** It climbs toward 100 while editing:
- `analyzeWebsiteHtml()` is pure, so it runs in the browser on each page's rendered HTML, together with the website-trust checks (stale notices, template leftovers).
- Speed and HTTPS show as "checked after publishing" until the first live PageSpeed run, and then show the real number.
- Each missing point names its checklist item ("+1 — add your About story").

Reuse, don't rebuild: `lib/starterSite.ts` already has the palette, art (patterns, dividers, icons), open-now script, hours table, star row, schema and footer. The multi-page renderer should import those pieces rather than duplicate them. The single-page starter stays as it is.

---

## 4. Templates

There are 6 templates at launch, each with Home / About / Services-or-Menu / Contact. The business-type → template map uses the 44 types in `config/bizProfiles.ts` (`BUSINESS_TYPE_OPTIONS`):

| Template | Feel | Business types |
|---|---|---|
| **Chair** (appointments) | big photo hero, "Call to book", services with durations/prices | barbershop, spa, nail_salon, salon, tattoo_body_art, pet_services |
| **Table** (food & drink) | menu page, hours prominent, order/call | dessert_shop, cafe, bar, bakery, restaurant |
| **Shelf** (shops) | featured products, price level, "visit us" map | liquor_store, grocery_market, hardware_store, florist, retail_boutique, specialty_store |
| **Practice** (professional) | trust-first, credentials/about, consultation CTA | dentist, medical_clinic, lawyer, accountant, real_estate, consultant, coach, tutor_education, practitioner |
| **Crew** (trades & services, often service-area) | service list, service area (city only, no map unless storefront), "Get a quote" call | auto_repair, plumber, electrician, landscaper, repair_dropoff, cleaning_service, home_services, car_wash_detailing |
| **Gather** (places & community) | events/hours, gallery, directions | community_center, gym_fitness, recreation, events, childcare, lodging, nonprofit, place_of_worship, photographer, default |

All 44 are covered: 6 + 5 + 6 + 9 + 8 + 10. "photographer" and "default" sit in Gather, and the owner can switch template anytime.

**How we test each template scores 100, automatically:**
1. **Unit test, every run.** For every template × a representative type from each row × EN/ES, render all pages from a full fixture, then:
   - run `analyzeWebsiteHtml` + the website-trust analysis;
   - feed the result to `scoreBusiness` with `https_status: "https"` and a lab performance of 100 (like `TEMPLATE_HOSTING_HIGH`);
   - assert every website check earns its maximum except Social links, which also passes when the fixture has a verified profile.

   This is the same approach as today's `lib/starterSiteDesign.test.ts`.
2. **Sparse-data test.** The same render with the minimum real data (name + phone only) must contain no placeholder text, no empty sections and no broken links. The checklist then tells the owner exactly which points are missing.
3. **Contrast test.** Every template × theme × accent passes AA, like today's palette test.
4. **Live check after deploy.** One demo site per template on `demo-<template>.postscore.site` gets a real PageSpeed run, plus our full website analysis. This costs 6 PageSpeed calls per deploy, inside `PAGESPEED_DAILY_LIMIT`, and the results are saved. A template that drops below 100 blocks release.

---

## 5. Hosting

**Architecture (recommended).**
- The PostScore app stays on Netlify.
- Customer sites are rendered to static HTML when published (and re-rendered after every scan), stored as files, and served at the edge by hostname.
- No server rendering per visit, which means it's fast, cheap and safe.

**Assumptions for the cost table:**
- a site is about 60 KB of HTML/CSS per page, plus about 1.5 MB of optimized photos;
- a typical local business gets about 1,000–3,000 visits a month, so about 3 GB/site/month;
- custom domains for about 40% of sites.

| Monthly cost (estimate — verify) | 10 sites | 100 sites | 1,000 sites |
|---|---|---|---|
| **Netlify** (one multi-tenant site, domain aliases) | ~$19–20 (Pro, 1 member) | ~$20 + bandwidth overage beyond the included amount | Likely **$500+**: bandwidth past the included TB is billed steeply, and there's a per-site **domain-alias cap**, so 400 custom domains needs Enterprise. Not a fit at this size. |
| **Vercel** (Vercel for Platforms: wildcard + custom domains via API) | ~$20 (Pro, 1 seat) | ~$20 | ~$20 + overage (~2 TB × ~$0.15/GB ≈ $300) → **~$320**; custom-domain counts at this scale may need a higher tier |
| **Cloudflare** (Workers static assets or Pages + R2 + **Cloudflare for SaaS** custom hostnames) | ~$5 (Workers Paid) | ~$5 (first 100 custom hostnames free) | ~$5 + (400 − 100) × **$0.10/hostname** ≈ **$35**; **no bandwidth charges**; R2 storage ~1.5 GB ≈ $0.02 |

**Recommendation: Cloudflare for customer sites.**
- **Cost:** it's the only option whose cost stays flat with traffic.
- **Custom domains:** Cloudflare for SaaS was built for exactly this: thousands of customer domains, automatic SSL, hostnames added and removed over an API.
- **Code:** a ~100-line Worker maps `Host` → the site's files in R2 (or KV) and serves them with long cache headers. The app on Netlify calls the Cloudflare API to publish.
- **Risk:** a second provider to run. That's acceptable because the Worker is tiny and the sites are static.

**Subdomain first.**
- Buy `postscore.site`, or use a subdomain of the main domain. A separate domain is safer: customer content never shares cookies with the app.
- Wildcard DNS `*.postscore.site` → the Worker, so every site gets `name.postscore.site` with SSL immediately.
- Names come from the business name, unique, editable once.

**Custom domains (5b+ later step).**
- The owner types the domain, and we create the custom hostname through the Cloudflare API, which returns the records to add.
- PostScore shows exactly what to add and polls until it's verified and SSL is issued (usually minutes; DNS can take up to 24–48 h).
- Recommend `www` + redirect the apex:

| Registrar | Steps (shown in-app with their own screenshots/links) |
|---|---|
| **GoDaddy** | My Products → Domain → DNS → Manage DNS → Add → **CNAME** `www` → `sites.postscore.site`; add the **TXT** verification record we show; for the apex use GoDaddy **Forwarding** → `https://www.yourdomain.com` (permanent 301). |
| **Squarespace Domains** | Domains → your domain → DNS → **Add record**: CNAME `www` → `sites.postscore.site`, plus the TXT record; apex: Domain forwarding → `www`. |
| **Namecheap** | Domain List → Manage → **Advanced DNS** → Add New Record: CNAME `www` → `sites.postscore.site`, TXT record; apex: **URL Redirect Record** `@` → `https://www.yourdomain.com` (permanent). |
| **Cloudflare** (owner's own account) | DNS → Add record: CNAME `www` → `sites.postscore.site`, **proxy status DNS only** (grey cloud) — required for Cloudflare-for-SaaS hostnames on another account; TXT record; apex: a Redirect Rule → `www`. |

Each guide is written from the registrar's official help pages and dated, like the builder guides.

**If the owner cancels.** This follows the refund policy: no refunds except where the law requires, full access until the end of the paid period, then Free. Honest and fair:
1. **Until the paid period ends:** the site stays live and editable. Settings shows the end date.
2. **After it ends:**
   - the full site is **unpublished**;
   - `name.postscore.site` shows a free, honest **one-page "basic card"** (name, phone, address, hours, Google link, generated from their real data) for **90 days**, so customers aren't stranded;
   - a custom domain shows the same card for **30 days**, then we remove the hostname. The owner points DNS elsewhere, and we say so in-app beforehand.
3. **The owner keeps their work:**
   - "Download my site" (all pages as a static HTML zip, rating shown with its "as of" date) is available **anytime, including after cancelling**, because the content is theirs;
   - drafts are kept **12 months** so resubscribing restores everything.
4. **Nothing is held hostage.**
   - **Emails:** none are sent today; notices are in-app until email sending exists.

---

## 6. Data model (SQL — not run)

To be saved as `supabase/poststudio.sql` and run by you in the Supabase SQL editor when we get there. RLS follows `schema.sql`: owner-only through `businesses.owner_id`.

```sql
-- PostStudio: hosted multi-page websites. Safe to run twice.

create table if not exists public.studio_sites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  template_id text not null,                       -- chair | table | shelf | practice | crew | gather
  subdomain text not null,                         -- name → name.postscore.site
  status text not null default 'draft' check (status in ('draft', 'published', 'paused', 'basic_card')),
  theme jsonb not null default '{}'::jsonb,        -- themeId, customAccent, fontId, accentStyle
  settings jsonb not null default '{}'::jsonb,     -- show rating, sections hidden, social links, notices
  published_version int,
  published_at timestamptz,
  data_refreshed_at timestamptz,                   -- last auto-refresh after a scan
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists studio_sites_business_unique on public.studio_sites (business_id);
create unique index if not exists studio_sites_subdomain_unique on public.studio_sites (lower(subdomain));

create table if not exists public.studio_pages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.studio_sites (id) on delete cascade,
  slug text not null,                              -- '' (home), about, services, menu, contact
  title text not null,
  position smallint not null default 0,
  sections jsonb not null default '[]'::jsonb,     -- [{type, hidden, fields}] — owner text only, never placeholder
  updated_at timestamptz not null default now()
);
create unique index if not exists studio_pages_site_slug_unique on public.studio_pages (site_id, slug);

create table if not exists public.studio_assets (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.studio_sites (id) on delete cascade,
  storage_path text not null,                      -- Supabase Storage (drafts); copied to R2 on publish
  kind text not null check (kind in ('photo', 'logo')),
  width int, height int, bytes int,
  alt text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.studio_domains (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.studio_sites (id) on delete cascade,
  hostname text not null,
  status text not null default 'pending' check (status in ('pending', 'verifying', 'active', 'failed', 'removed')),
  provider_hostname_id text,                       -- Cloudflare custom hostname id
  verification jsonb,                              -- the TXT/CNAME records to show the owner
  ssl_status text,
  verified_at timestamptz,
  remove_after timestamptz,                        -- set when a cancelled plan's grace ends
  created_at timestamptz not null default now()
);
create unique index if not exists studio_domains_hostname_unique on public.studio_domains (lower(hostname));

create table if not exists public.studio_publishes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.studio_sites (id) on delete cascade,
  version int not null,
  reason text not null check (reason in ('publish', 'scan_refresh', 'pause', 'basic_card')),
  check_score numeric(4, 1),                       -- our website checks on the published HTML (of 30)
  pagespeed_score smallint,                        -- live mobile score after publish, when measured
  bytes int,
  created_at timestamptz not null default now()
);
create unique index if not exists studio_publishes_site_version_unique on public.studio_publishes (site_id, version);

alter table public.studio_sites enable row level security;
alter table public.studio_pages enable row level security;
alter table public.studio_assets enable row level security;
alter table public.studio_domains enable row level security;
alter table public.studio_publishes enable row level security;

drop policy if exists "Owners manage their studio sites" on public.studio_sites;
create policy "Owners manage their studio sites" on public.studio_sites for all
  using (exists (select 1 from public.businesses b where b.id = studio_sites.business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = studio_sites.business_id and b.owner_id = auth.uid()));

drop policy if exists "Owners manage their studio pages" on public.studio_pages;
create policy "Owners manage their studio pages" on public.studio_pages for all
  using (exists (select 1 from public.studio_sites s join public.businesses b on b.id = s.business_id where s.id = studio_pages.site_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.studio_sites s join public.businesses b on b.id = s.business_id where s.id = studio_pages.site_id and b.owner_id = auth.uid()));

drop policy if exists "Owners manage their studio assets" on public.studio_assets;
create policy "Owners manage their studio assets" on public.studio_assets for all
  using (exists (select 1 from public.studio_sites s join public.businesses b on b.id = s.business_id where s.id = studio_assets.site_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.studio_sites s join public.businesses b on b.id = s.business_id where s.id = studio_assets.site_id and b.owner_id = auth.uid()));

-- Domains and publishes are written by the server (service role) after
-- plan and DNS checks; owners can read them.
drop policy if exists "Owners read their studio domains" on public.studio_domains;
create policy "Owners read their studio domains" on public.studio_domains for select
  using (exists (select 1 from public.studio_sites s join public.businesses b on b.id = s.business_id where s.id = studio_domains.site_id and b.owner_id = auth.uid()));

drop policy if exists "Owners read their studio publishes" on public.studio_publishes;
create policy "Owners read their studio publishes" on public.studio_publishes for select
  using (exists (select 1 from public.studio_sites s join public.businesses b on b.id = s.business_id where s.id = studio_publishes.site_id and b.owner_id = auth.uid()));
```

Billing for the add-on lives with the subscription work (checkout isn't built): one `addons` field on the subscription row (e.g. `poststudio: true`). The code is already shaped for it: `getAddons()` next to `getPlan()` in `lib/premium.ts` (returns `[]` until checkout ships) and `hasPostStudio(plan, addons)` in `lib/postStudio.ts`. **"PostStudio only" ($30/mo) = plan `"free"` + addon `"poststudio"`** — the free audit plus PostStudio; Grow and Premium tools stay locked.

---

## 7. Plan gating

Everything goes through `getPlan()` (plus `hasPostStudio()` for the add-on), matching `docs/product-structure.md`:
- **Free** = audit only.
- **Grow** = how to fix it.
- **Premium** = Grow + full designers + Google Profile connect.
- **Multi** = Premium for multiple locations, PostStudio included.
- **PostStudio:** everyone can open it and see their real-data preview; **publishing** needs PostStudio — on its own ("PostStudio only", $30/mo, plan Free + the add-on), added to Grow (+$15) or Premium (+$8), or Multi.

### Open to everyone today that must change (plan only — not changed)

| Page | Feature | Today | Planned |
|---|---|---|---|
| Overview | Action plan section (`ActionPlanSection`) | usable on Free | Free: real-data preview of the first task + "unlock with Grow" |
| Overview | PostAI (`AssistantLauncher`) | usable on Free (paid AI calls) | Free: preview with one real example answer about their score (pre-generated per scan, or a canned walk-through of their real top issue) |
| Overview / Website | Re-check my website | usable on Free (PageSpeed calls) | Grow+ |
| Overview | Full re-scan | usable on Free (rate-limited) | **Decided:** Free keeps the first scan at signup + **1 full re-scan per month** |
| Growth | Weekly plan, routine, bigger projects, celebrations | usable on Free | Free: preview |
| Growth → Campaigns | Coupon + referral builders (tally, share) | usable on Free; printing already gated (`signAccess`) | Free: preview only (no saving/sharing); Grow basic; Premium full |
| Reviews | Review link + QR PNG | usable on Free | **Decided: stays free for everyone, exactly as today.** Upgrading only unlocks better designs |
| Reviews | Sign Studio | Free preview, Grow basic, Premium full (already gated) | unchanged |
| Website | Fix guides (`WebsiteFixGuide`) | usable on Free | Free: which checks fail + the first step of every failing check's guide |
| Website | Starter website builder + download | usable on Free | Free: live preview, download locked |
| Website | FAQ draft | usable on Free | Grow+ (preview on Free) |
| Competitors | List + rank | usable on Free | **keep the rank and list on Free** (it's part of the audit); deeper comparisons → preview |
| Price check | AI price check | usable on Free (paid AI calls) | Free: preview |
| Reports | Weekly recap, weekly PDF, past reports | usable on Free | Free: preview (last week's real recap, blurred numbers below the fold) |
| Reports / Settings | Monthly email report setting | usable on Free | **Decided: stays on Free, as today**; still respects `MONTHLY_REPORTS_LIVE` |
| — | "Since your last visit" pop-up | everyone | keep (it's audit: score and rank changes), with next steps as previews |
| Settings | Plan feature list (`dashboard.settings.plan.feature.*`) | says Free includes the action plan and coupons | rewrite to match the new tiers |
| Google Profile | Connect, search demand | already preview + Premium (`canConnectGbp`) | unchanged; moves to the new tab and Settings → Connections |

**Preview rules** (one shared component, e.g. `components/plan/LockedPreview.tsx`):
- the real feature rendered with the business's own data, read-only;
- one line: "Here's how PostScore fixes this — unlock with Grow";
- a "See plans" button to Settings → Plan;
- nothing invented: if the real data isn't there yet, the preview says so.

### Decisions (Day 5)
1. **Free = a digital audit only, with real-data previews** for everything else ("Here's how PostScore fixes this — unlock with Grow").
2. **Free keeps re-scans:** the first scan at signup plus **1 full re-scan per month**.
3. **Review link + QR code: free for everyone, exactly as they work today.** Upgrading only unlocks better designs: the sign designer is Grow basic and Premium full (already built through `signAccess`).
4. **Competitor rank and list stay free** (part of the audit).
5. **The first step of every failing check's guide is shown on Free**; the full guides need Grow.
6. **Monthly email reports stay available on Free**, as today, and still respect `MONTHLY_REPORTS_LIVE`.
7. **PostStudio** (coming soon; never sold before checkout exists):
   - **PostStudio only — $30/mo:** the free audit (everything in Free) + PostStudio (multi-page site, hosting, custom domain, auto-updates after every scan). Grow/Premium tools stay locked. In code: plan `"free"` + addon `"poststudio"`;
   - +$15/mo on Grow ($40 total);
   - +$8/mo on Premium ($58 total), shown as "PostStudio at a discount" on the Premium card — the best value;
   - included in Multi.
8. **Multi:** up to **5 locations**, +$25/mo per extra location.
9. **Ownership verification**, new, at the moment of a sensitive action only. See below and step 5k-0.

### Ownership verification

PostScore doesn't verify ownership today: anyone can add any business and scan it. That stays, because the scan and audit use only public data.

**No verification for:** signup, adding a business, scanning, the audit, previews, the starter-site preview, and downloading files for the owner's own use.

**Verification is asked for at the moment someone tries:**
- publishing a PostStudio site under the business's name (including the subdomain going live);
- connecting a custom domain;
- connecting Google Business Profile, editing the listing, or viewing private Google insights;
- anything else that acts or speaks as the business publicly (later: replying to reviews, sending campaigns).

**Methods:**
1. **A one-time code to the phone number on the Google listing**, by text, or by automated call for landlines. The number comes from our saved listing data, never typed in by the user, so it proves control of the business's own line.
2. **Google Business Profile connect**, once it's live: a successful OAuth connect for that listing proves it automatically.
3. **If the listing has no phone**, we say so honestly: "Your Google listing has no phone number, so we can't send a code." The two options are:
   - add a phone to the listing, re-scan, and verify;
   - connect Google (when available).

   Nothing is unlocked by any other route.

**Status:**
- Saved per **user + business**, so multiple managers can each verify the same business.
- Shown as a small **"Verified owner"** badge next to the business name in the sidebar card and Settings → Businesses.
- If the listing's phone number later changes, existing verifications stay, but new ones go to the new number.
- Codes expire in 10 minutes, 5 attempts per code, 3 sends per hour per business.

---

---

## 8. Risks, monthly costs, and what we will NOT do at launch

**Risks**
- **Score claims:** "100/100" depends on the owner adding the URL to Google and having a social profile. The meter says so plainly; marketing says "built to pass every website check".
- **A second hosting provider (Cloudflare).** Mitigation: a tiny Worker, static files, and one publish function. Netlify stays the app host.
- **Custom domain support load:** DNS confusion is the #1 support issue for site builders. Mitigation: registrar-specific steps, auto-polling with plain status messages, and the subdomain always working.
- **Abuse:** phishing or impersonation pages on `*.postscore.site`. Mitigation:
  - publishing requires **ownership verification for that business** (step 5k-0: a code to the listing's phone, or Google connect), even though signup and scanning don't;
  - there's no free-form HTML or scripts, and content is tied to a real Google listing;
  - takedowns go through `paused`;
  - a separate domain from the app.
- **Verification gaps:** a listing with no phone can't verify by code until it adds one or Google connect is live; a shared or old number could be answered by someone else. Mitigation: the code goes only to the number on the Google listing, managers are logged per user, and the owner can remove a manager's verification.
- **Plan changes for existing users:** turning Free into audit-only removes things people use today. Mitigation: an in-app notice before the change, and anything already printed or downloaded stays theirs.
- **Image storage growth:** 1.5 MB × 1,000 sites is trivial, but cap uploads (e.g. 30 photos per site, resized client-side).

**Monthly costs (estimates)**

| Item | 10 sites | 100 | 1,000 |
|---|---|---|---|
| Cloudflare Workers Paid + for SaaS | $5 | $5 | ~$35 |
| R2 storage | ~$0 | ~$0 | ~$0.05 |
| `postscore.site` domain | ~$2 (yearly ÷ 12) | same | same |
| PageSpeed (after each publish + template checks) | free API, inside `PAGESPEED_DAILY_LIMIT` | same | watch the daily limit; refresh-only republishes don't need PageSpeed |
| Supabase storage (drafts) | inside current plan | inside | ~$0–5 |
| Ownership verification (Twilio Verify, ~$0.05–0.06 per successful check, one-time per user + business) | ~$0.60 once | ~$6 once | ~$60 once |
| **Total (monthly)** | **~$7** | **~$7** | **~$40–45** |

Revenue at $15/site: 10 sites $150 · 100 sites $1,500 · 1,000 sites $15,000 (more for "PostStudio only" sites at $30/mo).

**Not at launch:**
- free-form HTML/code blocks or arbitrary third-party scripts/widgets (only the allowlisted booking/ordering embeds in §10);
- taking bookings, orders or payments ourselves — the owner's provider does that (§10 connects their link or button);
- blogs, multi-language sites in one site (EN *or* ES per site at launch), or e-commerce carts;
- buying domains for owners (they keep their registrar);
- email hosting;
- quoting review text on the site (rating + link only, never review markup in schema).

---

## 9. Build order (5b onward)

Each step is small enough to verify in one sitting. "Check" is exactly what you look at afterwards. Every step ships with tests, EN + ES, 375px, no hydration errors, one dev server on 3000, and no commit until you say.

**5b — Sidebar: 3 new tabs + rename.**
- Build: Overview · Growth · **Campaigns** · Reviews · Website · Competitors · **Price check** · **Google Profile** · **PostStudio** · Reports.
- Campaigns, Google Profile and PostStudio are routes with a real-data preview + "Coming soon" (or the plan needed).
- Check: the order on desktop and phone; each new tab opens; "Price check" label in EN/ES; Settings is still in the account menu; the active tab highlights correctly.

**5c — Move the coupon + referral designers to Campaigns.**
- Build: the same components on `/campaigns`. Growth's "run an offer" actions link there. Active offers and tallies show on Campaigns.
- Check: an existing coupon/referral still shows with its tally; printing gates are unchanged (Free preview / Grow basic / Premium full); no designer left on Growth.

**5d — Google Profile tab.**
- Build: connect status; search demand moved from `/search-demand` (old URL redirects); insights funnel preview; Settings gains **Connections** (today's `/connect-gbp` cards).
- Check: the old links still land correctly, and nothing claims a connection that doesn't exist.

**5e — Fix-guide gaps.**
- Build: the missing builder guides from §1 (viewport, security, info consistency, notices, Weebly…), from official docs. Review file on the Desktop.
- Check: the review doc; one guide per builder on a real business (Modern Liquors / a Wix site).

**5f — "Free = audit only", page by page.**
- Build: the shared `LockedPreview` component, then one page per sitting in this order:
  1. Overview (action plan, PostAI, Re-check);
  2. Growth;
  3. Campaigns;
  4. Reviews (link + QR stay free as today; only the sign designer tiers apply);
  5. Website (fix guides, Re-check, starter download, FAQ);
  6. Price check;
  7. Reports (monthly email setting stays on Free);
  8. Settings' plan list;
  9. re-scan limit on Free (first scan + 1 a month).
- Check, per page with the dev plan switch (`/api/dev/plan?plan=free|grow|premium`):
  - Free shows real data + one unlock line and can't trigger any paid call (PostAI, PageSpeed, AI price check);
  - Grow and Premium are unchanged.

**5g — Website page: no-website layout + the 3-option chooser.**
- Build: the no-website layout from §2 (honest header with real points lost, the starter generator, the PostStudio card); options (a) / (b) / (c) for businesses with a site; the visibility rules; links from the Overview's top recommendation and website tasks (`#options`).
- Check:
  - Hudson Shears (no website): the header with its real "0 / 30", the generator with its real data, and the PostStudio card with the plan's price, in that order;
  - Free: preview only + "Unlock with Grow"; Grow: download works;
  - a social-page-only business: the same layout, naming the platform;
  - Modern Liquors (has a site): checks + guides first, with the three options collapsed below;
  - with the dev plan set to Multi, the card says "Continue in PostStudio →".

**5h — PostStudio: templates.**
- Build: the 6 templates as a multi-page renderer reusing `lib/starterSite.ts`'s palette, art and hours pieces; the type → template map; the score-100 unit tests (§4).
- Check: the rendered pages for 3 real businesses saved to the Desktop (desktop + phone screenshots), and the test output showing each template at 30/30 with the assumptions stated.

**5i — PostStudio: editor + preview.**
- Build: the template picker, auto-fill from the listing, the section/page editor, the desktop + phone preview, drafts saved (`studio_sites`, `studio_pages`, `studio_assets` — you run the SQL first).
- Check: open it on Hudson Shears, edit About, reload and see it saved; the preview equals the rendered HTML; no invented text anywhere.

**5j — PostStudio: guided checklist + live check meter.**
- Build: the checklist (brand, photos, about, services/menu, hours, contact) and the meter from `analyzeWebsiteHtml` in the browser.
- Check: start from the minimum data and watch the meter climb as each item is filled; speed and HTTPS say "checked after publishing".

**5k-0 — Ownership verification.**
- Build:
  - the `business_verifications` table, SQL below for you to run;
  - a `requireVerifiedOwner(businessId)` server guard, used by publish and custom-domain actions now, and by Google connect / listing edits later;
  - a verification sheet with SMS and call, through Twilio Verify. New env vars `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID` go in `.env.example`; with no keys, the sheet says verification isn't available yet and unlocks nothing.
  - the "Verified owner" badge.
- **Cost:** Twilio Verify is ~$0.05 per successful verification plus the channel fee (US SMS ≈ $0.008; a voice call ≈ $0.01–0.02 per minute). Call it **≈ $0.06 per verification**, paid once per user + business. 1,000 verified owners ≈ $60 total. Failed or unanswered attempts cost only the channel fee. (Check Twilio's current pricing.)
- **Screens the owner sees:**
  1. They click **Publish** (or Connect domain / Connect Google), which opens a sheet: "Verify you own Hudson Shears — this keeps anyone else from publishing as your business. We'll send a 6-digit code to the phone number on your Google listing: (914) •••-3737." Buttons: **Text me a code** · **Call me with a code** · Cancel.
  2. Code entry: 6 boxes, "Code sent to (914) •••-3737 · expires in 10 minutes", **Verify**, "Resend code" (after 30 s), and "Didn't get it? Call me instead".
  3. Success: "You're verified as the owner of Hudson Shears", and then the original action continues (the publish goes ahead).
  4. Errors: "That code isn't right — 4 tries left"; "Too many tries — request a new code in an hour"; "Code expired — send a new one".
  5. No phone on the listing: "Your Google listing has no phone number, so we can't send a code. Add one to your Google Business Profile, then re-scan — or connect Google (coming soon)." There's no other bypass.
- **Test plan** (unit tests, with fake Twilio and a fake db):
  - the code goes only to the listing phone (a number in the request is ignored);
  - a wrong code decrements the tries left; after 5, it's blocked;
  - an expired code is rejected; the send rate limit holds (3 an hour);
  - success saves (user, business) and a second manager can verify separately;
  - the guard blocks publish when unverified and allows it when verified;
  - no keys → "not available", nothing unlocked;
  - no phone → the honest message;
  - the badge shows only for the verified user;
  - EN + ES; 375px.
- **Check:** with test Twilio credentials, verify Hudson Shears from your phone, see the badge, then try publishing from a second account that isn't verified and see the sheet.

```sql
-- Ownership verification (one row per user + business). Safe to run twice.
create table if not exists public.business_verifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  method text not null check (method in ('sms', 'call', 'google')),
  phone_last4 text,                  -- of the listing phone the code went to
  verified_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists business_verifications_user_business_unique
  on public.business_verifications (user_id, business_id);
alter table public.business_verifications enable row level security;
drop policy if exists "Users read their own verifications" on public.business_verifications;
create policy "Users read their own verifications" on public.business_verifications for select
  using (user_id = auth.uid());
-- Inserts only by the server (service role) after Twilio confirms the code.
```

**5k — Hosting on the subdomain.**
- Build: the Cloudflare Worker + R2, a publish action, `name.postscore.site`, and `studio_publishes`; the first PageSpeed run after publish.
- Publishing goes through the 5k-0 verification guard.
- Check: publish Hudson Shears to its subdomain (after verifying) and open it on your phone; HTTPS works; our website check on the live URL (Re-check) gives the expected score.

**5l — Custom domains.**
- Build: requires a verified owner (5k-0); Cloudflare for SaaS hostnames, `studio_domains`, status polling, the four registrar guides.
- Check: connect a test domain you own and watch the status go pending → active with SSL; the registrar steps match what you see.

**5l+ — Booking and online ordering connections (Phase 1, at PostStudio launch).**
- Build: §10 Phase 1 — the setup question, the provider recommendations by business type, the step-by-step provider guides (official help-doc links + "last verified" date), the link/embed validation (allowlisted provider domains only), the "Book now" / "Order online" button on every page + the Book/Order page, and counting it toward "Contact & conversion" once a re-scan confirms it.
- Check: paste a real Square Appointments link and a Calendly embed — both validate and show the button + page; a link from a non-provider domain, a dead link and an embed with an extra `<script>` are all refused with a plain reason; the re-scan of the published site credits the check.
- Phase 2 (Square API) is a later step, after a cost + terms review.

**5m — Auto-refresh after scans.**
- Build: after every scan, republish with the new rating, review count, hours and copyright year (`reason: 'scan_refresh'`), with no PageSpeed call.
- Check: re-scan Modern Liquors and see the live site show the new review count and `data_refreshed_at` update.

**5n — Plan gating for PostStudio.**
- Build: `hasPostStudio()`; preview for everyone, publish for the add-on or Multi; the cancel flow from §5 (paused → basic card → export).
- Check: with the dev plan switch, Free and Grow-without-add-on can preview but not publish; Multi can; a simulated cancel goes to the basic card and "Download my site" still works.

---

## 10. Booking + online ordering connections (plan only — not built)

PostScore never takes bookings, orders or payments itself — the owner's own provider does. PostStudio connects that provider so every page has a clear "Book now" or "Order online" button. Said plainly in the app: "Bookings and payments go through {provider}, not PostScore."

### Phase 1 — at PostStudio launch
1. **Setup question:** "Do you take bookings or sell online?" (Bookings · Online orders · Both · Not now). We then recommend tools by business type (from the business profile):
   - salons, spas, barbers: Square Appointments, Vagaro, Booksy, Fresha, GlossGenius;
   - services and lessons: Calendly, Acuity;
   - fitness: Mindbody;
   - restaurants: Toast, Square Online, Clover;
   - retail: Square Online, Shopify.
   An owner who already uses another tool picks "I use something else" and pastes a plain link (links work for any provider; embeds only for allowlisted ones).
2. **Step-by-step guides** for each recommended provider, written from that provider's official help docs, with links to those docs and a "last verified {date}" line: create an account, set up services/menu/products, and find the booking/ordering link or the button/embed code. Re-verified on a schedule; a guide past its date says so instead of guessing.
3. **The owner pastes the link or embed code; PostScore validates it:**
   - a real `https://` URL on that provider's own domain (a per-provider allowlist of domains);
   - it loads (server-side fetch, status 200, not a parked/expired page);
   - embed code only from the allowlisted provider snippets, parsed — not stored as raw HTML — and re-rendered from our own template; any other script, inline handler, iframe from another domain, or tracking pixel is refused. **Never arbitrary scripts.**
   - Then PostStudio adds a **"Book now" / "Order online" button on every page** (header + Contact) and a **Book/Order page** (the provider's allowlisted embed, or a big button to their page when there's no embed).
4. **Scoring:** it counts toward the website "Contact & conversion" check only once a re-scan of the published site confirms the button/link is there and works — never credited just because it was saved.
5. **Honest copy:** PostScore doesn't take payments or bookings; the provider does, under the provider's own terms and fees.

### Phase 2 — after launch
- An **official Square API connection (OAuth)** to show real services, prices and products on the site and keep them synced after changes.
- Other providers only if they offer official, documented APIs — no scraping.
- Before building: a cost review (API limits, any partner fees, our hosting/sync cost) and a terms review (each provider's developer terms, data use, display rules).

Build order: step **5l+**, right after "Custom domains" (§9).

