# Hair Express: this week's 10 reply drafts

Written 11/24/2026, 9:41:47 PM ET on Claude's preview server (localhost:3100), voice "Me (I)", rules v7. Review text is left out on purpose (never stored); open the Growth plan to read each review next to its draft.

## 1. Christine · ★★★★★

Christine, thank you for the five stars! I'm thrilled that your haircut has held up so well over the month and that you loved your time here.

## 2. Win Browning · ★★★★★

Hi Win, I'm glad you came in for a men's cut and felt good about the results. It means a lot to me when clients trust me with their hair.

## 3. Kimberly Quispe · ★★★★★

Kimberly, twenty years—I'm honored you've stayed with me all this time. Your trust in my work truly matters to me.

## 4. yadira zhinin · ★★★★★

Yadira, I'm so glad you felt comfortable during your appointment and that I could explain everything clearly. Thank you for letting me be part of your day.

## 5. Laurel Weaver · ★★★★★

Thank you, Laurel, for the kind words. It's wonderful to hear that you feel beautiful and fresh after your visits—that's exactly what I hope for every person who sits in my chair. I look forward to seeing you again soon.

## 6. Melissa McKeary · ★★★★★ · stars only, no words

Thank you for the 5 stars, Melissa! It made my day.

## 7. Tat E · ★★★★★

Tat, I appreciate you noticing the quality products I use—they make such a difference for curly hair like yours. Thank you for your loyalty over the years.

## 8. Bari Smelson · ★★★★★ · stars only, no words

Thank you for the 5 stars, Bari! I really appreciate it.

## 9. Jennifer Monness · ★★★★★

Jennifer, your words touch my heart. I'm grateful you've followed me to the new salon and that you feel that personal attention when you're here.

## 10. Margie Shapiro · ★★★★★

Hi Margie, I'm truly grateful for your kind words about my work with your hair. It's wonderful to hear that the keratin treatments are transforming your wiry, frizzy hair the way you hoped, and that you feel comfortable coming back regularly. I love creating that fresh, clean space for my clients, and your loyalty means everything to me.
## What changed in round 2

- **Yadira's draft:** it now drafts. The likeliest cause of the failure: one error from the AI service (ten drafts run at once) ended all of her tries. Each try now survives an error and tries again. Her review on its own passed every check, so a rule wasn't rejecting every attempt.
- **Variety across the whole batch:** the 10 are now written together in one call, then each one is checked in code against the replies before it:
  - no shared opening;
  - no shared phrase of 4+ words;
  - "means the world", "means everything", "means a lot / so much" and "trust(ing) me with your hair" count as repeats, in at most one reply each.
  A reply that fails a check is written again on its own (twice).
- **One style:** replies are one paragraph; a "Hi Name," greeting stays inline.
- **Stars only:** these are written without the AI: "Thank you for the 5 stars, Name!" plus an owner line no other reply in the batch uses ("It made my day.", "I really appreciate it.", …). So they can't imply anything the reviewer didn't write.

## Fact check, draft by draft (against each review, read live)

- **1, 3, 4, 6, 7, 8:** only things the review says.
- **2 Win:** "came in for a men's cut" fits his review ("excellent men's haircuts").
- **5 Laurel:** "that's exactly what I hope for every person who sits in my chair" is a general line about the owner, not a fact from the review.
- **9 Jennifer:** her review does mention a change ("I'm so excited she has her own salon"), so the earlier "this next chapter" wasn't invented. This draft's "followed me to the new salon" is an inference from it. Change it if you'd rather it say only what she wrote.
- **10 Margie:** "the way you hoped" isn't in her review. Everything else is (keratin, wiry frizzy hair, regular visits, the fresh, clean new salon).

These are a judgment check, not a code check: the code enforces the voice, names, language, repeats, stock phrases and the star-only rule, and the prompt forbids anything the review doesn't say.
