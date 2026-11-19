// Day 23 2d-5: names in a long list load as rows scroll into view, at most
// 25 live reads per page view, then "Load more names" (lib/lazyNames.ts).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const shownNamesFor = vi.fn();
vi.mock("@/lib/ownerDetails.server", async (o) => ({ ...(await o<object>()), shownNamesFor: (...args: unknown[]) => shownNamesFor(...args) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }) }));

import { firstWaiting, LIVE_NAMES_PER_VIEW, liveBatch } from "./lazyNames";
import { loadBusinessNames } from "@/app/actions/businesses";
import { LazyBusinessName, LazyNamesProvider, LoadMoreNames } from "@/components/business/LazyBusinessName";
import { readFileSync } from "node:fs";
import { t } from "@/lib/i18n";

const notRead = { name: null, address: null, unavailable: false, notRead: true };

describe("the budget", () => {
  test("at most 25 live reads per page view (or per “Load more names”), in list order", () => {
    expect(LIVE_NAMES_PER_VIEW).toBe(25);
    const ids = Array.from({ length: 30 }, (_, i) => `b${i}`);
    expect(liveBatch(ids, 25)).toEqual({ live: ids.slice(0, 25), cachedOnly: ids.slice(25) });
    expect(liveBatch(ids, 3).live).toEqual(["b0", "b1", "b2"]);
    expect(liveBatch(ids, 0).live).toEqual([]);
    expect(liveBatch(ids, 99).live).toHaveLength(25);
  });

  test("“Load more names” goes before the first row, in list order, still waiting", () => {
    expect(firstWaiting(["a", "b", "c", "d"], new Set(["d", "b"]))).toBe("b");
    expect(firstWaiting(["a", "b"], new Set())).toBeNull();
  });

  test("the button, EN + ES; both lists place it before each row (shown only at the first one waiting)", () => {
    expect(t("en", "dashboard.home.loadMoreNames")).toBe("Load more names");
    expect(t("es", "dashboard.home.loadMoreNames")).toBe("Cargar más nombres");
    // Nothing waiting on first render: no button.
    expect(renderToStaticMarkup(<LazyNamesProvider><LoadMoreNames beforeId="b1" locale="en" /></LazyNamesProvider>)).toBe("");
    expect(readFileSync("app/page.tsx", "utf8")).toContain("<LoadMoreNames beforeId={business.id} locale={locale} />");
    expect(readFileSync("app/business/[id]/settings/page.tsx", "utf8")).toContain('<LoadMoreNames as="li" className="sm:col-span-2" beforeId={b.id} locale={locale} />');
    // Past the budget a row keeps its placeholder: "Your business" only for a read that came back unavailable.
    const view = readFileSync("components/business/LazyBusinessName.tsx", "utf8");
    expect(view).toContain("const read = ids.filter((id) => got[id] && !got[id].notRead);");
  });
});

describe("loadBusinessNames", () => {
  beforeEach(() => shownNamesFor.mockReset());

  test("names already read cost nothing; the rest are read live within what's left; past it, not read", async () => {
    shownNamesFor.mockImplementation(async (_db: unknown, ids: string[] = [], opts: { live?: unknown } = {}) =>
      new Map(ids.map((id) => [id, opts.live === "cached" ? (id === "hit" ? { name: "Cached", address: "1 St", unavailable: false } : notRead) : { name: `Live ${id}`, address: null, unavailable: false }]))
    );
    const r = await loadBusinessNames(["hit", "a", "b", "c"], 2);
    expect(r).toEqual({
      status: "ok",
      liveUsed: 2,
      names: { hit: { name: "Cached", address: "1 St", unavailable: false }, a: { name: "Live a", address: null, unavailable: false }, b: { name: "Live b", address: null, unavailable: false }, c: notRead },
    });
    // The live read is only for the misses within the budget.
    expect(shownNamesFor).toHaveBeenLastCalledWith(expect.anything(), ["a", "b"], { live: true });
    shownNamesFor.mockClear();
    expect((await loadBusinessNames(["a", "b"], 0)) as { liveUsed: number }).toMatchObject({ liveUsed: 0 });
    // No budget left: only the cache is read.
    expect(shownNamesFor.mock.calls.filter((c) => (c[2] as { live?: unknown } | undefined)?.live === true)).toHaveLength(0);
  });
});

describe("a row", () => {
  const row = (initial: Parameters<typeof LazyBusinessName>[0]["initial"], locale: "en" | "es" = "en") =>
    renderToStaticMarkup(
      <LazyNamesProvider>
        <LazyBusinessName businessId="b1" initial={initial} locale={locale} nameClassName="n" addressClassName="a" noAddressLine="No address on file" />
      </LazyNamesProvider>
    );

  test("not read yet (or waiting for “Load more names”): a small placeholder, never “Your business” or a saved value", () => {
    const html = row(notRead);
    expect(html).toContain('data-testid="business-name-loading"');
    expect(html).not.toContain("Your business");
  });

  test("known: the name and address; Google couldn't be read: the neutral name and the line saying so (EN + ES)", () => {
    expect(row({ name: "Kee's Cookies", address: "306 Main St", unavailable: false })).toContain("306 Main St");
    expect(row({ name: "Kee's Cookies", address: null, unavailable: false })).toContain("No address on file");
    const down = row({ name: null, address: null, unavailable: true });
    expect(down).toContain("Your business");
    expect(down).toContain("Couldn&#x27;t load from Google right now");
    const es = row({ name: null, address: null, unavailable: true }, "es");
    expect(es).toContain("Su negocio");
    expect(es).toContain("No se pudo cargar desde Google en este momento");
  });
});
