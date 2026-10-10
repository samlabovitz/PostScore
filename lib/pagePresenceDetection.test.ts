import { describe, expect, test } from "vitest";
import {
  ABOUT_PAGE_KEYWORDS,
  SERVICES_PAGE_KEYWORDS,
  aboutContentPasses,
  countDistinctPrices,
  extractMainContentHtml,
  extractVisibleText,
  findKeywordSection,
  findPdfMenuLink,
  hasRealListedItems,
  matchesKeyword,
  servicesContentPasses,
  wordCount,
} from "./pagePresenceDetection";

// A real nav/header fixture, modeled on Endless Nails' actual markup
// (Day 4 Step 2c dry test) — a site-wide header with a <nav> full of
// short link text, repeated on every page. Word counts/listed-items
// must ignore this entirely; only what's inside <main> counts.
const SITE_HEADER = `
  <header class="site-header">
    <a class="brand" href="/">Endless Nails Newark, Delaware</a>
    <nav class="site-nav" aria-label="Primary">
      <a href="/">Home</a>
      <a href="/services/">Services</a>
      <a href="/about/">About</a>
      <a href="/nail-guides/">Nail Guides</a>
      <a href="/faq/">FAQ</a>
      <a href="/contact/">Contact</a>
      <a class="nav-cta" href="https://lacquer.beauty/book">Book Now</a>
    </nav>
  </header>
`;
const SITE_FOOTER = `<footer class="site-footer"><p>Copyright Endless Nails. All rights reserved. Newark Delaware nail salon.</p></footer>`;

describe("extractVisibleText — Day 4 Task: HTML comments/noscript/template are never visible content (real Bagel Emporium bug fix)", () => {
  test("the real Bagel Emporium case: a commented-out <p> never leaks its text into 'visible' content", () => {
    // Exact real shape (fetched directly for this fix): a real <h2>
    // "Welcome to Bagel Emporium" followed by an HTML comment wrapping
    // a <p> — genuinely invisible to any real visitor. The OLD bug: a
    // naive /<[^>]+>/ tag-stripper stops at the comment's OWN first
    // `>` (closing <p style="...">), so "YOM KIPPUR PRE-ORDERING IS
    // DONE..." leaked straight into extracted text as if real.
    const html =
      '<h2>Welcome to Bagel Emporium</h2> <!--<p style="text-align: center;">YOM KIPPUR PRE-ORDERING IS DONE BUT WE ARE OPEN MONDAY FOR WALK-INS</p>-->';
    const text = extractVisibleText(html);
    expect(text).not.toContain("YOM KIPPUR");
    expect(text).not.toContain("-->");
    expect(text).toContain("Welcome to Bagel Emporium");
  });

  test("a comment containing its own stray unmatched tag never desynchronizes stripping of what follows", () => {
    const html = "<!-- <div> unterminated --><p>Real visible sentence after the comment.</p>";
    const text = extractVisibleText(html);
    expect(text).not.toContain("unterminated");
    expect(text).toContain("Real visible sentence after the comment.");
  });

  test("<noscript> fallback content is never treated as real visible text", () => {
    const html = "<p>Real content.</p><noscript>Please enable JavaScript to view this site properly.</noscript>";
    const text = extractVisibleText(html);
    expect(text).not.toContain("enable JavaScript");
    expect(text).toContain("Real content.");
  });

  test("<template> content is inert and never counted as real visible text", () => {
    const html = '<p>Real content.</p><template id="row"><li>Ghost item never actually rendered</li></template>';
    const text = extractVisibleText(html);
    expect(text).not.toContain("Ghost item");
    expect(text).toContain("Real content.");
  });

  test("<script>/<style> are still stripped (regression guard — pre-existing behavior)", () => {
    const html = "<style>.x{color:red}</style><script>var x = 'not real content';</script><p>Real content.</p>";
    const text = extractVisibleText(html);
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("not real content");
    expect(text).toContain("Real content.");
  });
});

describe("extractMainContentHtml — comment/script/style/noscript/template are stripped before any heading/li counting", () => {
  test("a <li> hidden inside an HTML comment is never counted toward hasRealListedItems", () => {
    const html =
      "<main><p>Short intro.</p><!-- <ul><li>Fake 1</li><li>Fake 2</li><li>Fake 3</li></ul> --></main>";
    const main = extractMainContentHtml(html);
    expect((main.match(/<li\b/gi) ?? []).length).toBe(0);
  });

  test("a heading hidden inside an HTML comment is never matched by findKeywordSection", () => {
    const html = "<main><!-- <h2>About Us</h2><p>Fake about content that should never be read.</p> --><p>Real page text.</p></main>";
    const main = extractMainContentHtml(html);
    const section = findKeywordSection(main, ABOUT_PAGE_KEYWORDS);
    expect(section).toBeNull();
  });
});

describe("extractMainContentHtml — Day 4 Step 2c: nav/header/footer never counts as main content", () => {
  test("when <main> exists, only its content is kept — the real Endless Nails case", () => {
    const html = `<html><body>${SITE_HEADER}<main class="page-main"><h1>About Endless Nails</h1><p>A nail salon in Newark, Delaware.</p></main>${SITE_FOOTER}</body></html>`;
    const main = extractMainContentHtml(html);
    expect(main).toContain("About Endless Nails");
    expect(main).not.toContain("Nail Guides");
    expect(main).not.toContain("Copyright Endless Nails");
  });

  test("a <nav> nested INSIDE <main> is still excluded (a secondary in-page nav)", () => {
    const html = `<main><nav><a href="#a">Jump to A</a><a href="#b">Jump to B</a></nav><h1>Real heading</h1><p>Real paragraph text.</p></main>`;
    const main = extractMainContentHtml(html);
    expect(main).not.toContain("Jump to A");
    expect(main).toContain("Real heading");
  });

  test("with no <main> at all, falls back to stripping top-level <header>/<footer>", () => {
    const html = `<html><body>${SITE_HEADER}<div class="content"><h1>About</h1><p>Real content here.</p></div>${SITE_FOOTER}</body></html>`;
    const main = extractMainContentHtml(html);
    expect(main).toContain("Real content here");
    expect(main).not.toContain("Nail Guides");
    expect(main).not.toContain("Copyright Endless Nails");
  });
});

describe("Day 4 Step 2c decision #1: nav-only text must NOT count toward About/Services", () => {
  test("a page whose only text is nav/header/footer boilerplate fails aboutContentPasses, even though the RAW page has real words", () => {
    const html = `<html><body>${SITE_HEADER}<main><h1>About</h1></main>${SITE_FOOTER}</body></html>`;
    const rawText = extractVisibleText(html);
    expect(wordCount(rawText)).toBeGreaterThan(0); // the raw page DOES have some real words (nav/footer text)...
    const main = extractMainContentHtml(html);
    const mainText = extractVisibleText(main);
    expect(wordCount(mainText)).toBeLessThan(wordCount(rawText)); // ...but main-content-only has strictly fewer
    expect(aboutContentPasses(mainText)).toBe(false); // ...and none of them are real About content
  });

  test("confirms it DOES pass once there's real body content in <main>, same real Endless Nails About page shape", () => {
    const html = `<html><body>${SITE_HEADER}<main class="page-main">
      <h1>About Endless Nails</h1>
      <p>Endless Nails is a nail salon on S Main St in Newark, Delaware. We offer manicures, pedicures, and gel polish services. Open six days a week, we serve the Newark community with professional nail care and friendly, experienced technicians who take real pride in every appointment.</p>
    </main>${SITE_FOOTER}</body></html>`;
    const main = extractMainContentHtml(html);
    const text = extractVisibleText(main);
    expect(aboutContentPasses(text)).toBe(true);
  });
});

describe("findKeywordSection — Day 4 Step 2c decision/dry-test fix: nested sub-headings (Colorful Yun Nan 'Our Menu' case)", () => {
  const YUN_NAN_MENU_HTML = `
    <h1>Colorful Yun Nan</h1>
    <h2>About Colorful Yun Nan</h2>
    <p>Welcome to Colorful Yun Nan, your destination for discovering rich flavors and culinary traditions.</p>
    <h2>Our Menu</h2>
    <h3>Appetizers</h3>
    <p>Crispy Spring Rolls - Golden-fried vegetable rolls served with sweet chili sauce. $6.95</p>
    <h3>Soup</h3>
    <p>Wonton Soup - Delicate pork wontons in a savory broth. $5.95</p>
    <h3>Chicken Entrées</h3>
    <p>Kung Pao Chicken - Spicy stir-fried chicken with peanuts and chili peppers, tossed in a savory sauce. $14.95</p>
    <h3>Beef Entrées</h3>
    <p>Mongolian Beef - Tender sliced beef stir-fried with scallions in a rich, slightly sweet sauce. $15.95</p>
    <h2>Hours</h2>
    <p>Open daily 11am-9pm.</p>
  `;

  test("a matched h2 section extends through its own h3 sub-headings and stops only at the next h2 — not the very next heading of any level", () => {
    const section = findKeywordSection(YUN_NAN_MENU_HTML, SERVICES_PAGE_KEYWORDS);
    expect(section).not.toBeNull();
    expect(section!.text).toContain("Appetizers");
    expect(section!.text).toContain("Crispy Spring Rolls");
    expect(section!.text).toContain("Chicken Entrées");
    expect(section!.text).toContain("Kung Pao Chicken");
    // Must NOT bleed into the next real h2 section.
    expect(section!.text).not.toContain("Open daily");
  });

  test("the naive 'stop at the very next heading of any level' approach would have failed this (regression guard)", () => {
    // Simulates the FIRST, buggy dry-test attempt: section is only the
    // gap between "Our Menu" (h2) and "Appetizers" (h3) — essentially
    // empty. The real rule (equal-or-higher level) must do better.
    const section = findKeywordSection(YUN_NAN_MENU_HTML, SERVICES_PAGE_KEYWORDS);
    expect(wordCount(section!.text)).toBeGreaterThan(10);
  });

  test("services content now genuinely passes for a categorized menu like this", () => {
    const section = findKeywordSection(YUN_NAN_MENU_HTML, SERVICES_PAGE_KEYWORDS)!;
    expect(servicesContentPasses(section.html, section.text)).toBe(true);
  });

  test("returns null when no heading matches any keyword", () => {
    const html = `<h1>Welcome</h1><p>Just a generic homepage with no matching section.</p>`;
    expect(findKeywordSection(html, ABOUT_PAGE_KEYWORDS)).toBeNull();
  });
});

describe("findKeywordSection — Day 4 Task: pseudo-heading detection (real Yoga Box case — no real <h#> tag at all)", () => {
  // The REAL main-content HTML from https://www.yogabox.com/hollywood/
  // (fetched directly for this fix): no <h1>-<h6> tag anywhere near
  // this content — the page builder styles its "heading" as a bolded
  // paragraph instead.
  const YOGA_BOX_HOMEPAGE_HTML = `
    <p><b>Welcome to Yoga Box Hollywood — Our First Los Angeles Studio!</b></p>
    <p>Situated at <strong>1011 Cole Ave</strong>, the Yoga Box Hollywood studio merges LA's dynamic spirit with the transformative power of yoga. This isn't just another yoga class; it's a revolution in fitness and well-being.</p>
    <p>At Yoga Box Hollywood, our expert instructors are dedicated to guiding you from one breakthrough to the next. Our state-of-the-art facility is designed for top-tier performance and deep relaxation.</p>
    <p>Are you ready to step onto the mat? We're offering all new members a chance to start strong with our 3-Free Class Trial. Grab your mats and towels, and join us in the heart of Hollywood.</p>
    <p><b>Class Schedule</b></p>
    <p>See our full weekly schedule below.</p>
  `;

  test("finds the real Yoga Box narrative via its bolded pseudo-heading, with no real <h#> tag anywhere", () => {
    expect(/<h[1-6][\s>]/i.test(YOGA_BOX_HOMEPAGE_HTML)).toBe(false); // confirms there's genuinely no real heading to find
    const section = findKeywordSection(YOGA_BOX_HOMEPAGE_HTML, ABOUT_PAGE_KEYWORDS);
    expect(section).not.toBeNull();
    expect(section!.text).toContain("1011 Cole Ave");
    expect(section!.text).toContain("expert instructors");
    // Must stop at the NEXT pseudo-heading ("Class Schedule"), never bleed past it.
    expect(section!.text).not.toContain("weekly schedule");
    expect(aboutContentPasses(section!.text)).toBe(true);
  });

  test("a bolded SENTENCE in the middle of ordinary prose is never mistaken for a pseudo-heading", () => {
    const html = `<p>We opened in 2010 and <b>we are proud to serve this community every single day</b> with fresh ingredients and real care.</p>`;
    // The whole block isn't wrapped in <b> — only a phrase mid-sentence — so this must never register as a heading at all.
    expect(findKeywordSection(html, ABOUT_PAGE_KEYWORDS)).toBeNull();
  });

  test("a long bolded paragraph (over MAX_PSEUDO_HEADING_WORDS) is prose, not a heading", () => {
    const longBold = `<p><b>${"This is a very long bolded paragraph that goes on and on and on and on and on and on and on and on and on and well past what any real heading would ever say. ".repeat(1)}</b></p>`;
    expect(findKeywordSection(longBold, ABOUT_PAGE_KEYWORDS)).toBeNull();
  });

  test("real-world generic marketing filler — a bolded 'Welcome to X' heading followed by only CTA/button text — must NOT count (real Bagel Emporium case, now fixed)", () => {
    // Real shape (fetched directly for this fix), AFTER the separate
    // HTML-comment-stripping bug fix: a real <h2> "Welcome to Bagel
    // Emporium", followed by a genuinely invisible commented-out line
    // and nothing but promotional button links — no real narrative.
    const html = `
      <h2>Welcome to <br>Bagel Emporium</h2>
      <!--<p style="text-align: center;">YOM KIPPUR PRE-ORDERING IS DONE BUT WE ARE OPEN MONDAY FOR WALK-INS</p>-->
      <div style="display: none;"><a href="#">YOM KIPPUR PRE-ORDERING IS DONE</a></div>
      <div><a href="https://www.goldbelly.com/restaurants/bagel-emporium/">Ship Nationwide on Goldbelly&reg;</a></div>
      <div><a href="order-online/index.html">SKIP THE LINE - ORDER ONLINE</a></div>
    `;
    const section = findKeywordSection(html, ABOUT_PAGE_KEYWORDS);
    // A heading match is expected (the real <h2> does say "Welcome to") —
    // but the real, honest content behind it is far too thin to pass.
    expect(section === null || aboutContentPasses(section.text)).toBe(false);
  });

  test("a short, generic promotional pseudo-heading with no real narrative after it must NOT count", () => {
    const html = `<p><b>Welcome to our store!</b></p><p>Shop now and save big this weekend only.</p>`;
    const section = findKeywordSection(html, ABOUT_PAGE_KEYWORDS);
    expect(section === null || aboutContentPasses(section.text)).toBe(false);
  });
});

describe("hasRealListedItems — real evidence of a list, not just a heading", () => {
  test("enough <li> elements counts", () => {
    const html = `<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>`;
    expect(hasRealListedItems(html, "Item 1 Item 2 Item 3")).toBe(true);
  });

  test("enough repeated sub-headings counts (a 'Service 01 / Service 02' pattern)", () => {
    const html = `<h3>Service 01</h3><h3>Service 02</h3>`;
    expect(hasRealListedItems(html, "Service 01 Service 02")).toBe(true);
  });

  test("a visible $price counts", () => {
    expect(hasRealListedItems("<p>Haircut $25</p>", "Haircut $25")).toBe(true);
  });

  test("a heading with no real list/price/sub-headings does not count", () => {
    expect(hasRealListedItems("<h2>Our Services</h2><p>We do great work.</p>", "Our Services We do great work.")).toBe(
      false
    );
  });

  test("nav <li>s alone (fewer than the threshold) don't count", () => {
    const html = `<li>Home</li><li>About</li>`; // only 2, below MIN_LIST_ITEMS_SERVICES (3)
    expect(hasRealListedItems(html, "Home About")).toBe(false);
  });
});

describe("Day 4 Step 2c decision #7: a Spanish-content business", () => {
  test("Spanish About keywords match a real 'Sobre nosotros' section with substantial Spanish text", () => {
    const html = `
      <h1>Bienvenidos</h1>
      <h2>Sobre nosotros</h2>
      <p>Somos un restaurante familiar establecido en Newark desde hace más de quince años. Nos especializamos en comida casera, preparada con ingredientes frescos todos los días. Nuestro equipo está comprometido a ofrecer un servicio cálido y auténtico a cada cliente que nos visita.</p>
      <h2>Horario</h2>
      <p>Abierto todos los días.</p>
    `;
    const section = findKeywordSection(html, ABOUT_PAGE_KEYWORDS);
    expect(section).not.toBeNull();
    expect(aboutContentPasses(section!.text)).toBe(true);
    expect(section!.text).not.toContain("Abierto todos los días");
  });

  test("Spanish Services keywords ('Servicios') match a real listed services section", () => {
    const html = `
      <h1>Bienvenidos</h1>
      <h2>Servicios</h2>
      <p>Ofrecemos una amplia variedad de servicios reales de cuidado de uñas para nuestros clientes en Newark, Delaware, con técnicos experimentados y productos de alta calidad en cada cita que realizamos todos los días de la semana, con mucho cuidado y atención personalizada para cada persona que nos visita, sin importar si es su primera vez en nuestro salón o si ya nos visita de forma regular desde hace mucho tiempo.</p>
      <ul>
        <li>Manicura clásica</li>
        <li>Pedicura con spa</li>
        <li>Manicura de gel</li>
      </ul>
      <h2>Horario</h2>
    `;
    const section = findKeywordSection(html, SERVICES_PAGE_KEYWORDS);
    expect(section).not.toBeNull();
    expect(servicesContentPasses(section!.html, section!.text)).toBe(true);
  });

  test("matchesKeyword recognizes every Spanish About/Services keyword", () => {
    expect(matchesKeyword("Nosotros", ABOUT_PAGE_KEYWORDS)).not.toBeNull();
    expect(matchesKeyword("Sobre nosotros", ABOUT_PAGE_KEYWORDS)).not.toBeNull();
    expect(matchesKeyword("Quiénes somos", ABOUT_PAGE_KEYWORDS)).not.toBeNull();
    expect(matchesKeyword("Nuestra historia", ABOUT_PAGE_KEYWORDS)).not.toBeNull();
    expect(matchesKeyword("Servicios", SERVICES_PAGE_KEYWORDS)).not.toBeNull();
    expect(matchesKeyword("Menú", SERVICES_PAGE_KEYWORDS)).not.toBeNull();
    expect(matchesKeyword("Productos", SERVICES_PAGE_KEYWORDS)).not.toBeNull();
    expect(matchesKeyword("Tienda", SERVICES_PAGE_KEYWORDS)).not.toBeNull();
    expect(matchesKeyword("Precios", SERVICES_PAGE_KEYWORDS)).not.toBeNull();
  });
});

describe("aboutContentPasses / servicesContentPasses thresholds", () => {
  test("About needs real substance, not a one-line teaser", () => {
    expect(aboutContentPasses("Family owned since 1995.")).toBe(false);
  });

  test("Services needs both real words AND real listed items — words alone aren't enough", () => {
    const longProseNoList =
      "We pride ourselves on being the best in the business and have been serving this community for a very long time with real dedication and genuine care for every single customer who walks through our doors each and every single day of the week, rain or shine, no matter what happens outside, because that is simply the kind of real, honest business we have always tried our very best to be.";
    expect(wordCount(longProseNoList)).toBeGreaterThanOrEqual(60);
    expect(servicesContentPasses("<p>" + longProseNoList + "</p>", longProseNoList)).toBe(false);
  });
});

describe("countDistinctPrices", () => {
  test("counts distinct dollar amounts, not raw occurrences", () => {
    expect(countDistinctPrices("$119 Unlimited Monthly, $103 5 Classes, $190 10 Classes, $25 Drop In")).toBe(4);
  });

  test("the same price repeated counts once", () => {
    expect(countDistinctPrices("$25 Drop In. Also $25 for a single class pass.")).toBe(1);
  });

  test("no prices at all is zero", () => {
    expect(countDistinctPrices("No prices mentioned here at all.")).toBe(0);
  });
});

describe("servicesContentPasses — Day 4 Task: a real, terse price list (Yoga Box case) vs an incidental price mention", () => {
  // The REAL main-content text extracted from
  // https://www.yogabox.com/hollywood/pricing/ (fetched directly for
  // this fix) — 51 real words, 0 <li>s, 3 sub-headings, 4 distinct real
  // prices. The dry test said "found" only because it read 5,831 words
  // of boilerplate (a huge nav/app-download widget outside <main>,
  // contributing 2,380 <li>s); the real, main-content-only extraction
  // is this short, genuine price list.
  const YOGA_BOX_PRICING_HTML = `<main>
    <h1>Pricing</h1>
    <p>New to Yoga Box? New customers, get your free trial below or buy a membership. (Expires 7 days from activation)</p>
    <h2>FREE TRIAL</h2>
    <p>Month to Month $ 119 Unlimited Monthly Book Now</p>
    <h2>Packages</h2>
    <p>$ 103 5 Classes Book Now $ 190 10 Classes Book Now $ 25 Drop In Book Now</p>
  </main>`;
  const yogaBoxText = extractVisibleText(extractMainContentHtml(YOGA_BOX_PRICING_HTML));

  test("the real Yoga Box pricing page now passes: under the 60-word floor, but 4 distinct real prices", () => {
    expect(wordCount(yogaBoxText)).toBeLessThan(60);
    expect(countDistinctPrices(yogaBoxText)).toBeGreaterThanOrEqual(3);
    expect(servicesContentPasses(YOGA_BOX_PRICING_HTML, yogaBoxText)).toBe(true);
  });

  test("a single incidental '$10' mention does NOT pass — one price is not a real price list", () => {
    const html = "<main><p>We offer great service. Our rates start as low as $10 a month, which is affordable for most families in this area today.</p></main>";
    const text = extractVisibleText(extractMainContentHtml(html));
    expect(wordCount(text)).toBeLessThan(60);
    expect(countDistinctPrices(text)).toBe(1);
    expect(servicesContentPasses(html, text)).toBe(false);
  });

  test("two distinct prices (still below the 3+ floor) also does not pass on its own", () => {
    const html = "<main><p>Haircuts start at $20. A color treatment is $45.</p></main>";
    const text = extractVisibleText(extractMainContentHtml(html));
    expect(countDistinctPrices(text)).toBe(2);
    expect(servicesContentPasses(html, text)).toBe(false);
  });
});

describe("findPdfMenuLink — Day 4 Task: the real Red Bowl case (a bare 'View PDF Menu' wrapper page)", () => {
  // Red Bowl's real /menu/ page (fetched directly for this fix): its
  // only real content is a single button linking out to the actual PDF
  // menu — no <main> tag at all, so this operates on the same
  // extractMainContentHtml fallback (header/footer/nav stripped) the
  // real pipeline would apply first.
  const RED_BOWL_MENU_HTML = `
    <header>
      <a href="https://www.redbowlud.com/">Home</a>
      <a href="https://www.redbowlud.com/menu/">Menu</a>
    </header>
    <div class="et_pb_section">
      <a class="et_pb_button" href="https://website-cdn.menusifu.com/wp-content/uploads/redbowlud.com/2026/07/Red-Bowl-menu.pdf">View PDF Menu</a>
    </div>
    <footer>Copyright Red Bowl Restaurant all rights reserved.</footer>
  `;

  test("finds the real Red Bowl PDF link by its exact link text, resolved to an absolute URL", () => {
    const main = extractMainContentHtml(RED_BOWL_MENU_HTML);
    const url = findPdfMenuLink(main, "https://www.redbowlud.com/menu/");
    expect(url).toBe("https://website-cdn.menusifu.com/wp-content/uploads/redbowlud.com/2026/07/Red-Bowl-menu.pdf");
  });

  test("also matches by a .pdf href alone, even with unrelated link text", () => {
    const html = `<main><a href="/files/menu-2026.pdf">Download</a></main>`;
    expect(findPdfMenuLink(html, "https://example.com/menu/")).toBe("https://example.com/files/menu-2026.pdf");
  });

  test("matches the Spanish 'Ver menú' link text", () => {
    const html = `<main><a href="/carta">Ver menú</a></main>`;
    expect(findPdfMenuLink(html, "https://example.com/")).toBe("https://example.com/carta");
  });

  test("never matches a plain, unrelated link — no false positive", () => {
    const html = `<main><a href="/contact">Contact us</a><a href="/about">About</a></main>`;
    expect(findPdfMenuLink(html, "https://example.com/")).toBeNull();
  });

  test("a nav link to the menu PAGE (not a PDF) is never mistaken for a PDF link", () => {
    // Red Bowl's own <header> nav links to /menu/ itself with link text
    // "Menu" — plain SERVICES_PAGE_KEYWORDS territory, never a PDF
    // candidate on its own.
    const html = `<header><a href="/menu/">Menu</a></header><main><p>Some real content here.</p></main>`;
    expect(findPdfMenuLink(extractMainContentHtml(html), "https://example.com/")).toBeNull();
  });
});

describe("servicesContentPasses still correctly says not_found for Red Bowl's own wrapper page content (the PDF upgrade is a separate, later step)", () => {
  test("the wrapper page's own thin text never passes on its own", () => {
    const html = `<div class="et_pb_section"><p>Menu - Red Bowl Home Gallery Online Order Menu Contact Us Select Page Menu View PDF Menu Powered by Menusifu. Red Bowl Restaurant all rights reserved.</p></div>`;
    const text = extractVisibleText(html);
    expect(wordCount(text)).toBeLessThan(60);
    expect(servicesContentPasses(html, text)).toBe(false);
  });
});
