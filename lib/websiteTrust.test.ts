import { describe, expect, test } from "vitest";
import {
  classifyWebsiteKind,
  compareAddress,
  compareHours,
  comparePhone,
  compareListingInfo,
  detectAbandonedSignals,
  detectSpamSignals,
  extractCityFromAddress,
  findStaleNotices,
  trimNoticeToSentences,
  keyForInfoConflict,
  keyForStaleNotice,
  looksLikePageNotFound,
  parseHoursFromText,
} from "./websiteTrust";

// Oct 10 site-trust detection (hacked/spam, stale notices, abandoned
// signals, info-consistency vs. the Google listing) — see
// lib/websiteTrust.ts's own top-of-file doc for the real Bánh Mì Boy
// case ("Vietnamese Sandwiches") this whole module was built and
// validated against: a genuinely hacked, abandoned WordPress site
// exhibiting all four target patterns at once. BANH_MI_BOY_HTML below
// reproduces that real shape (minus the real surrounding template
// markup) so the suite exercises the exact case the user asked for,
// not just synthetic fixtures.

const BANH_MI_BOY_HTML = `
<html>
<head>
<style>
.hm { display: table-column; }
</style>
</head>
<body>
<header>
  <nav>
    <a href="https://facebook.com/banhmiboy">Facebook</a>
    <a href="https://www.doordash.com/store/banh-mi-boy">Order on DoorDash</a>
  </nav>
</header>
<div class="banner">CLOSED July 4th to 8th!!! Call us at (302) 525-2018</div>
<div class="hm">
  Looking for a <a href="https://fakewatchz.ru/replica">replica richard mille</a> at a great price? Visit our partner site today!
</div>
<article>
  <p>Posted July 11, 2012 - Welcome to our new menu!</p>
</article>
<footer>
  <div class="widget">Please put widget here</div>
  <div class="widget">Please put widget here</div>
  <p>&copy; 2012 Banh Mi Boy</p>
</footer>
</body>
</html>
`;

describe("detectSpamSignals — real Bánh Mì Boy shape", () => {
  test("finds the hidden replica-watch spam (display:table-column, not display:none) with its suspicious link", () => {
    const findings = detectSpamSignals(BANH_MI_BOY_HTML);

    const replica = findings.find((f) => f.category === "replica");
    expect(replica).toBeDefined();
    expect(replica!.matchedPhrase).toBe("replica richard mille");
    expect(replica!.hidden).toBe(true);
    expect(replica!.suspiciousLinks).toContain("https://fakewatchz.ru/replica");
  });

  test("never flags the legitimate Facebook/DoorDash outbound links as suspicious", () => {
    const findings = detectSpamSignals(BANH_MI_BOY_HTML);

    const replica = findings.find((f) => f.category === "replica");
    expect(replica!.suspiciousLinks).not.toContain("https://facebook.com/banhmiboy");
    expect(replica!.suspiciousLinks).not.toContain("https://www.doordash.com/store/banh-mi-boy");
  });

  test("a page with no spam vocabulary at all returns no findings, even with normal outbound links", () => {
    const html = `<html><body><a href="https://facebook.com/realbiz">Facebook</a><p>Welcome to our shop!</p></body></html>`;

    expect(detectSpamSignals(html)).toEqual([]);
  });

  test("false-positive guard: generic words near a spam category's theme never trigger without the exact phrase", () => {
    const html = `<html><body><p>Join us for Casino Night, a charity fundraiser! Also ask about our payday schedule.</p></body></html>`;

    expect(detectSpamSignals(html)).toEqual([]);
  });

  test("the same spam phrase in plainly visible (non-hidden) markup is still a real finding, just hidden:false", () => {
    const html = `<html><body><p>Click here for replica watch deals: <a href="https://spam.example/x">shop now</a></p></body></html>`;

    const findings = detectSpamSignals(html);
    expect(findings).toHaveLength(1);
    expect(findings[0].hidden).toBe(false);
    expect(findings[0].suspiciousLinks).toContain("https://spam.example/x");
  });

  test("display:none hiding is detected the same way as the less-obvious display:table-column", () => {
    const html = `<html><head><style>.x{display:none}</style></head><body><div class="x">buy cialis online now</div></body></html>`;

    const findings = detectSpamSignals(html);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe("pharma");
    expect(findings[0].hidden).toBe(true);
  });

  test("returns at most one finding per category even with repeated hits", () => {
    const html = `<html><body><p>replica rolex here, and another replica breitling there too</p></body></html>`;

    const findings = detectSpamSignals(html);
    expect(findings.filter((f) => f.category === "replica")).toHaveLength(1);
  });
});

describe("findStaleNotices — real Bánh Mì Boy shape + the phone-digit false-positive guard", () => {
  test("a past-dated closure notice (no year stated) resolves to the current year and is reported stale", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const text = "CLOSED July 4th to 8th!!! Call us at (302) 525-2018";

    const findings = findStaleNotices(text, now);

    expect(findings).toHaveLength(1);
    expect(findings[0].resolvedDate).toBe("2026-07-04");
    expect(findings[0].text).toContain("CLOSED July 4th");
  });

  test("never misreads the trailing phone-number digits '2018' as the notice's year", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const text = "CLOSED July 4th to 8th!!! Call us at (302) 525-2018";

    const findings = findStaleNotices(text, now);

    expect(findings[0].resolvedDate.startsWith("2018")).toBe(false);
  });

  test("a notice still within the grace period is NOT reported stale", () => {
    const now = new Date("2026-07-06T00:00:00Z"); // 2 days after July 4th
    const text = "CLOSED July 4th to 8th!!!";

    expect(findStaleNotices(text, now)).toEqual([]);
  });

  test("a notice exactly past the grace period IS reported stale", () => {
    const now = new Date("2026-07-16T00:00:00Z"); // 12 days after July 4th, well past 7-day grace
    const text = "CLOSED July 4th to 8th!!!";

    expect(findStaleNotices(text, now)).toHaveLength(1);
  });

  test("a dateless regular-hours statement is never treated as a notice", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const text = "We are closed Sundays and Mondays.";

    expect(findStaleNotices(text, now)).toEqual([]);
  });

  test("a notice with an explicit, still-future year is never stale", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const text = "We will be closed December 25th, 2027 for the holiday.";

    expect(findStaleNotices(text, now)).toEqual([]);
  });

  test("a notice with an explicit past year is stale", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const text = "Temporarily closed March 1st, 2024 for renovations.";

    const findings = findStaleNotices(text, now);
    expect(findings).toHaveLength(1);
    expect(findings[0].resolvedDate).toBe("2024-03-01");
  });
});

describe("detectAbandonedSignals — real Bánh Mì Boy shape", () => {
  test("finds the 2012 blog post date and both template-leftover widgets, and marks the site abandoned", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const text = "Posted July 11, 2012 - Welcome to our new menu! Please put widget here Please put widget here (c) 2012 Banh Mi Boy";

    const result = detectAbandonedSignals(text, now);

    expect(result.newestDateFound).toBe("2012-07-11");
    expect(result.templateLeftovers).toContain("please put widget here");
    expect(result.looksAbandoned).toBe(true);
  });

  test("a recent date with no template leftovers is NOT abandoned", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const text = "Posted October 1, 2026 - Come try our new banh mi!";

    const result = detectAbandonedSignals(text, now);

    expect(result.looksAbandoned).toBe(false);
    expect(result.templateLeftovers).toEqual([]);
  });

  test("template leftovers alone (no old date at all) are still real evidence of abandonment", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const text = "Welcome to WordPress! This is your very first post.";

    const result = detectAbandonedSignals(text, now);

    expect(result.newestDateFound).toBeNull();
    expect(result.looksAbandoned).toBe(true);
  });

  test("a page with no date and no template leftovers is honestly inconclusive, never flagged old", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const text = "We make the best sandwiches in town. Come visit us!";

    const result = detectAbandonedSignals(text, now);

    expect(result.newestDateFound).toBeNull();
    expect(result.looksAbandoned).toBe(false);
  });

  test("a bare copyright year counts as a real date for staleness, independent of any blog post", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const text = "Copyright 2015 Example Co. All rights reserved.";

    const result = detectAbandonedSignals(text, now);

    expect(result.newestDateFound).toBe("2015-01-01");
    expect(result.looksAbandoned).toBe(true);
  });

  test("takes the NEWEST of multiple real dates found on the page", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const text = "Founded January 1, 2010. Latest update: September 5, 2025. (c) 2010 Example";

    const result = detectAbandonedSignals(text, now);

    expect(result.newestDateFound).toBe("2025-09-05");
    expect(result.looksAbandoned).toBe(false);
  });
});

describe("comparePhone", () => {
  test("matches regardless of country-code/punctuation formatting differences", () => {
    const result = comparePhone("Call us at (302) 525-2018 for orders.", "+1 302-525-2018");

    expect(result).toEqual({ field: "phone", comparison: "matches", siteValue: "(302) 525-2018", googleValue: "+1 302-525-2018" });
  });

  test("conflicts when the site states a real, different phone number", () => {
    const result = comparePhone("Call us at (302) 999-0000.", "+1 302-525-2018");

    expect(result.comparison).toBe("conflicts");
    expect(result.siteValue).toBe("(302) 999-0000");
  });

  test("not_found_on_site (no penalty) when the site mentions no phone-shaped number at all", () => {
    const result = comparePhone("Come visit us downtown!", "+1 302-525-2018");

    expect(result.comparison).toBe("not_found_on_site");
    expect(result.siteValue).toBeNull();
  });

  test("matches if ANY of several real numbers on the page matches Google, even when listed later", () => {
    const result = comparePhone("Corporate: (800) 123-4567. Our shop: (302) 525-2018.", "+1 302-525-2018");

    expect(result.comparison).toBe("matches");
  });

  test("ignores toll-free numbers entirely — never used to confirm a match", () => {
    const result = comparePhone("Call our toll-free line: (800) 525-2018.", "+1 800-525-2018");

    expect(result.comparison).toBe("not_found_on_site");
  });

  test("ignores toll-free numbers entirely — never used as conflicting evidence either", () => {
    const result = comparePhone("Customer service: 1-833-555-0000. Our local shop: (302) 525-2018.", "+1 302-525-2018");

    // The toll-free 833 number is excluded; the real local number matches.
    expect(result.comparison).toBe("matches");
  });

  test("a toll-free number alone, with no local number anywhere, is honestly not_found_on_site, never a false conflict", () => {
    const result = comparePhone("Reach us at our national line: 1-888-555-0000.", "+1 302-525-2018");

    expect(result.comparison).toBe("not_found_on_site");
  });

  test("ignores a number explicitly labeled 'fax' nearby", () => {
    const result = comparePhone("Fax: (302) 999-0000. Phone: (302) 525-2018.", "+1 302-525-2018");

    expect(result.comparison).toBe("matches");
  });

  test("a fax-only page (no other number) is honestly not_found_on_site, never a false conflict", () => {
    const result = comparePhone("Fax: (302) 999-0000.", "+1 302-525-2018");

    expect(result.comparison).toBe("not_found_on_site");
  });

  test("conflict only when the site shows real LOCAL numbers and none of them match", () => {
    const result = comparePhone("Call our other branch: (302) 111-2222.", "+1 302-525-2018");

    expect(result.comparison).toBe("conflicts");
    expect(result.siteValue).toBe("(302) 111-2222");
  });

  test("the real Bagel Emporium case: a catering line never counts as a conflict, even phrased as a question", () => {
    const result = comparePhone("Need Catering? Call us: 914-222-4545", "+1 914-333-0033");

    expect(result.comparison).toBe("not_found_on_site");
    expect(result.siteValue).toBeNull();
  });

  test.each(["catering", "fax", "events", "careers", "jobs", "corporate", "wholesale", "delivery"])(
    "ignores a number labeled '%s' within ~40 chars, in either direction",
    (label) => {
      const result = comparePhone(`${label[0].toUpperCase()}${label.slice(1)}: (302) 999-0000. Main line: (302) 525-2018.`, "+1 302-525-2018");
      expect(result.comparison).toBe("matches");
    }
  );

  test.each(["eventos", "empleos", "carreras", "corporativo", "mayorista", "entrega"])(
    "ignores a number labeled '%s' (Spanish) within ~40 chars",
    (label) => {
      const result = comparePhone(`${label[0].toUpperCase()}${label.slice(1)}: (302) 999-0000. Línea principal: (302) 525-2018.`, "+1 302-525-2018");
      expect(result.comparison).toBe("matches");
    }
  );

  test("the real Brew HaHa! case: 'Main Office 302-427-2739' on its Contact page is never a conflict", () => {
    const result = comparePhone("Main Office 302-427-2739", "+1 302-369-2600");

    expect(result.comparison).toBe("not_found_on_site");
    expect(result.siteValue).toBeNull();
  });

  test.each(["main office", "headquarters", "hq", "corporate office", "administrative office"])(
    "ignores a number labeled '%s' within ~40 chars, in either direction",
    (label) => {
      const capitalized = label.replace(/\b\w/g, (c) => c.toUpperCase());
      const result = comparePhone(`${capitalized}: (302) 999-0000. Main line: (302) 525-2018.`, "+1 302-525-2018");
      expect(result.comparison).toBe("matches");
    }
  );

  test("ignores a number labeled 'oficina principal' (Spanish) within ~40 chars", () => {
    const result = comparePhone("Oficina Principal: (302) 999-0000. Línea local: (302) 525-2018.", "+1 302-525-2018");
    expect(result.comparison).toBe("matches");
  });

  test("a secondary-line label never bleeds across into an EARLIER, unrelated number's own evidence", () => {
    // The two numbers sit close enough together that a naive ~40-char
    // lookback from the second number would otherwise reach back past
    // it into the first number's own "Corporate:" label.
    const result = comparePhone("Corporate: (800) 123-4567. Our shop: (302) 525-2018.", "+1 302-525-2018");

    expect(result.comparison).toBe("matches");
  });

  test("a secondary-line-only page (no other number) is honestly not_found_on_site, never a false conflict", () => {
    const result = comparePhone("Catering inquiries: (302) 999-0000.", "+1 302-525-2018");

    expect(result.comparison).toBe("not_found_on_site");
  });
});

describe("compareAddress", () => {
  test("matches when both the street number and street name's first word appear together", () => {
    const result = compareAddress("Find us at 209 Main Street, Newark.", "209 E Main St, Newark, DE 19711");

    expect(result.comparison).toBe("matches");
  });

  test("conflicts when the site states the same street number but a different street name", () => {
    const result = compareAddress("Find us at 209 Elm Street, Newark.", "209 E Main St, Newark, DE 19711");

    expect(result.comparison).toBe("conflicts");
  });

  test("not_found_on_site (no penalty, honest) when the page states no address at all", () => {
    const result = compareAddress("We make the best sandwiches in town.", "209 E Main St, Newark, DE 19711");

    expect(result.comparison).toBe("not_found_on_site");
  });

  test("the real Yoga Love NY case: a 1-digit street number never produces a false conflict against an unrelated bare digit", () => {
    const result = compareAddress("Book a 1-on-1) today! Retreat in Riviera Maya,", "1 Bridge St, Irvington, NY 10533, USA");

    expect(result.comparison).toBe("not_found_on_site");
  });

  test("a real 2-digit street number still compares normally (matches)", () => {
    const result = compareAddress("Visit us at 10 Bridge Street today!", "10 Bridge St, Irvington, NY 10533, USA");

    expect(result.comparison).toBe("matches");
  });
});

describe("compareHours / parseHoursFromText", () => {
  test("parses a day-range plus a 12-hour time range", () => {
    const entries = parseHoursFromText("Monday - Sunday: 11am - 7pm");

    expect(entries).toHaveLength(1);
    expect(entries[0].days).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(entries[0].openMinutes).toBe(11 * 60);
    expect(entries[0].closeMinutes).toBe(19 * 60);
  });

  test("matches real Google periods within tolerance", () => {
    const googlePeriods = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
      open: { day, hour: 11, minute: 0 },
      close: { day, hour: 19, minute: 0 },
    }));

    const result = compareHours("Monday - Sunday: 11am - 7pm", googlePeriods);

    expect(result.comparison).toBe("matches");
  });

  test("conflicts when the site's stated hours genuinely disagree with Google's", () => {
    const googlePeriods = [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }];

    const result = compareHours("Mon: 11am - 7pm", googlePeriods);

    expect(result.comparison).toBe("conflicts");
  });

  test("a time-mismatch conflict names the exact day and real, formatted times — never raw Google minutes like '420-1020'", () => {
    const googlePeriods = [{ open: { day: 1, hour: 7, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }];

    const result = compareHours("Mon: 11am - 7pm", googlePeriods);

    expect(result.siteValue).toBe("Monday: 11:00 AM–7:00 PM");
    expect(result.googleValue).toBe("Monday: 7:00 AM–5:00 PM");
    expect(result.googleValue).not.toContain("420");
    expect(result.googleValue).not.toContain("1020");
  });

  test("conflicts when the site says Closed on a day Google has real hours for", () => {
    const googlePeriods = [{ open: { day: 6, hour: 11, minute: 0 }, close: { day: 6, hour: 19, minute: 0 } }];

    const result = compareHours("Sat: Closed", googlePeriods);

    expect(result.comparison).toBe("conflicts");
  });

  test("the exact user-requested shape: 'Your website says Sunday: Closed; Google says Sunday: 7:00 AM–5:00 PM'", () => {
    const googlePeriods = [{ open: { day: 0, hour: 7, minute: 0 }, close: { day: 0, hour: 17, minute: 0 } }];

    const result = compareHours("Sun: Closed", googlePeriods);

    expect(result.siteValue).toBe("Sunday: Closed");
    expect(result.googleValue).toBe("Sunday: 7:00 AM–5:00 PM");
  });

  test("never conflicts on a day the site simply doesn't mention", () => {
    const googlePeriods = [{ open: { day: 6, hour: 11, minute: 0 }, close: { day: 6, hour: 19, minute: 0 } }];

    const result = compareHours("Mon: 11am - 7pm", googlePeriods);

    expect(result.comparison).toBe("matches");
  });

  test("not_found_on_site when the page states no parseable hours", () => {
    const result = compareHours("We make the best sandwiches in town.", [
      { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
    ]);

    expect(result.comparison).toBe("not_found_on_site");
  });

  // The real Bing's Bakery case: run-together text with NO spaces
  // between sentences, and "Closed" PRECEDING the day it describes
  // ("...Closed Sunday") rather than following it.
  describe("the real Bing's Bakery case: run-together text, 'Closed' preceding its day", () => {
    const BING_TEXT = "Monday - Friday 7:00 A.M. - 6:00 P.M.Saturday 7:00 A.M. - 5:00 P.M.Closed Sunday";

    test("splits into three correct entries: Mon-Fri 7-6, Sat 7-5 (open, not closed), Sun closed", () => {
      const entries = parseHoursFromText(BING_TEXT);

      expect(entries).toHaveLength(3);
      expect(entries[0]).toMatchObject({ days: [1, 2, 3, 4, 5], openMinutes: 7 * 60, closeMinutes: 18 * 60, closed: false });
      expect(entries[1]).toMatchObject({ days: [6], openMinutes: 7 * 60, closeMinutes: 17 * 60, closed: false });
      expect(entries[2]).toMatchObject({ days: [0], openMinutes: 0, closeMinutes: 0, closed: true });
    });

    test("Saturday's real 7am-5pm genuinely matches Google — never a false 'closed' conflict", () => {
      const result = compareHours(BING_TEXT, [{ open: { day: 6, hour: 7, minute: 0 }, close: { day: 6, hour: 17, minute: 0 } }]);
      expect(result.comparison).toBe("matches");
    });

    test("Sunday is genuinely closed on the site — Google having real Sunday hours is a real conflict", () => {
      const result = compareHours(BING_TEXT, [{ open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 16, minute: 0 } }]);
      expect(result.comparison).toBe("conflicts");
      expect(result.siteValue).toBe("Sunday: Closed");
    });

    test("the whole real shape matches Google exactly (Mon-Fri 7-6, Sat 7-5, Sun closed)", () => {
      const googlePeriods = [
        { open: { day: 1, hour: 7, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } },
        { open: { day: 2, hour: 7, minute: 0 }, close: { day: 2, hour: 18, minute: 0 } },
        { open: { day: 3, hour: 7, minute: 0 }, close: { day: 3, hour: 18, minute: 0 } },
        { open: { day: 4, hour: 7, minute: 0 }, close: { day: 4, hour: 18, minute: 0 } },
        { open: { day: 5, hour: 7, minute: 0 }, close: { day: 5, hour: 18, minute: 0 } },
        { open: { day: 6, hour: 7, minute: 0 }, close: { day: 6, hour: 17, minute: 0 } },
      ];
      expect(compareHours(BING_TEXT, googlePeriods).comparison).toBe("matches");
    });
  });

  // The real Shoe Tech case: real regular hours followed, in the same
  // sentence, by a seasonal/date-limited exception that must never
  // override them.
  describe("the real Shoe Tech case: a seasonal/date-limited exception never overrides real regular hours", () => {
    test("'Sat 9am - 2pm, Closed Saturdays in July and August' parses as OPEN 9-2, not closed", () => {
      const entries = parseHoursFromText("Sat 9am - 2pm, Closed Saturdays in July and August");

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ days: [6], openMinutes: 9 * 60, closeMinutes: 14 * 60, closed: false });
    });

    test("matches Google's real Saturday 9-2 hours — the seasonal exception never causes a false conflict", () => {
      const result = compareHours("Sat 9am - 2pm, Closed Saturdays in July and August", [
        { open: { day: 6, hour: 9, minute: 0 }, close: { day: 6, hour: 14, minute: 0 } },
      ]);
      expect(result.comparison).toBe("matches");
    });

    test.each([
      "Closed during the summer",
      "Closed during the holidays",
      "Closed until March 1",
      "Closed seasonally",
      "Cerrado en julio",
      "Cerrado durante el verano",
    ])("a bare seasonal closure with NO real regular hours ('%s') is honestly not listed, never marked closed", (phrase) => {
      const entries = parseHoursFromText(`Sat: ${phrase}`);
      expect(entries).toHaveLength(0);
    });

    test("a bare seasonal closure with no real hours never produces a conflict — day is simply not listed", () => {
      const result = compareHours("Sat: Closed during the summer", [{ open: { day: 6, hour: 9, minute: 0 }, close: { day: 6, hour: 17, minute: 0 } }]);
      expect(result.comparison).toBe("not_found_on_site");
    });

    test("a real, non-seasonal 'Monday: Closed' still works exactly as before (regression guard)", () => {
      const entries = parseHoursFromText("Monday: Closed");
      expect(entries).toEqual([{ days: [1], openMinutes: 0, closeMinutes: 0, closed: true }]);
    });
  });

  test("item 3: a day the site never mentions at all is honestly 'matches' (not compared), even when Google has real hours for it", () => {
    const result = compareHours("Monday - Friday 9am - 5pm", [
      { open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 16, minute: 0 } }, // Sunday — never mentioned on site
      { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
    ]);
    expect(result.comparison).toBe("matches");
  });

  // Item 4: these two real conflicts (verified live) must survive every
  // fix above, unchanged.
  test("the real Ilda's Salon case stays a real conflict: Monday closed on site vs Google's real Monday hours", () => {
    const result = compareHours("Monday: Closed", [{ open: { day: 1, hour: 12, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }]);
    expect(result.comparison).toBe("conflicts");
    expect(result.siteValue).toBe("Monday: Closed");
  });

  // The real Ilda's Salon page text (verified live): a day name sits
  // on BOTH sides of "Closed" ("Monday Closed Tuesday") — the real
  // disambiguation fix needed on top of the Bing's Bakery fix, since a
  // naive "Closed <Day>" boundary would otherwise swallow "Closed"
  // away from Monday (which it actually describes) while trying to
  // protect Tuesday (which it doesn't).
  describe("the real Ilda's Salon case: a day name on BOTH sides of 'Closed' ('Monday Closed Tuesday')", () => {
    const ILDA_TEXT =
      "Hours Monday Closed Tuesday 9:00 AM – 9:00 PM Wednesday 9:00 AM – 9:00 PM Thursday 9:00 AM – 5:00 PM " +
      "Friday 9:00 AM – 5:00 PM Saturday 9:00 AM – 6:00 PM Sunday 10:00 AM – 4:00 PM";

    test("Monday is genuinely closed; Tuesday keeps its own real 9am-9pm hours — never missing, never swapped", () => {
      const entries = parseHoursFromText(ILDA_TEXT);

      const monday = entries.find((e) => e.days.includes(1))!;
      const tuesday = entries.find((e) => e.days.includes(2))!;
      expect(monday).toMatchObject({ closed: true });
      expect(tuesday).toMatchObject({ openMinutes: 9 * 60, closeMinutes: 21 * 60, closed: false });
    });

    test("the real Monday-closed conflict (the one the user verified live) is detected", () => {
      const result = compareHours(ILDA_TEXT, [{ open: { day: 1, hour: 12, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }]);
      expect(result.comparison).toBe("conflicts");
      expect(result.siteValue).toBe("Monday: Closed");
    });

    test("Tuesday's own real hours also compare correctly against Google (a separate, genuine finding)", () => {
      const result = compareHours(ILDA_TEXT, [{ open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 20, minute: 0 } }]);
      expect(result.comparison).toBe("conflicts");
      expect(result.siteValue).toBe("Tuesday: 9:00 AM–9:00 PM");
      expect(result.googleValue).toBe("Tuesday: 9:00 AM–8:00 PM");
    });
  });

  test("the real Santa Fe Mexican Grill - Newark case stays a real conflict: Mon-Tue 3pm-10pm on site vs Google's 11:30am-10pm", () => {
    const result = compareHours("Monday-Tuesday: 3:00 pm - 10:00 pm", [
      { open: { day: 1, hour: 11, minute: 30 }, close: { day: 1, hour: 22, minute: 0 } },
    ]);
    expect(result.comparison).toBe("conflicts");
    expect(result.siteValue).toBe("Monday: 3:00 PM–10:00 PM");
    expect(result.googleValue).toBe("Monday: 11:30 AM–10:00 PM");
  });
});

describe("compareListingInfo", () => {
  test("always returns exactly 3 entries (phone, address, hours) regardless of what the site states", () => {
    const result = compareListingInfo("We make the best sandwiches in town.", { phone: null, address: null, openingHoursPeriods: null });

    expect(result.map((r) => r.field)).toEqual(["phone", "address", "hours"]);
  });

  test("the real Bánh Mì Boy case: phone matches, address not found on site (honest, no penalty)", () => {
    const result = compareListingInfo(
      "CLOSED July 4th to 8th!!! Call us at (302) 525-2018",
      { phone: "+1 302-525-2018", address: "123 Main St, Newark, DE", openingHoursPeriods: null }
    );

    const phone = result.find((r) => r.field === "phone")!;
    const address = result.find((r) => r.field === "address")!;
    expect(phone.comparison).toBe("matches");
    expect(address.comparison).toBe("not_found_on_site");
  });

  describe("secondaryText (the real Bagel Emporium Contact-page case)", () => {
    test("a match found only in secondaryText upgrades a not_found_on_site primary result", () => {
      const result = compareListingInfo(
        "Need Catering? Call us: 914-222-4545",
        { phone: "+1 914-333-0033", address: null, openingHoursPeriods: null },
        "Call us: 914-333-0033"
      );
      const phone = result.find((r) => r.field === "phone")!;
      expect(phone.comparison).toBe("matches");
    });

    test("a match found only in secondaryText upgrades a conflicting primary result", () => {
      const result = compareListingInfo(
        "Call our other branch: (302) 111-2222.",
        { phone: "+1 302-525-2018", address: null, openingHoursPeriods: null },
        "Call us: (302) 525-2018"
      );
      const phone = result.find((r) => r.field === "phone")!;
      expect(phone.comparison).toBe("matches");
    });

    test("never concatenates the two texts — a day name in siteText and a time in secondaryText must never combine into a fabricated hours entry", () => {
      const result = compareListingInfo(
        "We're open every day!",
        { phone: null, address: null, openingHoursPeriods: [{ open: { day: 1, hour: 10, minute: 0 }, close: { day: 1, hour: 19, minute: 0 } }] },
        "Call us anytime, 10am to sunset."
      );
      const hours = result.find((r) => r.field === "hours")!;
      expect(hours.comparison).toBe("not_found_on_site");
    });

    test("with no secondaryText (undefined, the default) behaves exactly as before", () => {
      const result = compareListingInfo("Come visit us downtown!", { phone: "+1 302-525-2018", address: null, openingHoursPeriods: null });
      expect(result.find((r) => r.field === "phone")!.comparison).toBe("not_found_on_site");
    });
  });

  test("the real Santa Fe Mexican Grill case: a multi-location page's OTHER branch hours never count against this location", () => {
    // A chain homepage listing multiple locations — this business is
    // the Newark branch (Google hours 11:30 AM - 10 PM), but the page
    // also shows the Wilmington branch's own different hours, far away
    // in the page text (outside Newark's own comparison window), right
    // next to a "locations" signal.
    const siteText =
      "Our Locations. Newark: call us anytime, we're the original spot." +
      "x".repeat(2000) +
      "Wilmington: Mon-Sun 3:00 PM - 10:00 PM." +
      "x".repeat(2000) +
      "The Newark team looks forward to seeing you soon!";
    const result = compareListingInfo(siteText, {
      phone: null,
      address: "100 Elkton Rd, Newark, DE 19711",
      openingHoursPeriods: [{ open: { day: 1, hour: 11, minute: 30 }, close: { day: 1, hour: 22, minute: 0 } }],
    });

    const hours = result.find((r) => r.field === "hours")!;
    // Wilmington's "3:00 PM - 10:00 PM" must never be compared against
    // Newark's own real Google hours — honestly not_found_on_site
    // (Newark's own window of text states no parseable hours of its own).
    expect(hours.comparison).toBe("not_found_on_site");
  });

  test("a real single-location site is NEVER narrowed, even when the business's own city happens to appear far from its hours", () => {
    const siteText = "Welcome to our Newark shop! ".padEnd(1500, "x") + " Mon: 9am - 5pm";
    const result = compareListingInfo(siteText, {
      phone: null,
      address: "1 Main St, Newark, DE 19711",
      openingHoursPeriods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }],
    });

    // No "locations" signal on this page at all -> single-location site
    // -> the whole page stays in scope, so the real hours (however far
    // from the city mention) are still found and still match.
    const hours = result.find((r) => r.field === "hours")!;
    expect(hours.comparison).toBe("matches");
  });

  test("the real Claymont Steak Shop case: three locations' hours listed back-to-back in one short block — only THIS location's own hours are used, never a neighbor's", () => {
    // The real page text (verified live): a "Location" list naming all
    // three branches, then an "Hours" list repeating each branch name
    // immediately before its own day-range/time pattern — all within a
    // single short section, close enough together that a generic
    // character-radius window around "Newark" alone would still sweep
    // in Claymont's (the FIRST-listed, and therefore first-compared)
    // neighboring block.
    const siteText =
      "Location Claymont 3526 Philadelphia Pike Claymont, DE 19703 Newark 57 South Main Street Newark, DE 19711-4637 " +
      "Wilmington 2720 Concord Pike Wilmington, DE 19803 Hours Claymont Mon, Tue, Wed, Thur 10:00 AM - 10:00 PM " +
      "Fri, Sat 10:00 AM - 11:00 PM Sun 11:00 AM - 9:00 PM Newark Mon, Tue, Wed, Thur 10 a.m. – 9 p.m. " +
      "Fri, Sat 10 a.m. – 10 p.m. Sun 11 a.m. – 9 p.m Wilmington Mon, Tue, Wed, Thur 10 a.m. – 9 p.m. " +
      "Fri, Sat 10 a.m. – 10 p.m. Sun 11 a.m. – 9 p.m Find us on Facebook";
    // Google's real hours for the Newark location: Mon-Thu 10am-9pm,
    // Fri-Sat 10am-10pm, Sun 11am-9pm — genuinely MATCHES the site's own
    // "Newark" block (Claymont's own block, 10am-10pm Mon-Thu, would
    // conflict if wrongly used instead).
    const googlePeriods = [
      { open: { day: 0, hour: 11, minute: 0 }, close: { day: 0, hour: 21, minute: 0 } },
      { open: { day: 1, hour: 10, minute: 0 }, close: { day: 1, hour: 21, minute: 0 } },
      { open: { day: 2, hour: 10, minute: 0 }, close: { day: 2, hour: 21, minute: 0 } },
      { open: { day: 3, hour: 10, minute: 0 }, close: { day: 3, hour: 21, minute: 0 } },
      { open: { day: 4, hour: 10, minute: 0 }, close: { day: 4, hour: 21, minute: 0 } },
      { open: { day: 5, hour: 10, minute: 0 }, close: { day: 5, hour: 22, minute: 0 } },
      { open: { day: 6, hour: 10, minute: 0 }, close: { day: 6, hour: 22, minute: 0 } },
    ];

    const result = compareListingInfo(siteText, {
      phone: null,
      address: "57 S Main St, Newark, DE 19711, USA",
      openingHoursPeriods: googlePeriods,
    });

    const hours = result.find((r) => r.field === "hours")!;
    expect(hours.comparison).toBe("matches");
  });

  test("the real Miami Watersports case: a short page with several nearby mentions of its own city never fabricates an hours entry from duplicated, overlapping windows", () => {
    // The real page text (verified live, trimmed slightly): short
    // enough that a naive per-mention ±1000-char window around every
    // "Miami" occurrence overlaps and, if simply joined without
    // merging, duplicates the whole page back to back — creating a
    // fabricated adjacency between "every day" (a real day token) and
    // a LATER duplicate "10am to sunset" phrase that was never actually
    // within range on the real, single copy of the page. "sunset" is
    // never a real parseable close time either way.
    const siteText =
      "Contact Us | Miami Watersports. We're at the marina. Open every day, 10am to sunset. Call, email, or just drive over. " +
      "Phone (786) 713-8006. Answered 7 days a week, 10am to sunset. Marina Location Miami Watersports 3400 Pan American Drive " +
      "Pier 9 Slip 4-5 Miami, FL 33133. Hours Open 7 days, 10am to sunset. Miami Watersports 3400 Pan American Drive, Pier 9 Miami.";

    const result = compareListingInfo(siteText, {
      phone: null,
      address: "3400 Pan American Dr Pier 9, Miami, FL 33133, USA",
      openingHoursPeriods: [{ open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 19, minute: 0 } }],
    });

    const hours = result.find((r) => r.field === "hours")!;
    // Honest not_found_on_site — "10am to sunset" genuinely isn't a
    // fixed, parseable close time — never a fabricated "10:00 AM–10:00
    // AM" conflict from duplicated window text.
    expect(hours.comparison).toBe("not_found_on_site");
  });
});

describe("extractCityFromAddress", () => {
  test("pulls the real city from a standard Google-formatted address", () => {
    expect(extractCityFromAddress("209 E Main St, Newark, DE 19711")).toBe("Newark");
  });

  test("null when there's no real address at all", () => {
    expect(extractCityFromAddress(null)).toBeNull();
  });

  test("null when the address has too few comma segments to contain a city", () => {
    expect(extractCityFromAddress("Newark")).toBeNull();
  });
});

describe("classifyWebsiteKind", () => {
  test("a free website-builder address counts separately from an independent domain", () => {
    expect(classifyWebsiteKind("sites.google.com")).toBe("free_builder");
    expect(classifyWebsiteKind("mybusiness.wixsite.com")).toBe("free_builder");
    expect(classifyWebsiteKind("www.godaddysites.com")).toBe("free_builder");
  });

  test("a multi-business directory/aggregator is never counted as the business's own site", () => {
    expect(classifyWebsiteKind("www.facebook.com")).toBe("directory");
    expect(classifyWebsiteKind("www.yelp.com")).toBe("directory");
    expect(classifyWebsiteKind("linktr.ee")).toBe("directory");
  });

  test("any other real domain is independent", () => {
    expect(classifyWebsiteKind("banhmiboy.com")).toBe("independent");
    expect(classifyWebsiteKind("www.example.com")).toBe("independent");
  });
});

describe("looksLikePageNotFound", () => {
  test("recognizes the real Wonder The Grove Newark 'Page Not Found' shape", () => {
    expect(looksLikePageNotFound("Page Not Found. The page you are looking for has been moved or deleted.")).toBe(true);
  });

  test("recognizes the Spanish equivalent", () => {
    expect(looksLikePageNotFound("Página no encontrada. Lo sentimos.")).toBe(true);
  });

  test("never flags real working page content, even content that mentions '404' in passing", () => {
    expect(looksLikePageNotFound("Our shop is located at 404 Main Street. Welcome!")).toBe(false);
  });
});

describe("owner-override keys", () => {
  test("keyForStaleNotice is stable for the same notice text", () => {
    const finding = { text: "CLOSED July 4th to 8th!!!", resolvedDate: "2026-07-04" };

    expect(keyForStaleNotice(finding)).toBe(keyForStaleNotice({ ...finding, resolvedDate: "2099-01-01" }));
    expect(keyForStaleNotice(finding)).toBe("stale_notice:CLOSED July 4th to 8th!!!");
  });

  test("keyForInfoConflict is keyed by field only, stable across different values", () => {
    const finding = { field: "phone" as const, comparison: "conflicts" as const, siteValue: "555-0000", googleValue: "555-1111" };

    expect(keyForInfoConflict(finding)).toBe("info_conflict:phone");
    expect(keyForInfoConflict({ ...finding, siteValue: "999-9999" })).toBe(keyForInfoConflict(finding));
  });
});

describe("trimNoticeToSentences — display-only trim of a stale notice to whole sentences", () => {
  test("the real Bánh Mì Boy window starts at the notice, not mid-word, and drops the trailing hours/footer text", () => {
    expect(
      trimNoticeToSentences(
        "ion. Finding great. CLOSED July 4th to 8th!!! Open Daily: Monday - Sunday: 11am - 7pm / (302) 525-2018 Facebook Twitter"
      )
    ).toBe("CLOSED July 4th to 8th!!!");
  });

  test("keeps a multi-word sentence whose keyword sits before the date", () => {
    expect(trimNoticeToSentences("our menu. We will be closed for the holiday on Dec 25. See you soon")).toBe(
      "We will be closed for the holiday on Dec 25."
    );
  });

  test("no terminator after the date keeps the rest of the window", () => {
    expect(trimNoticeToSentences("Thanks. Closed July 4th")).toBe("Closed July 4th");
  });

  test("no date found falls back to the original text unchanged", () => {
    expect(trimNoticeToSentences("ion. Closed for renovation")).toBe("ion. Closed for renovation");
  });
});
