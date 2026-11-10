import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Scoring 1.15.0 "No broken links or dead pages". No real requests: every
// page is a fake answer.

import { checkHomepageLinks, classifyOpenedLink, extractCustomerLinks, isPublicWebUrl, MAX_CHECKED_LINKS, socialLinkProblems } from "@/lib/linkCheck";
import { detectBrokenSocialLinks } from "@/lib/websiteContentAnalysis";
import { classifySocialLink } from "@/lib/socialLinkCheck";
import { forCompetitorComparison, scoreBusiness, type BusinessScoringInput, type WebsiteAnalysis } from "@/lib/scoring";
import { urgentIssues } from "@/lib/urgency";
import { urgentFixHref } from "@/lib/notifications";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { LocaleProvider } from "@/lib/i18n";
import { LinkIssues, linkFix, linkWhat, linkWhatHappened } from "@/components/scoring/LinkIssues";
import { CHECKS } from "@/lib/scoring";

const HOME = "https://mycafe.com/";

const HOMEPAGE = `<html><head><title>My Cafe</title></head><body>
<header><nav>
  <a href="/">Home</a>
  <a href="/menu">Menu</a>
  <a href="/about-us">About us</a>
  <a href="https://order.toasttab.com/online/mycafe">Order online</a>
  <a href="/contact">Contact</a>
  <a href="/old-catering">Catering</a>
</nav></header>
<main>
  <a href="https://www.opentable.com/r/mycafe">Reserve a table</a>
  <a href="https://maps.app.goo.gl/abc123">Get directions</a>
  <a href="tel:+15551234567">Call us</a>
  <a href="mailto:hi@mycafe.com">Email</a>
  <a href="#top">Back to top</a>
  <a href="/blog/post-1">A blog post</a>
</main>
<footer>
  <a href="https://instagram.com/mycafe"><i class="fa fa-instagram"></i></a>
  <a href="/"><i class="fa fa-youtube"></i></a>
</footer>
</body></html>`;

/** A fake web: each URL's answer. */
function fakeWeb(pages: Record<string, { status: number; location?: string; html?: string }>): typeof fetch & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const page = pages[url];
    if (!page) return new Response("<html><title>OK</title><body>" + "Real page text. ".repeat(50) + "</body></html>", { status: 200, headers: { "content-type": "text/html" } });
    const headers: Record<string, string> = { "content-type": "text/html" };
    if (page.location) headers.location = page.location;
    return new Response(page.html ?? "", { status: page.status, headers });
  }) as typeof fetch & { calls: string[] };
  f.calls = calls;
  return f;
}

describe("which links: the ones customers use, most important first", () => {
  test("order, book, contact, menu, directions, then the main nav; never mailto/tel/#, the homepage or social icons", () => {
    const links = extractCustomerLinks(HOMEPAGE, HOME);
    expect(links.map((l) => `${l.kind} ${l.url}`)).toEqual([
      "order https://order.toasttab.com/online/mycafe",
      "book https://www.opentable.com/r/mycafe",
      "contact https://mycafe.com/contact",
      "menu https://mycafe.com/menu",
      "directions https://maps.app.goo.gl/abc123",
      "nav https://mycafe.com/about-us",
      "nav https://mycafe.com/old-catering",
    ]);
    // A link elsewhere on the page that isn't one of these isn't opened.
    expect(links.some((l) => l.url.includes("/blog/"))).toBe(false);
  });

  test(`at most ${MAX_CHECKED_LINKS} links`, () => {
    const many = `<nav>${Array.from({ length: 40 }, (_, i) => `<a href="/page-${i}">Page ${i}</a>`).join("")}</nav>`;
    expect(extractCustomerLinks(many, HOME)).toHaveLength(MAX_CHECKED_LINKS);
  });

  test("never an internal or private address", () => {
    for (const bad of ["http://localhost/x", "http://127.0.0.1/", "http://10.0.0.5/", "http://[::1]/", "http://intranet/", "http://printer.local/", "https://user:pw@mycafe.com/", "ftp://mycafe.com/", "http://router.home/"]) {
      expect(isPublicWebUrl(bad), bad).toBe(false);
    }
    expect(isPublicWebUrl("https://order.toasttab.com/online/mycafe")).toBe(true);
  });
});

describe("what counts as broken", () => {
  const link = { kind: "nav" as const, label: "Catering", url: "https://mycafe.com/old-catering" };
  const ok = (html: string, finalUrl = link.url) => classifyOpenedLink(link, { kind: "ok", finalUrl, status: 200, html }, HOME);

  test("404 / 410 → not found; 5xx → server error; a block (401/403/429), timeout or network error proves nothing", async () => {
    expect(classifyOpenedLink(link, { kind: "http_error", status: 404, finalUrl: link.url }, HOME)).toMatchObject({ problem: "not_found", status: 404 });
    expect(classifyOpenedLink(link, { kind: "http_error", status: 410, finalUrl: link.url }, HOME)).toMatchObject({ problem: "not_found" });
    expect(classifyOpenedLink(link, { kind: "http_error", status: 503, finalUrl: link.url }, HOME)).toMatchObject({ problem: "server_error" });
    expect(classifyOpenedLink(link, { kind: "unknown" }, HOME)).toBeNull();
    const blocked = await checkHomepageLinks(`<nav><a href="/a">A</a><a href="/b">B</a></nav>`, HOME, fakeWeb({ "https://mycafe.com/a": { status: 403 }, "https://mycafe.com/b": { status: 429 } }));
    expect(blocked).toMatchObject({ checked: 2, problems: [] });
    const failing = (async () => {
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    expect((await checkHomepageLinks(`<nav><a href="/a">A</a></nav>`, HOME, failing)).problems).toEqual([]);
  });

  test("a “page not found”, parked or “coming soon” page answering 200", () => {
    expect(ok("<title>Page not found</title><body>Sorry, this page could not be found.</body>")).toMatchObject({ problem: "page_not_found" });
    expect(ok("<title>mycafe-catering.com</title><body>This domain is for sale! Buy this domain on GoDaddy.</body>")).toMatchObject({ problem: "parked" });
    expect(ok("<title>Coming soon</title><body>Our catering page is coming soon.</body>")).toMatchObject({ problem: "coming_soon" });
    // A real page that merely mentions "not found" deep in its text is fine.
    expect(ok("<title>Catering</title><body>" + "We cater weddings and parties. ".repeat(150) + " Item not found? Ask us.</body>")).toBeNull();
  });

  test("lands back on the business's own homepage instead", () => {
    expect(ok("<title>My Cafe</title>", "https://www.mycafe.com/")).toMatchObject({ problem: "loops_home" });
  });

  test("redirects are followed hop by hop, and a hop to a private address is never opened", async () => {
    const web = fakeWeb({
      "https://mycafe.com/old-catering": { status: 301, location: "https://mycafe.com/" },
      "https://mycafe.com/menu": { status: 302, location: "http://127.0.0.1/admin" },
    });
    const r = await checkHomepageLinks(`<nav><a href="/old-catering">Catering</a><a href="/menu">Menu</a></nav>`, HOME, web);
    expect(r.problems).toEqual([{ kind: "nav", label: "Catering", url: "https://mycafe.com/old-catering", problem: "loops_home" }]);
    expect(web.calls).not.toContain("http://127.0.0.1/admin");
  });

  test("the fixture homepage: a dead order link, a 404 menu bar link, a YouTube icon that loops back to the homepage", async () => {
    const web = fakeWeb({
      "https://order.toasttab.com/online/mycafe": { status: 404 },
      "https://mycafe.com/old-catering": { status: 404 },
    });
    const linkCheck = await checkHomepageLinks(HOMEPAGE, HOME, web, new Date("2026-11-09T12:00:00Z"));
    expect(linkCheck.checked).toBe(7);
    expect(linkCheck.problems.map((p) => `${p.kind}:${p.problem}`)).toEqual(["order:not_found", "nav:not_found"]);
    // The YouTube icon goes to "/" — the site itself.
    const broken = detectBrokenSocialLinks(HOMEPAGE, HOME);
    expect(broken).toEqual([expect.objectContaining({ platform: "YouTube", reason: "own_site" })]);
    // …and a real-looking social link that redirects to the homepage is caught too.
    // (classifySocialLink's own_site — lib/socialRules.test.tsx — is the scan's result.)
    expect(classifySocialLink({ finalUrl: "https://mycafe.com/", httpStatus: 200, ownSiteUrl: HOME })).toBe("own_site");
    const profiles = { profiles: [{ platform: "Facebook", url: "facebook.com/mycafe", check: { result: "own_site" as const, finalUrl: "https://mycafe.com/", httpStatus: 200, checkedAt: "x" } }] };
    expect(socialLinkProblems(profiles.profiles, broken).map((p) => `${p.platform}:${p.problem}`)).toEqual(["Facebook:loops_home", "YouTube:loops_home"]);
  });
});

describe("the score: 2 points, 1 off per broken link; order / book / contact are Urgent", () => {
  const BASE = scoringInput();
  const withLinks = (linkCheck: WebsiteAnalysis["linkCheck"], extra: Partial<WebsiteAnalysis> = {}): BusinessScoringInput => ({ ...BASE, websiteAnalysis: { ...BASE.websiteAnalysis!, linkCheck, ...extra } });
  const links = (input: BusinessScoringInput, locale: "en" | "es" = "en") => scoreBusiness(input, locale).checks.find((c) => c.id === "website.links")!;
  const at = "2026-11-09T12:00:00Z";

  test("all good → 2/2 (EN + ES); not checked yet / unreadable site → not scored", () => {
    const good = links(withLinks({ checkedAt: at, checked: 6, problems: [] }));
    expect([good.earnedPoints, good.maxPoints]).toEqual([2, 2]);
    expect(good.explanation).toBe("All 6 links we checked open the right page.");
    expect(links(withLinks({ checkedAt: at, checked: 6, problems: [] }), "es").explanation).toBe("Los 6 enlaces que revisamos abren la página correcta.");
    expect(links(withLinks(undefined)).earnedPoints).toBeNull();
    const unreadable = links(withLinks({ checkedAt: at, checked: 6, problems: [] }, { content: null, contentFetchFailureReason: "blocked_automated_check" }));
    expect(unreadable.earnedPoints).toBeNull();
    expect(links({ ...BASE, website: null, websiteAnalysis: null }).earnedPoints).toBeNull();
  });

  test("each broken link costs 1, never below 0; a broken order link is Urgent (with a notification), a broken menu bar link isn't", () => {
    const order = { kind: "order" as const, label: "Order online", url: "https://order.toasttab.com/online/mycafe", problem: "not_found" as const, status: 404 };
    const nav = { kind: "nav" as const, label: "Catering", url: "https://mycafe.com/old-catering", problem: "not_found" as const, status: 404 };
    const urgent = withLinks({ checkedAt: at, checked: 7, problems: [order, nav] });
    const c = links(urgent);
    expect(c.earnedPoints).toBe(0);
    expect(c.gaps).toEqual(["urgent_link"]);
    expect(urgentIssues(urgent, scoreBusiness(urgent))).toContain("broken_link");
    expect(urgentFixHref("broken_link", "b1")).toBe("/business/b1/website#check-links");

    const notUrgent = withLinks({ checkedAt: at, checked: 7, problems: [nav] });
    expect(links(notUrgent).earnedPoints).toBe(1);
    expect(links(notUrgent).gaps).toEqual(["broken_link"]);
    expect(urgentIssues(notUrgent, scoreBusiness(notUrgent))).not.toContain("broken_link");

    expect(links(withLinks({ checkedAt: at, checked: 7, problems: [order, nav, nav, nav, nav, nav] })).earnedPoints).toBe(0);
  });

  test("Website still totals 30 with the links check", () => {
    const website = scoreBusiness(withLinks({ checkedAt: at, checked: 3, problems: [] })).categories.find((c) => c.id === "website")!;
    expect(website.checks.reduce((s, c) => s + c.maxPoints, 0)).toBe(30);
    expect(CHECKS.some((d) => d.id === "website.links")).toBe(true);
  });

  test("competitors aren't link-checked, so the owner's comparison leaves it out too (like for like)", () => {
    const order = { kind: "order" as const, label: "Order", url: "https://order.example.org/x", problem: "not_found" as const, status: 404 };
    const breakdown = scoreBusiness(withLinks({ checkedAt: at, checked: 4, problems: [order, order, order, order] }));
    const comparable = forCompetitorComparison(breakdown);
    expect(comparable.checks.some((c) => c.id === "website.links")).toBe(false);
    expect(comparable.total).toBeGreaterThan(breakdown.total);
    // Exactly the score without the check.
    const notChecked = scoreBusiness(withLinks(undefined));
    expect(comparable.total).toBe(notChecked.total);
  });
});

describe("“X links need fixing — see them”", () => {
  const problems = [
    { kind: "nav", label: "Catering", url: "https://mycafe.com/old-catering", problem: "not_found", status: 404 },
    { kind: "order", label: "Order online", url: "https://order.toasttab.com/online/mycafe", problem: "not_found", status: 404 },
    { kind: "social", label: "YouTube", url: "/", problem: "loops_home", platform: "YouTube" },
  ] as const;
  const check = { id: "website.links", meta: { linkProblems: JSON.stringify(problems) } };
  const render = (locale: "en" | "es") => renderToStaticMarkup(<LocaleProvider locale={locale}><LinkIssues check={check} /></LocaleProvider>);

  test("the button (EN + ES); nothing for a check without problems", () => {
    expect(render("en")).toContain("3 links need fixing — see them");
    expect(render("es")).toContain("3 enlaces necesitan arreglo: véalos");
    expect(render("en")).toContain('aria-haspopup="dialog"');
    expect(renderToStaticMarkup(<LocaleProvider locale="en"><LinkIssues check={{ id: "website.links", meta: {} }} /></LocaleProvider>)).toBe("");
  });

  test("each link: what it is, what happened, how to fix it (EN + ES)", () => {
    expect(linkWhat(problems[1], "en")).toBe("“Order online” (order online)");
    expect(linkWhatHappened(problems[1], "en")).toBe("Page not found (404).");
    expect(linkFix(problems[1], "en")).toBe("Point it to your current online ordering page — customers can't order until it works.");
    expect(linkWhat(problems[2], "en")).toBe("YouTube icon");
    expect(linkWhatHappened(problems[2], "en")).toBe("Opens your own homepage instead of YouTube.");
    expect(linkFix(problems[2], "es")).toBe("Ponga en el ícono la dirección real de su perfil de YouTube, o quite el ícono.");
    expect(linkWhatHappened(problems[0], "es")).toBe("Página no encontrada (404).");
  });
});
