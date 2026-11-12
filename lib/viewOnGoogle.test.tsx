import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";

vi.mock("server-only", () => ({}));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { safeMapsUri } from "@/lib/gbpMapsUri";
import { readGbpMapsUri } from "@/lib/gbpMapsUri.server";
import { ViewOnGoogle } from "@/components/gbp/ViewOnGoogle";
import { resetGbpQuota } from "@/lib/gbpQuota";

const HAIR = "https://maps.google.com/maps?cid=18256408134636737545";
const html = (node: React.ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>).replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

describe("“View on Google” after a change to the Business Profile", () => {
  test("Google's own metadata.mapsUri, read with one GET (readMask=metadata) — never a write, never a link built by hand", async () => {
    resetGbpQuota();
    const calls: Array<{ url: URL; method: string }> = [];
    const fake: typeof fetch = async (input, init) => {
      calls.push({ url: new URL(String(input)), method: init?.method ?? "GET" });
      return new Response(JSON.stringify({ metadata: { mapsUri: HAIR, hasPendingEdits: true } }), { status: 200 });
    };
    expect(await readGbpMapsUri({ locationName: "locations/15510298593847876242", accessToken: "ya29.TEST" }, fake)).toBe(HAIR);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url.pathname).toBe("/v1/locations/15510298593847876242");
    expect(calls[0].url.searchParams.get("readMask")).toBe("metadata");
    // Google unreadable → no link (the line still never claims anything).
    expect(await readGbpMapsUri({ locationName: "locations/1", accessToken: "x" }, async () => new Response("{}", { status: 503 }))).toBeNull();
  });

  test("only a real https Google Maps link is ever shown", () => {
    expect(safeMapsUri(HAIR)).toBe(HAIR);
    expect(safeMapsUri("https://www.google.com/maps?cid=1")).not.toBeNull();
    for (const bad of ["http://maps.google.com/maps?cid=1", "https://evil.example/maps.google.com", "javascript:alert(1)", "", null, 42]) expect(safeMapsUri(bad), String(bad)).toBeNull();
  });

  test("EN + ES: the link (new tab) and the one line about Google's review time", () => {
    const en = html(<ViewOnGoogle mapsUri={HAIR} />);
    expect(en).toContain(`href="${HAIR}" target="_blank" rel="noopener noreferrer"`);
    expect(en).toContain("View on Google");
    expect(en).toContain("Google can take a while to review edits. If you don't see the change yet, it's probably still pending.");
    const es = html(<ViewOnGoogle mapsUri={HAIR} />, "es");
    expect(es).toContain("Ver en Google");
    expect(es).toContain("Google puede tardar un poco en revisar los cambios. Si todavía no ve el cambio, probablemente sigue pendiente.");
    expect(html(<ViewOnGoogle mapsUri={null} />)).toBe("");
  });

  test("on success, failure and still-reviewing alike — Update on Google, its undo, and Order online (add + undo)", () => {
    const actions = fs.readFileSync("app/actions/gbpCustomerDetails.ts", "utf8");
    expect(actions.match(/mapsUriFor\(c\)/g)?.length).toBe(4); // apply: error + sent/pending; undo: error + sent
    const place = fs.readFileSync("app/actions/gbpPlaceActions.ts", "utf8");
    expect(place.match(/mapsUri: await mapsUriFor\(c\)/g)?.length).toBe(4); // add: error + sent/waiting; undo: error + sent
    const edit = fs.readFileSync("components/gbp/CustomerDetailsGoogleEdit.tsx", "utf8");
    // One message line for Approve and Undo alike: done, waiting and failed.
    expect(edit.match(/<ViewOnGoogle mapsUri=\{message\.mapsUri \?\? null\} \/>/g)?.length).toBe(1);
    expect(edit).toContain("mapsUri: r.mapsUri ?? null });"); // undo done
    expect(edit).toContain("fail(t(locale, key, { fields: fields ?? \"\" }), r.mapsUri ?? null);"); // undo error
    const card = fs.readFileSync("components/gbp/PlatformLinkCard.tsx", "utf8");
    // Add, and its Undo (the strip shown right after adding and on later visits).
    expect(card).toContain('{(step === "sent" || step === "waiting" || error) && <ViewOnGoogle mapsUri={mapsUri} />}');
    expect(card).toContain('{(step === "undone" || error) && <ViewOnGoogle mapsUri={mapsUri} />}');
  });
});
