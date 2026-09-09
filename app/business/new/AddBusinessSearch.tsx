"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { saveBusiness } from "@/app/actions/businesses";
import type { PlaceLookupResult, PlaceCandidate, PlaceDetails } from "@/lib/google/places";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-paper-line py-2.5 last:border-b-0">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">{label}</span>
      {value === null ? (
        <span className="text-sm italic text-ink-mute">Not available</span>
      ) : (
        <span className="text-sm text-ink">{value}</span>
      )}
    </div>
  );
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string };

/** The real "add a business" save step — the same saveBusiness() server
 * action every business in this app goes through. On success it routes
 * straight to the new business's real Overview page rather than leaving
 * the owner on a static confirmation. */
function SaveControl({ place }: { place: PlaceDetails }) {
  const router = useRouter();
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  async function handleSave() {
    setState({ kind: "saving" });
    const result = await saveBusiness(place);
    if (result.status === "saved") {
      setState({ kind: "saved" });
      router.push(`/business/${result.businessId}`);
    } else if (result.status === "unauthenticated") {
      setState({ kind: "unauthenticated" });
    } else {
      setState({ kind: "error", message: result.message });
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="brass"
        onClick={handleSave}
        disabled={state.kind === "saving" || state.kind === "saved"}
      >
        {state.kind === "saved" ? "Saved — opening…" : state.kind === "saving" ? "Saving..." : "Add this business"}
      </Button>
      {state.kind === "unauthenticated" && (
        <span className="text-sm text-red">Your session expired — log in again to save.</span>
      )}
      {state.kind === "error" && <span className="text-sm text-red">{state.message}</span>}
    </div>
  );
}

function DetailsView({ place }: { place: PlaceDetails }) {
  return (
    <Card className="p-5">
      <Field label="Name" value={place.name} />
      <Field label="Address" value={place.formattedAddress} />
      <Field label="Phone" value={place.phone} />
      <Field label="Website" value={place.website} />
      <Field label="Rating" value={place.rating !== null ? `${place.rating.toFixed(1)} ★` : null} />
      <Field
        label="Reviews"
        value={place.userRatingCount !== null ? String(place.userRatingCount) : null}
      />
      <Field label="Category" value={place.primaryCategory} />

      <div className="mt-4 border-t border-paper-line pt-4">
        <SaveControl place={place} />
      </div>
    </Card>
  );
}

/**
 * The real, production "add a business" flow: searches real Google
 * Places data (via /api/places/lookup, same route the internal
 * dev/places-lookup debug tool uses) and saves through the same
 * saveBusiness() server action every business in this app goes through.
 * No sample/demo business is ever offered as a shortcut — a brand-new
 * owner has to find their real listing, same as every returning owner
 * adding a second location.
 */
export function AddBusinessSearch() {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlaceLookupResult | null>(null);

  async function runLookup(body: Record<string, string>) {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/places/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as PlaceLookupResult;
      setResult(data);
    } catch {
      setResult({ status: "error", message: "The search failed — check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !location.trim()) return;
    runLookup({ name: name.trim(), location: location.trim() });
  }

  function pickCandidate(candidate: PlaceCandidate) {
    runLookup({ placeId: candidate.placeId });
  }

  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <SectionHeading title="Find your business on Google" />
      <Card className="p-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-[13px] font-medium text-ink-soft">Business name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Blue Bottle Coffee"
              className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[13px] font-medium text-ink-soft">City / location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Oakland, CA"
              className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
            />
          </div>
          <Button type="submit" variant="brass" disabled={loading || !name.trim() || !location.trim()}>
            {loading ? "Searching..." : "Search"}
          </Button>
        </form>
      </Card>

      {result && (
        <>
          <SectionHeading title="Result" />

          {result.status === "no_results" && (
            <Card className="p-5 text-sm text-ink-soft">
              No matching business found for that name and location. Try broadening the location or
              checking the spelling.
            </Card>
          )}

          {result.status === "error" && <Card className="p-5 text-sm text-red">{result.message}</Card>}

          {result.status === "multiple" && (
            <Card className="p-5">
              <p className="mb-3 text-sm text-ink-soft">
                Found {result.candidates.length} possible matches. Pick the correct one:
              </p>
              <div className="flex flex-col gap-2">
                {result.candidates.map((candidate) => (
                  <button
                    key={candidate.placeId}
                    type="button"
                    onClick={() => pickCandidate(candidate)}
                    className="rounded-lg border border-paper-deep px-3 py-2.5 text-left text-sm hover:border-ink-soft"
                  >
                    <div className="font-medium text-ink">{candidate.name}</div>
                    <div className="text-ink-mute">{candidate.formattedAddress ?? "Not available"}</div>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {result.status === "found" && <DetailsView place={result.place} />}
        </>
      )}
    </div>
  );
}
