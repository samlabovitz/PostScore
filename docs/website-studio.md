# Website Studio (hosted sites) — notes for the Day 5 plan

## Ratings stay current on hosted sites

The downloadable starter site (Website page → "Download site (HTML)") is a
static file: it can't update itself. So its Reviews block shows no number by
default — just "See what customers say on Google" and a link — and "Show my
rating" prints the rating with the month it was read ("4.7★ from 10 Google
reviews · as of Oct 2026"), with a note to re-download after it changes.

Hosted Studio sites should instead **refresh the rating and review count
automatically after every PostScore scan**, so they can show the number
without an "as of" date going stale.

Either way, no `aggregateRating` / review markup in the site's schema.org
JSON-LD: Google doesn't allow self-serving review markup on a business's own
site. LocalBusiness keeps name, address, phone, hours (and `url` once the site
has a real hosted address — the downloaded file doesn't know where it will
live, so it leaves `url` out).
