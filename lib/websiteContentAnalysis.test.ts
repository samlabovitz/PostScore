import { describe, expect, test } from "vitest";
import { analyzeWebsiteHtml } from "./websiteContentAnalysis";

const BARE_LANDING_PAGE = `<!doctype html>
<html>
<head><title>My Site</title></head>
<body>
<div>Welcome to my site. More coming soon.</div>
</body>
</html>`;

const RICH_SITE = `<!doctype html>
<html>
<head>
  <title>Riverside Cafe — Fresh, fast, made-to-order</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="A neighborhood cafe serving fresh coffee and pastries daily.">
</head>
<body>
  <header><h1>Riverside Cafe</h1></header>
  <section>
    <h2>About us</h2>
    <p>${"We've been serving the neighborhood since 2010 with fresh, locally-sourced ingredients. ".repeat(6)}</p>
  </section>
  <section>
    <h2>Hours</h2>
    <p>Mon-Fri 7am-5pm</p>
  </section>
  <section>
    <h2>Contact</h2>
    <p><a href="tel:+15551234567">Call now: (555) 123-4567</a></p>
    <p><a href="mailto:hello@riversidecafe.example">hello@riversidecafe.example</a></p>
    <a href="tel:+15551234567" class="btn">Book an appointment</a>
  </section>
</body>
</html>`;

describe("analyzeWebsiteHtml", () => {
  test("a bare, single-block landing page reads as thin on every signal", () => {
    const signals = analyzeWebsiteHtml(BARE_LANDING_PAGE);
    expect(signals.hasTitle).toBe(true); // it does have *a* title...
    expect(signals.hasMetaDescription).toBe(false);
    expect(signals.hasViewportTag).toBe(false);
    expect(signals.headingCount).toBe(0);
    expect(signals.visibleTextLength).toBeLessThan(100);
    expect(signals.hasPhoneLink).toBe(false);
    expect(signals.hasEmailLink).toBe(false);
    expect(signals.hasCtaText).toBe(false);
  });

  test("a rich, complete small-business site reads as substantial on every signal", () => {
    const signals = analyzeWebsiteHtml(RICH_SITE);
    expect(signals.hasTitle).toBe(true);
    expect(signals.hasMetaDescription).toBe(true);
    expect(signals.hasViewportTag).toBe(true);
    expect(signals.headingCount).toBe(4); // one h1 + three h2s
    expect(signals.visibleTextLength).toBeGreaterThan(300);
    expect(signals.hasPhoneLink).toBe(true);
    expect(signals.hasEmailLink).toBe(true);
    expect(signals.hasCtaText).toBe(true); // "Book an appointment"
  });

  test("never counts script/style text as visible content", () => {
    const html = `<!doctype html><html><head><title>x</title><style>body { color: red; /* lots of css that would otherwise inflate the length */ }</style></head><body><script>var reallyLongVariableNameThatWouldInflateTextLength = "yes, quite a lot of characters here actually";</script><p>Hi</p></body></html>`;
    const signals = analyzeWebsiteHtml(html);
    expect(signals.visibleTextLength).toBeLessThan(10);
  });

  test("a viewport tag without device-width does not count as responsive", () => {
    const html = `<html><head><title>x</title><meta name="viewport" content="initial-scale=1"></head><body>hi</body></html>`;
    expect(analyzeWebsiteHtml(html).hasViewportTag).toBe(false);
  });

  test("an empty <title></title> does not count as having a title", () => {
    const html = `<html><head><title></title></head><body>hi</body></html>`;
    expect(analyzeWebsiteHtml(html).hasTitle).toBe(false);
  });

  test("CTA detection is case-insensitive and matches curated phrases", () => {
    const html = `<html><head><title>x</title></head><body><p>CONTACT US today for a free estimate.</p></body></html>`;
    expect(analyzeWebsiteHtml(html).hasCtaText).toBe(true);
  });

  test("a generic phrase like 'learn more' is not treated as a call-to-action", () => {
    const html = `<html><head><title>x</title></head><body><p>Learn more about our story.</p></body></html>`;
    expect(analyzeWebsiteHtml(html).hasCtaText).toBe(false);
  });
});
