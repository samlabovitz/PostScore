"use client";

import { FormEvent, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type {
  PlaceLookupResult,
  PlaceCandidate,
  PlaceDetails,
} from "@/lib/google/places";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-paper-line py-2.5 last:border-b-0">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        {label}
      </span>
      {value === null ? (
        <span className="text-sm italic text-ink-mute">Not available</span>
      ) : (
        <span className="text-sm text-ink">{value}</span>
      )}
    </div>
  );
}

function DetailsView({ place, raw }: { place: PlaceDetails; raw: unknown }) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        <Field label="Name" value={place.name} />
        <Field label="Formatted address" value={place.formattedAddress} />
        <Field label="Phone" value={place.phone} />
        <Field label="Website" value={place.website} />
        <Field
          label="Opening hours"
          value={place.openingHours ? place.openingHours.join("\n") : null}
        />
        <Field
          label="Rating"
          value={place.rating !== null ? place.rating.toFixed(1) : null}
        />
        <Field
          label="Total reviews"
          value={
            place.userRatingCount !== null ? String(place.userRatingCount) : null
          }
        />
        <Field
          label="Primary category"
          value={place.primaryCategory}
        />
        <Field
          label="Categories"
          value={place.categories ? place.categories.join(", ") : null}
        />
        <Field
          label="Coordinates"
          value={
            place.location
              ? `${place.location.lat}, ${place.location.lng}`
              : null
          }
        />
        <Field label="Business status" value={place.businessStatus} />
        <Field label="Google Maps link" value={place.googleMapsUri} />
      </Card>

      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
          Raw Google response (for verification against Google Maps)
        </div>
        <pre className="max-h-[420px] overflow-auto rounded-xl border border-paper-deep bg-ink p-4 text-[12px] leading-relaxed text-[#c8d6ea]">
          {JSON.stringify(raw, null, 2)}
        </pre>
      </div>
    </div>
  );
}

export default function PlacesLookupPage() {
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
      setResult({
        status: "error",
        message: "Request to the lookup API failed. Check the dev server logs.",
      });
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
    <DashboardShell>
      <div className="flex flex-col gap-6 nav:gap-8">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">
            Places lookup (dev test)
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Server-side Google Places (New) lookup — for verifying real data,
            not a production UI.
          </p>
        </div>

        <SectionHeading title="Search" />
        <Card className="p-5">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <label className="mb-1 block text-[13px] font-medium text-ink-soft">
                Business name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Blue Bottle Coffee"
                className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[13px] font-medium text-ink-soft">
                City / location
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Oakland, CA"
                className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
              />
            </div>
            <Button
              type="submit"
              variant="brass"
              disabled={loading || !name.trim() || !location.trim()}
            >
              {loading ? "Looking up..." : "Look up business"}
            </Button>
          </form>
        </Card>

        {result && (
          <>
            <SectionHeading title="Result" />

            {result.status === "no_results" && (
              <Card className="p-5 text-sm text-ink-soft">
                No matching business found for that name and location. Try
                broadening the location or checking the spelling.
              </Card>
            )}

            {result.status === "error" && (
              <Card className="p-5 text-sm text-red">{result.message}</Card>
            )}

            {result.status === "multiple" && (
              <Card className="p-5">
                <p className="mb-3 text-sm text-ink-soft">
                  Found {result.candidates.length} possible matches. Pick the
                  correct one:
                </p>
                <div className="flex flex-col gap-2">
                  {result.candidates.map((candidate) => (
                    <button
                      key={candidate.placeId}
                      type="button"
                      onClick={() => pickCandidate(candidate)}
                      className="rounded-lg border border-paper-deep px-3 py-2.5 text-left text-sm hover:border-ink-soft"
                    >
                      <div className="font-medium text-ink">
                        {candidate.name}
                      </div>
                      <div className="text-ink-mute">
                        {candidate.formattedAddress ?? "Not available"}
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {result.status === "found" && (
              <DetailsView place={result.place} raw={result.raw} />
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
