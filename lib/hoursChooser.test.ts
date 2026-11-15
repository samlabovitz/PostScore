import { describe, expect, test } from "vitest";
import { choiceState, compareRows, fixesFor, managedSiteContact, parseStoredChoice, startHoursFromHash } from "@/lib/hoursChooser";
import { weekFromSite } from "@/lib/gbpProfileEdits";

// The hours-mismatch chooser's rules: the diff table, routing to the other
// side only, the remembered choice and the automatic Done ✓.

describe("hours chooser", () => {
  test("the diff table: Monday first; Google's own words when it couldn't be read live", () => {
    const site = weekFromSite([{ day: 1, closed: false, open: 570, close: 1020 }]);
    const rows = compareRows(null, site, "en", ["Monday: 10:00 AM – 5:00 PM", "Tuesday: Closed"]);
    expect(rows[0]).toEqual({ day: 1, google: "10:00 AM – 5:00 PM", site: "9:30 AM – 5:00 PM", differs: true });
    expect(rows[1]).toMatchObject({ day: 2, google: "Closed", site: "Closed", differs: false });
  });

  test("routing: only the other side is fixed", () => {
    expect(fixesFor("website")).toEqual({ google: true, website: false });
    expect(fixesFor("google")).toEqual({ google: false, website: true });
    expect(fixesFor("own")).toEqual({ google: true, website: true });
    expect(fixesFor(null)).toEqual({ google: false, website: false });
  });

  test("remembered until a scan shows they match, then Done", () => {
    const stored = parseStoredChoice(JSON.stringify({ choice: "google", at: "2026-11-15T12:00:00Z" }));
    expect(choiceState(stored, true)).toBe("chosen");
    expect(choiceState(stored, false)).toBe("done");
    expect(choiceState(null, false)).toBe("none");
    expect(parseStoredChoice("{bad")).toBeNull();
  });

  test("the hours editor hand-off", () => {
    expect(startHoursFromHash("#edit-hours?use=website", () => null)).toBe("website");
    const week = weekFromSite([{ day: 1, closed: false, open: 540, close: 1020 }]);
    expect(startHoursFromHash("#edit-hours?use=own", () => JSON.stringify(week))).toEqual(week);
    expect(startHoursFromHash("#edit-hours", () => null)).toBeNull();
  });

  test("Ask Sam: only for a listed managed host, with a contact set", () => {
    const env = { MANAGED_SITE_HOSTS: "rooted.example, www.hairexpress.example", MANAGED_SITE_CONTACT_EMAIL: "sites@example.com" };
    expect(managedSiteContact("https://www.rooted.example/menu", env)).toBe("sites@example.com");
    expect(managedSiteContact("https://hairexpress.example", env)).toBe("sites@example.com");
    expect(managedSiteContact("https://other.example", env)).toBeNull();
    expect(managedSiteContact("https://rooted.example", { MANAGED_SITE_HOSTS: "rooted.example" })).toBeNull();
  });
});
