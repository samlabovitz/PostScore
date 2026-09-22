# Assistant ("PostAI") chrome — English key list (translation reference)

Every key added by Step L7 (beat 1) to `lib/i18n/messages.ts`'s `en`
dictionary — the assistant's own UI chrome, under `dashboard.assistant.*`
(`components/assistant/AssistantOverlay.tsx`, `AssistantView.tsx`,
`BusinessMemoryPanel.tsx`). One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything
here**. Values are copied verbatim from `lib/i18n/messages.ts`.
`{placeholder}` interpolations must be preserved, unchanged (including
surrounding punctuation/spacing), in any translation — only the
surrounding words should ever change. `PostScore` and `PostAI` are the
product's own names and are never translated in any locale.

**Update (beat 2):** reviewed Spanish values have been added for every
`dashboard.assistant.*` key in this file (chrome + `memory.*` + the 4
server-action error keys below) — `es` no longer falls back to English
for any of them.

Keys suffixed `.one`/`.other` are **plural pairs** resolved via
`tPlural()` (real `Intl.PluralRules` category selection). Marked
**[plural]** below.

**NOT included in this file (Part 1's territory, not UI dictionary):**
the model's system prompt (`ASSISTANT_SYSTEM_RULES`), the grounding
context builder (`buildAssistantContextText`), and the starter-prompt
question generator (`buildAssistantStarterPrompts`) — all in
`lib/assistant.ts`, all sent to the model verbatim as instructions or
as the literal user message when a starter prompt is clicked. See the
"Ambiguous" section below for the specific borderline cases.

`AssistantLauncher.tsx` needed no changes — it was already fully
localized in Step L6 (`dashboard.overview.askPostAI`,
`dashboard.overview.betaLabel`, `dashboard.overview.assistantPrompt`,
`dashboard.overview.pastConversations.*`, `dashboard.overview.postAiOverlayTitle`).
This beat reuses two of those existing keys (`dashboard.overview.postAiOverlayTitle`
for the "PostAI" `SectionHeading` inside `AssistantView.tsx`, and
`dashboard.overview.betaLabel` for its "Beta" pill) instead of
duplicating them — same literal text, same brand name. It also reuses
`common.save`/`common.cancel` for `BusinessMemoryPanel.tsx`'s Save/Cancel
buttons.

---

## `AssistantOverlay.tsx`

Client component (`"use client"`), already had no `useLocale()` — added.

```
dashboard.assistant.closeAriaLabel = "Close assistant"
```

## `AssistantView.tsx`

Client component (`"use client"`) — added `useLocale()`/`t()`/`tPlural()`.

```
dashboard.assistant.generalGuidanceLabel = "General guidance"
dashboard.assistant.thinking = "Thinking…"
dashboard.assistant.yourBusinessFallback = "your business"
dashboard.assistant.emptyStateHeadline = "Ask anything about {business}'s presence"
dashboard.assistant.emptyStateBody = "Answers are grounded in your real PostScore data. General strategy tips are always labeled separately."
dashboard.assistant.noPastConversations = "No past conversations yet."
dashboard.assistant.newConversationFallback = "New conversation"
dashboard.assistant.historyMessageCount.one = "{count} message"   [plural]
dashboard.assistant.historyMessageCount.other = "{count} messages"   [plural]
dashboard.assistant.couldNotReachFallback = "Couldn't reach the assistant — try again."
dashboard.assistant.couldNotLoadPastConversations = "Couldn't load past conversations."
dashboard.assistant.couldNotLoadConversation = "Couldn't load this conversation."
dashboard.assistant.groundedInScore = "Grounded in your real PostScore ({total}/100) — general tips are always labeled, nothing is fabricated."
dashboard.assistant.continuingConversation = "Continuing this conversation"
dashboard.assistant.newConversationSavedNote = "New conversation — past chats are saved"
dashboard.assistant.backToChat = "Back to chat"
dashboard.assistant.historyButton = "History"
dashboard.assistant.newChatButton = "New chat"
dashboard.assistant.inputPlaceholder = "Ask about your score, action plan, competitors, or general marketing advice…"
dashboard.assistant.sendButton = "Send"
```

Note on `emptyStateHeadline`: the original was
`` Ask anything about {businessName ?? "your business"}'s presence `` —
`{business}` in code is computed as
`businessName ?? t(locale, "dashboard.assistant.yourBusinessFallback")`
before interpolation, so the fallback phrase itself is translatable
too, not baked into the template.

Note on `couldNotReachFallback`/`couldNotLoadPastConversations`/
`couldNotLoadConversation`: these are the CLIENT-SIDE fallback strings
used only when a server action fails without its own `message` (i.e.
`result.status !== "error"`) — distinct from the server-action strings
below.

## `app/actions/assistant.ts` — `sendAssistantMessage`'s own error fallbacks

Not a component — a `"use server"` action — but these four strings are
genuinely UI chrome: they reach the chat UI as `result.message` and
render there, they're just authored server-side. Threaded via
`normalizeLocale(business.language)`, the same pattern every other
server component/action in this app uses (`loadContext()` already
calls `getBusinessSummary()`, whose select list already includes
`language`; `LoadContextResult`'s `"ok"` branch now also returns
`locale: Locale`, and `sendAssistantMessage` passes `loaded.locale`
into `t()` for each fallback).

```
dashboard.assistant.errorTypeQuestionFirst = "Type a question first."
dashboard.assistant.errorCouldNotStartConversation = "Could not start a new conversation."
dashboard.assistant.errorCouldNotSaveMessage = "Could not save your message."
dashboard.assistant.errorCouldNotGetReply = "Couldn't get a reply."
```

**Beat 2 consolidation:** beat 1 had extracted FIVE distinct fallback
strings here, not four (the inventory report at the time flagged this).
Beat 2's request named only 4 keys, with `errorCouldNotGetReply` given
as `"Couldn't get a reply."` — a string that didn't literally match
either of the two remaining beat-1 fallbacks (`errorCouldNotReachAssistant`
= "Could not reach the assistant — try again." at the Anthropic API-call
catch, and `errorCouldNotSaveReply` = "Could not save the assistant's
reply." at the Supabase insert-failure check). Interpreted as an
intentional fold-in: both call sites now share the single
`errorCouldNotGetReply` key/text, and the two more specific beat-1
strings are gone. This is a genuine (small) change to the actual en
copy shown at those two failure points, not pure extraction — flagging
per your "flag any difference" instruction.

Each is a `?? fallback` alongside a real Supabase/Anthropic error
message (e.g. `conversationError?.message ?? t(loaded.locale, ...)`) —
only the fallback text is extracted; a real database/API error message
itself is never translated, same as everywhere else in the app.

One real (tiny) behavior change, not pure extraction: `sendAssistantMessage`
previously checked `!trimmed` and returned before calling `loadContext()`
(so it never even queried the business for an empty message); resolving
`loaded.locale` requires `loadContext()` to run first, so the empty-message
check was moved after it. The client (`AssistantView.tsx`'s `send()`)
already guards `!trimmed` before ever calling this action, so this
only affects a direct/malformed call to the server action itself — it
now does one extra (cheap, RLS-scoped) read in that case instead of
returning immediately.

## `BusinessMemoryPanel.tsx`

Client component (`"use client"`) — added `useLocale()`/`t()`.

```
dashboard.assistant.memory.noSavedScans = "No saved scans yet."
dashboard.assistant.memory.onlyOneScore = "Only one saved score so far — {total}/100 on {date}. No trend yet."
dashboard.assistant.memory.pointsSinceDate = "{delta} pts since {date}"
dashboard.assistant.memory.noConfirmedFixed = "Nothing confirmed fixed yet."
dashboard.assistant.memory.pointsGainedWithDate = "+{points} pts · {date}"
dashboard.assistant.memory.pointsGainedNoDate = "+{points} pts"
dashboard.assistant.memory.removeServiceAriaLabel = "Remove {service}"
dashboard.assistant.memory.noServicesYet = "No services added yet."
dashboard.assistant.memory.serviceInputPlaceholder = "e.g. Haircuts"
dashboard.assistant.memory.addButton = "Add"
dashboard.assistant.memory.businessTypeLabel = "Business type"
dashboard.assistant.memory.businessTypeCorrected = "Corrected by you — Google detected "{autoDetected}.""
dashboard.assistant.memory.businessTypeAutoDetected = "Auto-detected from your Google listing."
dashboard.assistant.memory.couldNotSaveFallback = "Couldn't save — try again."
dashboard.assistant.memory.heading = "What I know about your business"
dashboard.assistant.memory.subheading = "The real facts the assistant remembers, every session."
dashboard.assistant.memory.locationLabel = "Location"
dashboard.assistant.memory.notOnFile = "Not on file"
dashboard.assistant.memory.servicesJobValueHeading = "Services & typical job value"
dashboard.assistant.memory.editButton = "Edit"
dashboard.assistant.memory.servicesFieldLabel = "Services"
dashboard.assistant.memory.jobValueRangeLabel = "Typical job/ticket value range"
dashboard.assistant.memory.lowPlaceholder = "Low"
dashboard.assistant.memory.highPlaceholder = "High"
dashboard.assistant.memory.toSeparator = "to $"
dashboard.assistant.memory.errorMissingLow = "Enter a low value too, or clear the high value."
dashboard.assistant.memory.errorMissingHigh = "Enter a high value too, or clear the low value."
dashboard.assistant.memory.errorInvalidNumbers = "Enter valid positive numbers."
dashboard.assistant.memory.errorLowExceedsHigh = "The low value can't be more than the high value."
dashboard.assistant.memory.servicesNotEntered = "Not entered yet."
dashboard.assistant.memory.jobValueLine = "Typical job/ticket value: ${low} to ${high}"
dashboard.assistant.memory.jobValueNotEntered = "Typical job/ticket value: not entered yet."
dashboard.assistant.memory.fixedHeading = "What you've fixed"
dashboard.assistant.memory.scoreTrendHeading = "Score trend"
```

Note on `businessTypeCorrected`: the literal quote placement matches
the original template exactly —
`` `Corrected by you — Google detected "${autoDetectedBusinessType}."` ``
— the closing double-quote sits AFTER the period, not before
(`"Liquor Store."` not `"Liquor Store".`).

Note on `jobValueLine`: stored as a plain (non-template-literal)
string `"Typical job/ticket value: ${low} to ${high}"` — the `$` before
each `{low}`/`{high}` is literal text, not JS interpolation syntax;
`t()`'s own `{name}` regex substitutes just the braced part, leaving
each `$` in place, reproducing the original's `$150 to $300` shape
exactly.

**Not extracted:** `BIZ_PROFILE_OPTIONS` labels (the business-type
`<select>` options) are sourced from `config/bizProfiles.ts`, out of
scope by the same convention established in the Growth section
(config-sourced content stays English-only data, never re-extracted
into the UI dictionary).

---

## Ambiguous (UI chrome vs. model grounding) — not extracted either way here

- **`GENERAL_GUIDANCE_PREFIX = "general guidance:"`** in
  `AssistantView.tsx` — a parser constant, NOT rendered text. It's
  compared (lowercased) against the model's own raw reply to detect and
  strip the "General guidance:" marker `ASSISTANT_SYSTEM_RULES` rule 2
  instructs the model to prepend verbatim. Changing this string breaks
  parsing of the model's English-instructed output; it must stay tied
  to the system prompt's exact instruction text, which is Part 1's
  territory (a locale-aware system prompt would need to change the
  marker AND this parser together, atomically). Left untouched here.
  (Distinct from `dashboard.assistant.generalGuidanceLabel` above, which
  is the separate, purely visual "General guidance" heading rendered
  over the already-parsed paragraph — that one is ordinary UI chrome
  and was extracted normally.)
- **Starter-prompt question text** (`buildAssistantStarterPrompts()` in
  `lib/assistant.ts`, e.g. "What's hurting my score the most right
  now?") — rendered as clickable button labels in `AssistantLauncher.tsx`,
  `AssistantView.tsx`'s `EmptyState`, and its chat-footer quick-prompt
  row, but the exact same string is also sent to the model verbatim as
  the user's message when clicked. Translating the button label without
  changing what's actually sent (or vice versa) would desync the two.
  Left untouched in `lib/assistant.ts`, per Part 1's read-only scope.
