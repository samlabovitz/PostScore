// Day 23 2d-5: no code reads Google's listing values from the saved
// `businesses` columns any more — pages, emails, actions, jobs and
// scripts read them live (lib/ownerListing.server.ts) or show the
// owner's confirmed details (lib/ownerDetails.server.ts). This must pass
// before those columns are cleared.
import { describe, expect, test } from "vitest";
import { savedGoogleReads, selectedColumns } from "@/test/savedGoogleColumns";

describe("no reader of the saved Google columns on businesses", () => {
  test("app, lib, components, netlify and scripts: none", () => {
    const reads = savedGoogleReads(process.cwd());
    expect(reads.map((r) => `${r.file}:${r.line} ${r.columns.join(", ")}`)).toEqual([]);
  });

  test("the scan finds what it should (aliases, JSON paths, embedded selects)", () => {
    expect(selectedColumns("id, name, shown:address, website_analysis_json->>builder, businesses(name)")).toEqual(["id", "name", "address", "website_analysis_json", "businesses"]);
  });
});
