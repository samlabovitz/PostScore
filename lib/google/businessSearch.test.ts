import { describe, expect, test, vi } from "vitest";
import { extractListingHints, findBusiness, MAX_FALLBACK_SEARCHES } from "./businessSearch";
import { parsePublicWebsiteUrl } from "@/lib/publicUrl";

vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key-for-businessSearch");

type Call = { url: string; body: Record<string, unknown> | null };

/** A fake Google: each Text Search returns the next queued result list. */
function fakeGoogle(opts: {
  searches: Array<Array<{ id: string; name: string; address?: string; sab?: boolean }>>;
  homepage?: string | null;
  geocode?: { lat: number; lng: number } | null;
}) {
  const calls: Call[] = [];
  let search = 0;
  const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ url, body });
    if (url.includes("places:searchText")) {
      const places = (opts.searches[search++] ?? []).map((p) => ({
        id: p.id,
        displayName: { text: p.name },
        formattedAddress: p.address,
        pureServiceAreaBusiness: p.sab,
      }));
      return { ok: true, status: 200, json: async () => ({ places }) } as unknown as Response;
    }
    if (url.includes("places.googleapis.com/v1/places/")) {
      const id = decodeURIComponent(url.split("/places/")[1]);
      return { ok: true, status: 200, json: async () => ({ id, displayName: { text: `Listing ${id}` }, formattedAddress: "Dobbs Ferry, NY" }) } as unknown as Response;
    }
    if (url.includes("geocode/json")) {
      const loc = opts.geocode ?? null;
      return { ok: true, status: 200, json: async () => (loc ? { status: "OK", results: [{ geometry: { location: loc } }] } : { status: "ZERO_RESULTS", results: [] }) } as unknown as Response;
    }
    // the owner's homepage
    if (opts.homepage == null) return { ok: false, status: 404, headers: new Headers(), text: async () => "" } as unknown as Response;
    return { ok: true, status: 200, headers: new Headers({ "content-type": "text/html" }), text: async () => opts.homepage } as unknown as Response;
  });
  const searchBodies = () => calls.filter((c) => c.url.includes("searchText")).map((c) => c.body!);
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls, searchBodies };
}

const quiet = () => {};

describe("the normal search", () => {
  test("one paid search; service-area businesses included; a single hit goes straight to details", async () => {
    const g = fakeGoogle({ searches: [[{ id: "p1", name: "Jane's English Tutoring", sab: true }]] });
    const result = await findBusiness({ name: "Jane's English Tutoring", location: "Dobbs Ferry, NY" }, g.fetchImpl, quiet);
    expect(result.status).toBe("found");
    expect(result.route).toBe("name_town");
    expect(g.searchBodies()).toHaveLength(1);
    expect(g.searchBodies()[0]).toMatchObject({ textQuery: "Jane's English Tutoring Dobbs Ferry, NY", includePureServiceAreaBusinesses: true });
    expect(result.paidCalls).toEqual({ textSearch: 1, details: 1, geocode: 0 });
  });

  test("several hits: a list, each marked when it has no storefront", async () => {
    const g = fakeGoogle({ searches: [[{ id: "a", name: "A", address: "1 Main St" }, { id: "b", name: "B", sab: true }]] });
    const result = await findBusiness({ name: "A", location: "Ardsley" }, g.fetchImpl, quiet);
    if (result.status !== "multiple") throw new Error(result.status);
    expect(result.candidates.map((c) => c.serviceArea)).toEqual([false, true]);
  });
});

describe("fallbacks run only when nothing is found, never more than 2 extra searches", () => {
  test("a Google place id linked from the owner's website → that listing, no extra search", async () => {
    const g = fakeGoogle({
      searches: [[]],
      homepage: `<a href="https://www.google.com/maps/search/?api=1&query=Jane&query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4">Find us</a>`,
    });
    const result = await findBusiness({ name: "Jane", location: "Dobbs Ferry", websiteUrl: "janeenglish.com" }, g.fetchImpl, quiet);
    expect(result.status).toBe("found");
    expect(result.route).toBe("website_place_id");
    expect(g.searchBodies()).toHaveLength(1);
  });

  test("a phone number on the website → search by phone, shown as a list (never auto-picked)", async () => {
    const g = fakeGoogle({ searches: [[], [{ id: "p2", name: "Jane Smith, M.A." }]], homepage: `<a href="tel:+1-914-555-0142">Call</a>` });
    const result = await findBusiness({ name: "Jane's Tutoring", location: "Dobbs Ferry", websiteUrl: "https://janeenglish.com" }, g.fetchImpl, quiet);
    expect(result).toMatchObject({ status: "multiple", route: "website_phone" });
    expect(g.searchBodies()[1].textQuery).toBe("+19145550142");
  });

  test("owner name + town, then name leaning toward the town — and then it stops", async () => {
    const g = fakeGoogle({ searches: [[], [], []], geocode: { lat: 41.01, lng: -73.87 } });
    const result = await findBusiness({ name: "Jane's Tutoring", location: "Dobbs Ferry, NY", ownerName: "Jane Smith" }, g.fetchImpl, quiet);
    expect(result.status).toBe("no_results");
    const bodies = g.searchBodies();
    expect(bodies).toHaveLength(1 + MAX_FALLBACK_SEARCHES);
    expect(bodies[1].textQuery).toBe("Jane Smith Dobbs Ferry, NY");
    expect(bodies[2]).toMatchObject({ textQuery: "Jane's Tutoring", locationBias: { circle: { center: { latitude: 41.01, longitude: -73.87 }, radius: 25000 } } });
    expect(result.paidCalls).toEqual({ textSearch: 3, details: 0, geocode: 1 });
  });

  test("the cap holds even with every hint available", async () => {
    const g = fakeGoogle({ searches: [[], [], [], []], homepage: `<a href="tel:9145550142">x</a>`, geocode: { lat: 1, lng: 2 } });
    await findBusiness({ name: "X", location: "Y", ownerName: "Z", websiteUrl: "x.com" }, g.fetchImpl, quiet);
    expect(g.searchBodies()).toHaveLength(3);
  });

  test("nothing found but a website was given → offer the website-only mode", async () => {
    const g = fakeGoogle({ searches: [[], []], homepage: "<p>no hints</p>", geocode: null });
    const result = await findBusiness({ name: "X", location: "Y", websiteUrl: "https://x.com" }, g.fetchImpl, quiet);
    expect(result).toMatchObject({ status: "no_results", websiteOnlyAvailable: true });
    const none = await findBusiness({ name: "X", location: "Y" }, fakeGoogle({ searches: [[]], geocode: null }).fetchImpl, quiet);
    expect(none.websiteOnlyAvailable).toBe(false);
  });

  test("an unsafe website address is never fetched", async () => {
    const g = fakeGoogle({ searches: [[]], geocode: null });
    await findBusiness({ name: "X", location: "Y", websiteUrl: "http://169.254.169.254/latest" }, g.fetchImpl, quiet);
    expect(g.calls.some((c) => c.url.includes("169.254"))).toBe(false);
  });
});

describe("listing hints and safe URLs", () => {
  test("place ids from Maps links (plain and URL-encoded) and phones from tel: links", () => {
    const hints = extractListingHints(
      `<a href="https://maps.google.com/?q=x&query_place_id=ChIJabcdefghijklmnopqrstu">m</a>
       <iframe src="https://www.google.com/maps/embed/v1/place?q=place_id%3AChIJzyxwvutsrqponmlkjihg"></iframe>
       <a href="tel:(914)%20555-0142">call</a><a href="tel:911">x</a>`
    );
    expect(hints.placeIds).toEqual(["ChIJabcdefghijklmnopqrstu", "ChIJzyxwvutsrqponmlkjihg"]);
    expect(hints.phones).toEqual(["9145550142"]);
  });

  test("public URLs only", () => {
    expect(parsePublicWebsiteUrl("janeenglish.com")?.toString()).toBe("https://janeenglish.com/");
    expect(parsePublicWebsiteUrl("http://www.example.org/about")?.hostname).toBe("www.example.org");
    for (const bad of ["http://localhost:3000", "http://10.0.0.5", "http://[::1]/", "ftp://example.com", "http://printer.local", "https://user:pw@example.com", "https://example.com:8443", "javascript:alert(1)", "notaurl", ""]) {
      expect(parsePublicWebsiteUrl(bad), bad).toBeNull();
    }
  });
});
