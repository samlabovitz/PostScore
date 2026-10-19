# Billing compliance — build these into checkout

Checkout isn't built yet: every account is on the Free plan (`lib/premium.ts`),
and nothing charges anyone. When paid plans ship, checkout **must** include
everything below. The exact wordings live in `lib/billing/compliance.ts`;
the policy text lives in `lib/legal/policies.ts` (`POLICY_VERSION`).

These cover US automatic-renewal laws (e.g. California ARL and the FTC's
negative-option rules), UK/EU consumer law (14-day withdrawal right), and
plain good practice. Have a lawyer review before launch.

## At checkout
- [ ] **Clear terms next to Subscribe** — price, "renews monthly until you
      cancel", and how to cancel, in visible text (`priceDisclosure`).
- [ ] **Unticked required checkbox** — "I agree my plan renews monthly at $X
      until I cancel." (`renewalConsentLabel`).
- [ ] **Store the consent** (`ConsentRecord`): user, timestamp, plan, price,
      currency, IP, wording version — keep ≥ 3 years.
- [ ] **EU/UK consumers: second unticked checkbox** — "Start my plan now. I
      understand I lose my 14-day withdrawal right once the service begins."
      (`withdrawalWaiverLabel`). Without it, a withdrawal within 14 days is
      refunded, pro-rated for days used.

## After purchase
- [ ] **Confirmation email** — plan, price, renewal terms, cancel link,
      refund policy link. Must respect our email safety flags
      (`MONTHLY_REPORTS_LIVE`, `ALLOW_SEND_ONE`, `REPORT_TEST_EMAIL`) like every other email.

## Cancelling
- [ ] **Online, same place** — Settings → Plan & billing, no call or email.
- [ ] **≤ 2 clicks** after "Cancel subscription" (`MAX_CANCEL_CLICKS`).
- [ ] **At most one save offer**, with a clear "No thanks, cancel" button.
- [ ] Access continues to the end of the paid period, then Free.
- [ ] **Cancellation confirmation email.**

## Later changes
- [ ] **Price changes**: email ≥ 30 days before the new price applies, with
      how to cancel (`PRICE_CHANGE_NOTICE_DAYS`).
- [ ] **Annual plans / free trials** (if ever added): reminder email before
      each renewal and before a trial ends.

## Recommendation (not built)
- Use **Stripe Billing + the Stripe customer portal** (handles cancel-online,
      invoices, card updates), **or** a **merchant of record** such as
      **Paddle** or **Lemon Squeezy** if selling internationally — they handle
      sales tax/VAT collection and remittance and consumer-law flows.
