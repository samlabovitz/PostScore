# Sidebar + shell chrome — English key list (translation reference)

Every **new** key added to `lib/i18n/messages.ts`'s `en` dictionary for
`components/layout/Sidebar.tsx` and `components/layout/DashboardShell.tsx`
(both client components, already inside `LocaleProvider` — wired via
`useLocale()`/`t()`, `DashboardShell` itself via its own already-computed
`locale` variable since it's the component that *provides* the context).
One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything
here**. Values are copied verbatim from `lib/i18n/messages.ts`.

`es` is intentionally absent for every key in this file — they fall
back to English via `t()` until reviewed Spanish is supplied.

---

## `dashboard.nav.*` — nav items + profile dropdown (`Sidebar.tsx`)

```
dashboard.nav.overview = "Overview"
dashboard.nav.growth = "Growth"
dashboard.nav.reviews = "Reviews"
dashboard.nav.website = "Website"
dashboard.nav.competitors = "Competitors"
dashboard.nav.pricing = "Pricing"
dashboard.nav.reports = "Reports"
dashboard.nav.account = "Account"
dashboard.nav.logOut = "Log out"
```

## `dashboard.shell.*` — menu toggle + business-picker states

```
dashboard.shell.openMenuAriaLabel = "Open menu"
dashboard.shell.closeMenuAriaLabel = "Close menu"
dashboard.shell.noBusinessSelected = "No business selected"
dashboard.shell.addBusinessToGetStarted = "+ Add a business to get started"
```
`openMenuAriaLabel` lives in `DashboardShell.tsx` (the mobile top-bar
hamburger button); the other three are in `Sidebar.tsx` (the mobile
close button, and the "no business" empty state shown when no
business is scoped to the page).

---

## Reused existing keys (not duplicated)

Both were already extracted (with reviewed `es` values already in
place) — the sidebar's own `business.name`/`business.address` fallback
text is identical wording, so it now resolves through the same keys
instead of its own hardcoded copy:

```
dashboard.overview.untitledBusiness = "Untitled business"   (Sidebar.tsx: business.name ?? …)
dashboard.overview.noAddressOnFile = "No address on file"   (Sidebar.tsx: business.address ?? …)
```

## Intentionally NOT extracted

- **"PostScore" brand wordmark** (`Sidebar.tsx` and `DashboardShell.tsx`,
  each rendered as two separately-colored `<span>Post</span><span>Score</span>`
  for the brass-colored "Score" suffix) — the product's own name, never
  translated in any locale, same convention as "PostAI" elsewhere.
- **The dev-only `locale: {locale}` debug badge** (`DashboardShell.tsx`,
  gated behind `process.env.NODE_ENV !== "production"`) — never rendered
  in production, not real user-facing chrome.
- **The "—" em dash placeholder** under "Account" in the profile
  dropdown (`Sidebar.tsx`) — a punctuation placeholder, not a word.
