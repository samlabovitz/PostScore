# Business details flow (plan, not built)

Agreed Nov 19, 2026 (Day 23 2d-5b). Owner-confirmed details (name, address, phone, hours: `businesses.owner_details`, `lib/ownerDetails.ts`) are what PostScore shows. Google's values are read live and never saved. **The score never changes from owner details**: scoring reads only Google's listing and the website.

Today: Settings → "Your business details" is the only place to confirm them. The dashboard has no confirm prompt.

## 1. Signup funnel (Days 38–47)

- **Where:** a "Confirm your business details" box next to the average-visit step.
- **Pre-filled** from the live listing. Where the website shows something different (hours, phone, address: `websiteTrust.infoConflicts`), the website's version is offered next to Google's.
- **"Yes, that's right":** saved as confirmed (provided by you).
- **"Something's wrong":** edited right there, with the same hours, phone and address editors and the same layout as the Google Profile listing page (`components/hours/WeekHoursEditor.tsx`, `components/gbp/ProfileEditsOnGoogle.tsx`). Saved as confirmed.
- **Corrected details that differ from Google:** the dashboard opens with "Fix your {field} on Google" as the first task (see §2).
- **Open decision:** a free "first fix on us" Google edit in the funnel for connected owners.

## 2. Dashboard (Day 23B)

- **No confirm card.**
- **When confirmed details differ from Google or the website:** a task with a link straight to the fix.
  - **Google differs:** Google Profile tab with that row's editor or compare panel open (`#edit-hours`, `#edit-phone`, `#edit-address`), offering "Keep Google's version" / "Keep website's version".
  - **Website differs:** the Website page's fix steps.
- **Premium + connected:** PostScore makes the Google change, through the existing safety flow: preview → approve → undo, respecting `GOOGLE_WRITES_LIVE_PLACES`.
- **Grow, or not connected:**
  - how-to steps;
  - "Open on Google ↗";
  - "Connect Google so PostScore can do this for you".
- **After the change is confirmed live**, by a Google read-back or a website re-check, the editor asks once: "Your {field} now match. Save these as your confirmed details?"
  - If Google holds the edit for review: "Waiting for Google", and ask only once it's live.

## Rules that stay

- **Never saved:** Places data (CLAUDE.md). Owner details are the owner's own.
- **Strings:** EN + ES (formal "usted").
- **Wording:** honest. A detail is "confirmed" only when the owner confirmed it.
- **Score:** no score change from owner details. Differences only create tasks.

## Later

- **After a website re-check too:** ask "Your {field} now match. Save these as your confirmed details?" once, when a re-check shows the website now matches Google and the confirmed details differ. Today the question comes only after a PostScore change is read back live on Google (lib/detailsMismatch.ts `nowMatchPrompt`); a website-side match shows the merged task's "Update your confirmed {field}" instead.
