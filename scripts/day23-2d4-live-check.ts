// Day 23 2d-4 proof that scans score exactly as before, check by check.
//
//   --before  (dry run, no database writes except the places_calls log)
//             For each of the 10 businesses (scripts/day23-2d4-snapshot.ts):
//             one Place Details read, then the score two ways from that SAME
//             answer — the old way (the saved row with the old upsert written
//             over it, as the database read it back) and the new way (the
//             saved own columns + lib/listingScoringRow.ts, in memory). They
//             must match exactly; the old way's points are saved to
//             ~/Desktop/day23-2d4-live-before.json.
//   --after   After real re-scans with the new code: each business's latest
//             saved scan, compared check by check with live-before.json.
//
// Either mode fails loudly on an empty or partial snapshot.
//
//   npx --no-install tsx --env-file=.env.local scripts/day23-2d4-live-check.ts --before
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { allowServerOnly } from "./allowServerOnly";
import { DAY23_2D4_IDS, snapshotDiff, snapshotOf, snapshotProblems, type ScoreSnapshot } from "./day23-2d4-snapshot";

allowServerOnly();

const LIVE_BEFORE = path.join(homedir(), "Desktop", "day23-2d4-live-before.json");

type Row = ScoreSnapshot & { id: string; name: string };

function fail(message: string): never {
  console.error(`FAILED — ${message}`);
  process.exit(2);
}

async function before(db: SupabaseClient) {
  const [{ lookupBusinessByPlaceId, hasRecentReviewFrom, recentReviewsSeenFrom }, { listingScoringRow }, { businessRowToScoringInput, scoreBusiness, V112_SCORING_COLUMNS }, { withTimeZone }, { withOwnerWebsite }, { logPlacesDetailsCall }] =
    await Promise.all([
      import("@/lib/google/places"),
      import("@/lib/listingScoringRow"),
      import("@/lib/scoring"),
      import("@/lib/businessTimeZone"),
      import("@/lib/ownerWebsite.server"),
      import("@/lib/placesDetailsBudget.server"),
    ]);
  const rows: Row[] = [];
  const mismatches: string[] = [];
  for (const id of DAY23_2D4_IDS) {
    const { data: saved, error } = await db
      .from("businesses")
      .select(
        `id, place_id, listing_mode, name, address, phone, website, rating, review_count, category, categories, primary_type, business_type_override, biz_type_resolved, opening_hours, opening_hours_periods, photo_count, business_status, https_status, website_analysis_json, google_maps_uri, language, google_listing_missing_website_since, google_listing_website_removed_since, google_listing_last_known_website_at, verified_website_url, website_trust_overrides_json, lat, lng, ${V112_SCORING_COLUMNS}`
      )
      .eq("id", id)
      .single();
    if (error || !saved) fail(`${id}: ${error?.message ?? "not found"}`);
    const lookup = await lookupBusinessByPlaceId(saved.place_id as string);
    if (lookup.status !== "error") await logPlacesDetailsCall(id, "rescan");
    if (lookup.status !== "found") fail(`${saved.name}: Places ${lookup.status}`);
    const place = { ...lookup.place, website: lookup.place.website ?? (saved.website as string | null) };
    const now = new Date();

    // The OLD way, literally as app/actions/businesses.ts upserted before 2d-4.
    const v112 =
      place.reviewPublishTimes === undefined
        ? {}
        : {
            has_recent_review: hasRecentReviewFrom(place.reviewPublishTimes, now),
            recent_reviews_seen: recentReviewsSeenFrom(place.reviewPublishTimes, now),
            listing_has_accessibility: place.listingHasAccessibility ?? null,
            listing_has_payment: place.listingHasPayment ?? null,
            listing_has_parking: place.listingHasParking ?? null,
            pure_service_area_business: place.pureServiceAreaBusiness ?? null,
          };
    const oldRow = {
      ...saved,
      ...v112,
      name: place.name,
      address: place.formattedAddress,
      phone: place.phone,
      website: place.website,
      rating: place.rating,
      review_count: place.userRatingCount,
      category: place.primaryCategory,
      primary_type: place.primaryType,
      categories: place.categories,
      opening_hours: place.openingHours,
      opening_hours_periods: place.openingHoursPeriods,
      business_status: place.businessStatus,
      photo_count: place.photoCount,
      google_maps_uri: place.googleMapsUri,
      price_level: place.priceLevel,
      lat: place.location?.lat ?? null,
      lng: place.location?.lng ?? null,
    };
    // The NEW way: our own saved columns + the listing in memory.
    const newRow = { ...saved, ...listingScoringRow(place, now), lat: place.location?.lat ?? (saved.lat as number | null), lng: place.location?.lng ?? (saved.lng as number | null) };

    const score = async (row: Record<string, unknown>) => {
      const zoned = await withOwnerWebsite(db, id, withTimeZone(row));
      return scoreBusiness(businessRowToScoringInput(zoned as never), "en");
    };
    const [oldBd, newBd] = await Promise.all([score(oldRow), score(newRow)]);
    const oldSnap = snapshotOf(oldBd, oldBd.total, oldBd.grade, oldBd.scoringVersion);
    const diff = snapshotDiff(oldSnap, snapshotOf(newBd, newBd.total, newBd.grade, newBd.scoringVersion));
    if (diff.length) mismatches.push(`${saved.name}: ${diff.join("; ")}`);
    rows.push({ id, name: saved.name as string, ...oldSnap });
    console.log(`${saved.name}: ${oldBd.total} ${oldBd.grade} — old way and new way ${diff.length ? "DIFFER" : "identical"}`);
  }
  const problems = snapshotProblems(rows);
  if (problems.length) fail(`snapshot incomplete:\n${problems.join("\n")}`);
  if (mismatches.length) fail(`old and new scoring differ:\n${mismatches.join("\n")}`);
  writeFileSync(
    LIVE_BEFORE,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        note: "One live Place Details read per business; each scored the old way and the new way from the same answer (identical). Website checks use the saved website analysis; a real re-scan re-analyzes the site.",
        businesses: rows,
      },
      null,
      2
    )
  );
  console.log(`OK: ${rows.length} businesses, identical old/new, saved ${LIVE_BEFORE}`);
}

async function after(db: SupabaseClient) {
  const baseline = JSON.parse(readFileSync(LIVE_BEFORE, "utf8")) as { recordedAt: string; businesses: Row[] };
  const baseProblems = snapshotProblems(baseline.businesses);
  if (baseProblems.length) fail(`live-before.json incomplete:\n${baseProblems.join("\n")}`);
  const rows: Row[] = [];
  const diffs: string[] = [];
  for (const b of baseline.businesses) {
    const { data: s, error } = await db.from("scores").select("total, grade, scoring_version, created_at, breakdown_json").eq("business_id", b.id).order("created_at", { ascending: false }).limit(1).single();
    if (error || !s) fail(`${b.name}: no saved scan`);
    if (s.created_at <= baseline.recordedAt) fail(`${b.name}: no re-scan since ${baseline.recordedAt}`);
    const snap = snapshotOf(s.breakdown_json, s.total, s.grade, s.scoring_version);
    rows.push({ id: b.id, name: b.name, ...snap });
    const d = snapshotDiff(b, snap);
    if (d.length) diffs.push(`${b.name}: ${d.join("; ")}`);
    console.log(`${b.name}: ${snap.total} ${snap.grade} — ${d.length ? "DIFFERS" : "identical"}`);
  }
  const problems = snapshotProblems(rows);
  if (problems.length) fail(`after snapshot incomplete:\n${problems.join("\n")}`);
  if (diffs.length) fail(`re-scans differ from live-before.json:\n${diffs.join("\n")}`);
  console.log("OK: all 10 identical, check by check.");
}

(async () => {
  const guard = setTimeout(() => fail("timed out"), 10 * 60_000);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  if (process.argv.includes("--before")) await before(db);
  else if (process.argv.includes("--after")) await after(db);
  else fail("pass --before or --after");
  clearTimeout(guard);
  process.exit(0);
})();
