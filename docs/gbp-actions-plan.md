# Premium "we do the work" with Google — plan (Day 22)

Premium and Multi only. Free and Grow see Premium previews (a locked
"Update on Google" with the Premium chip). **Nothing changes on Google
without an explicit owner click on "Approve and update Google".** Every
write is for the owner's own connected location only, never a competitor
or any other business.

Research was read-only (Google's public reference docs, fetched
2026-10-28). No Google write was made while writing this plan or building
Step 1, and the tests never call Google: every Google response is mocked.

## 1. The official APIs we'd use

All of them work with the scope we already ask for at connect,
`https://www.googleapis.com/auth/business.manage` (`GBP_OAUTH_SCOPE` in
`lib/googleBusinessProfile.ts`). Owners who are already connected won't
need to connect again.

### Customer details (attributes): Step 1, built

| Step | Method | Call |
| --- | --- | --- |
| What Google offers this listing | `attributes.list` | `GET https://mybusinessbusinessinformation.googleapis.com/v1/attributes?parent=locations/{id}&languageCode={en\|es}` |
| What the owner has set now | `locations.getAttributes` | `GET …/v1/locations/{id}/attributes` |
| Change them | `locations.updateAttributes` | `PATCH …/v1/locations/{id}/attributes?attributeMask=attributes/a,attributes/b` with body `{ name, attributes: [...] }` |
| What's live on Maps | `locations.attributes.getGoogleUpdated` | `GET …/v1/locations/{id}/attributes:getGoogleUpdated` |
| Whether an edit is pending | `locations.get` with `readMask=metadata` | `metadata.hasPendingEdits` |

**`attributes.list`**
- With `parent` set, Google returns only the attributes available for this location's category and country.
- `languageCode` localizes `displayName` and `groupDisplayName`.
- Each attribute has a `valueType`, `valueMetadata` and `deprecated` flag. Updates to a deprecated attribute "are silently not saved", so we never offer one.
- Docs: https://developers.google.com/my-business/reference/businessinformation/rest/v1/attributes/list

**`locations.updateAttributes`**
- `attributeMask` is required. Only the attributes named in the mask change.
- An attribute that is in the mask but missing from the body is deleted (set back to "not set").
- The whole change is one request, so Google applies all of it or none of it.
- Docs: https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations/updateAttributes

**Attributes guide**
- Only set attributes that `attributes.list` returns for the listing.
- The list is dynamic and should be fetched again often.
- Docs: https://developers.google.com/my-business/content/attributes

### Review replies: Step 2, not built
- **Post or change a reply:** `accounts.locations.reviews.updateReply`, `PUT https://mybusiness.googleapis.com/v4/accounts/{a}/locations/{l}/reviews/{r}/reply` with `{ "comment": "…" }`. It creates the reply if there isn't one, and works only for verified locations.
  - Docs: https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply
- **Remove a reply:** `accounts.locations.reviews.deleteReply`, `DELETE` on the same URL.
  - Docs: https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/deleteReply
- **Limits and moderation:** a `ReviewReply.comment` is at most **4096 bytes**. `reviewReplyState` is `PENDING`, `REJECTED` or `APPROVED`, and when it's `REJECTED`, `policyViolation` says why.
  - Docs: https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews
- **Undo, with nothing stored:** this is the one place where undo can't simply "store the previous value", because we never store review or reply text. Undo for a reply on a review that had none is `deleteReply`. For an edited reply, we read the old text at approval time and keep it only in the browser's open panel for that session; it's never written to our database. After that, there's no undo for an edited reply, and the approval screen says so.

### Hours, phone, website, description: later
- These all go through `locations.patch` (`PATCH …/v1/locations/{id}?updateMask=regularHours,phoneNumbers,websiteUri,profile.description`), and `locations.getGoogleUpdated` shows what's live.
- Same flow as Step 1: preview, approve, one request, log, undo.
- Docs: https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations

### Quotas and policy (https://developers.google.com/my-business/content/limits)
- **Business Information API:** 300 requests per minute per project by default, and **10,000 "Update Location" requests per day**.
- **Edits:** "**10 per minute per Google Business Profile (cannot be increased)**".
- **Review replies:** no separate limit is listed.

**How we stay inside these limits**
- Every call goes through `gbpFetch` (`lib/gbpQuota.ts`), which keeps each server process at 120 calls per minute and logs the counts.
- **One approved change = one PATCH**, however many attributes it touches, so one approval uses one of the 10 edits per minute.
- Our own cap is stricter: **one approval per business per minute** and **20 per business per day**, counted from the change log. Undo counts too.

## 2. "Pending Google review": what the API actually tells us

- **Attributes:** the PATCH response returns the merchant-saved values. It doesn't say whether Google has published them.
- **The location itself:** `Location.metadata.hasPendingEdits` is documented as "Indicates whether any of this Location's properties are in the edit pending state".
- **Live values:** `locations.attributes.getGoogleUpdated` returns the attributes "as they appear live on Google Maps and Search".

**What we show**
1. Right after a successful PATCH, we read `metadata.hasPendingEdits` (one GET).
   - If it's `true`, we show **"Pending Google review"**.
   - Otherwise, or if that read fails, we show **"Sent to Google — may take a little while to appear"**.
   - We never claim the change is live.
2. Points are never credited by the write. The score keeps reading accessibility, payment and parking from Google's public listing on the next scan (`listing_has_*`, Place Details). The change counts only once Google shows it. The Growth step also turns to "Waiting for the next check", the same as "I did this".
3. **Review replies (Step 2):** `reviewReplyState: PENDING` maps to the same "Pending Google review" pill, and `REJECTED` shows Google's `policyViolation` reason in plain words.

## 3. Undo design

Table `public.gbp_changes` (`supabase/gbp-changes.sql`) has one row per field changed:

| column | |
| --- | --- |
| `id` | uuid |
| `business_id` | the owner's business |
| `batch_id` | one approval = one batch, which is also the unit of undo |
| `kind` | `attributes` for now; later `hours`, `phone`, `website`, `description`, `review_reply` |
| `field` | e.g. `attributes/has_wheelchair_accessible_entrance` |
| `before_value`, `after_value` | `"true"`, `"false"` or null (not set) |
| `approved_by` | the user who clicked "Approve" |
| `approved_at` | time of approval |
| `status` | `sent`, `pending_review` or `failed` |
| `error_reason` | Google's machine-readable reason only, never message text |
| `undone_at`, `undo_of` | the undo link: the undo batch's rows point back to the original batch |

**What we store and what we don't**
- **Stored:** only the previous value of what we changed. For attributes that's a yes, no or not set.
- **Never stored:** review text, reply text, reviewer names, ratings or dates.

**How undo works**
- **Window:** undo is offered for **7 days**, on the latest successful batch that hasn't been undone.
- **What it does:** writes the `before` values back, in one PATCH. A field that was "not set" before is deleted again (it's put in the mask and left out of the body).
- **If it changed since:** before undoing, we re-read the live merchant values. If any field no longer matches our `after` value (the owner changed it on Google since), undo stops and says so. It never overwrites a newer edit.

## 4. Safety

- **Approval step:** the panel shows "before → after" for each changed field. Nothing is sent until "Approve and update Google".
  - The server never trusts the client's "before". It re-reads Google's current values, builds the diff itself, and accepts only attributes Google offers for this location (boolean, not deprecated, in accessibility, payment or parking).
- **Gate:** every action checks, on the server:
  - the signed-in owner (RLS);
  - plan is Premium or Multi (`getPlan()`);
  - the business isn't archived;
  - Google is connected with a matched location.
- **Audit log:** every approval writes its rows to `gbp_changes`, including failed ones, and undo writes its own rows. Owners can read their own rows. Only the server writes them.
- **Never half-applied:**
  - One request per approval. Google applies the whole attribute mask or rejects it.
  - If the PATCH fails, nothing has changed on Google. The log row says `failed` and the owner sees a clear error.
  - If the log write fails after Google accepted the change, the owner is still told it was sent. Undo isn't offered then, because we would have no record of the before values to restore.
- **Rate limits:** see §1.
- **Clear errors, in plain words, EN and ES:**
  - **Reconnect:** a 401 means Google stopped accepting the stored token. The connection is marked "Reconnect Google".
  - **Permission:** a 403 means the Google account doesn't have permission to edit this listing.
  - **Changed on Google:** Google's offered attributes changed while the panel was open. Reopen the panel and try again.
  - **Try again:** "Google didn't accept the change. Nothing was changed. Please try again in a minute."
  - **Too many:** a 429, or our own cap, gives "Please wait a minute".
- **Not built in Step 1:** review replies, hours, phone, website and description.
