// Google's own Place Details `photos` field is documented to return at
// most this many photo references per listing — a real, hard cap on
// the raw data PostScore ever collects (see photoCount in
// lib/google/places.ts), never a PostScore-chosen limit. Once a real
// photo count hits this number, it's a LOWER BOUND, not an exact
// count — the listing could genuinely have many more.
//
// Kept in its own tiny, side-effect-free module — not lib/google/places.ts
// itself, which is marked server-only and must never be pulled into a
// client bundle — so every place that needs this real number (scoring,
// growth moves, the "what changed" feed, the PostAI assistant context)
// can import just the constant and share the exact same value, never a
// second hardcoded "10" that could quietly drift from the real API
// behavior this describes.
export const GOOGLE_PHOTO_CAP = 10;
