import { describe, expect, test } from "vitest";
import { analyzeWebsiteHtml, detectContactLinks, detectSocialProfiles, metaContent } from "./websiteContentAnalysis";

// Realistic minified WordPress output (Autoptimize / WP Rocket / Cloudflare
// HTML minify strip attribute quotes and don't preserve attribute order).
const MINIFIED_WP = `<!DOCTYPE html><html lang=en-US><head><meta charset=UTF-8><meta content="width=device-width, initial-scale=1" name=viewport><title>Bánh Mì Boy – Vietnamese Sandwiches</title><meta name=description content="Fresh banh mi in Newark, DE"><link rel=stylesheet href=https://banhmiboy.com/wp-content/cache/autoptimize/css/autoptimize_1.css><script>var wpAjax={"url":"x"}</script></head><body class="home page-template-default"><header class=site-header><nav><a href=https://banhmiboy.com/>Home</a><a href=https://banhmiboy.com/about-us/>About</a></nav></header><main><h1>Bánh Mì Boy</h1><h2>Menu</h2><p>Open Daily: Monday - Sunday: 11am - 7pm / <a href=tel:+13025252018>(302) 525-2018</a></p><p>Order online today and visit us.</p></main><footer><a href=mailto:hello@banhmiboy.com>Email us</a></footer></body></html>`;

describe("Step 2d parser: viewport in any attribute order, quoted or unquoted", () => {
  test("minified WordPress: content before name, unquoted name", () => {
    expect(metaContent(MINIFIED_WP, "viewport")).toBe("width=device-width, initial-scale=1");
    expect(analyzeWebsiteHtml(MINIFIED_WP).hasViewportTag).toBe(true);
  });
  test("fully unquoted, single quotes, upper-case, and the classic order all work", () => {
    for (const tag of [
      `<meta name=viewport content=width=device-width,initial-scale=1>`,
      `<meta name='viewport' content='width=device-width, initial-scale=1'>`,
      `<META NAME="Viewport" CONTENT="width=device-width">`,
      `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
      `<meta data-x="1" content="width=device-width" name="viewport">`,
    ]) {
      expect(analyzeWebsiteHtml(`<html><head>${tag}<title>t</title></head><body><h1>x</h1></body></html>`).hasViewportTag, tag).toBe(true);
    }
  });
  test("any meta order: the viewport tag can come after other meta tags", () => {
    const html = `<head><meta property=og:title content=Hi><meta name=robots content=index><meta content=width=device-width name=viewport></head>`;
    expect(analyzeWebsiteHtml(html).hasViewportTag).toBe(true);
  });
  test("a genuinely missing or non-responsive viewport is still false", () => {
    expect(analyzeWebsiteHtml(`<head><meta name=description content=x></head><body></body>`).hasViewportTag).toBe(false);
    expect(analyzeWebsiteHtml(`<head><meta name=viewport content="width=1024"></head>`).hasViewportTag).toBe(false);
  });
  test("a data-name attribute is never mistaken for name", () => {
    expect(metaContent(`<meta data-name=viewport content=width=device-width>`, "viewport")).toBeNull();
  });
  test("meta description is read the same way", () => {
    expect(analyzeWebsiteHtml(MINIFIED_WP).hasMetaDescription).toBe(true);
  });
});

describe("Step 2d parser: tel:/mailto: links quoted or unquoted", () => {
  test("minified WordPress unquoted hrefs are found", () => {
    const c = analyzeWebsiteHtml(MINIFIED_WP);
    expect(c.hasPhoneLink).toBe(true);
    expect(c.hasEmailLink).toBe(true);
  });
  test("quoted variants still work; plain-text numbers are not links", () => {
    expect(detectContactLinks(`<a href="tel:+1302">call</a>`).hasPhoneLink).toBe(true);
    expect(detectContactLinks(`<a href='mailto:a@b.co'>mail</a>`).hasEmailLink).toBe(true);
    expect(detectContactLinks(`<p>Call (302) 525-2018</p>`)).toMatchObject({ hasPhoneLink: false, hasEmailLink: false });
  });
  test("a tel: inside a script string doesn't count", () => {
    expect(detectContactLinks(`<script>var x='<a href=tel:1>';</script><p>hi</p>`).hasPhoneLink).toBe(false);
  });
});

describe("Step 2d additions: contact buttons", () => {
  const BASE = "https://mainstreetsweets.com";
  test("a link to the site's own contact page counts as a contact link (absolute, relative, www, Spanish path)", () => {
    for (const href of ["/contact", "/contact-us/", "https://www.mainstreetsweets.com/contact/", "contacto", "/es/contactenos"]) {
      expect(detectContactLinks(`<a href="${href}">Visit</a>`, BASE).hasContactPageLink, href).toBe(true);
    }
  });
  test("another site's contact page, or a non-contact page, doesn't count", () => {
    expect(detectContactLinks(`<a href="https://other.com/contact">x</a>`, BASE).hasContactPageLink).toBe(false);
    expect(detectContactLinks(`<a href="/menu">Menu</a>`, BASE).hasContactPageLink).toBe(false);
  });
  test("an action-labeled contact button is also a call-to-action (EN + ES), plain labels aren't", () => {
    expect(detectContactLinks(`<a class=btn href=/contact>Contact us</a>`, BASE).hasActionLinkText).toBe(true);
    expect(detectContactLinks(`<a href=tel:+1302><span>Call</span></a>`, BASE).hasActionLinkText).toBe(true);
    expect(detectContactLinks(`<a href=mailto:a@b.co>Email us!</a>`, BASE).hasActionLinkText).toBe(true);
    expect(detectContactLinks(`<a href=/contacto>Llámenos</a>`, BASE).hasActionLinkText).toBe(true);
    expect(detectContactLinks(`<a href=/contact>Book now →</a>`, BASE).hasActionLinkText).toBe(true);
    expect(detectContactLinks(`<a href=tel:+1302>(302) 525-2018</a>`, BASE).hasActionLinkText).toBe(false);
    // An action label on a non-contact link isn't a contact button.
    expect(detectContactLinks(`<a href=/menu>Order now</a>`, BASE).hasActionLinkText).toBe(false);
  });
  test("analyzeWebsiteHtml: contact page link + action label -> contact link and CTA", () => {
    const c = analyzeWebsiteHtml(`<html><body><h1>Hi</h1><a href=/contact-us>Contact Us</a></body></html>`, BASE);
    expect(c.hasContactPageLink).toBe(true);
    expect(c.hasCtaText).toBe(true);
  });
});

describe("Step 2d additions: social profiles", () => {
  test("real profiles are listed; share buttons, posts and bare homepages are not", () => {
    const html = `
      <footer>
        <a href="https://www.instagram.com/mainstreetsweets/">IG</a>
        <a href="https://facebook.com/MainStreetSweets">FB</a>
        <a href="https://www.tiktok.com/@mainstreetsweets">TT</a>
        <a href="https://x.com/msweets">X</a>
        <a href="https://www.youtube.com/@mainstreetsweets/videos">YT</a>
        <a href="https://www.linkedin.com/company/main-street-sweets/">LI</a>
        <a href="https://www.yelp.com/biz/main-street-sweets-newark">Yelp</a>
        <a href="https://www.facebook.com/sharer/sharer.php?u=https://mainstreetsweets.com">Share</a>
        <a href="https://twitter.com/intent/tweet?text=hi">Tweet</a>
        <a href="https://www.instagram.com/">Instagram</a>
        <a href="https://www.instagram.com/p/Cx123/">a post</a>
        <a href="https://www.youtube.com/watch?v=abc">a video</a>
        <a href="https://www.tiktok.com/">TikTok</a>
      </footer>`;
    expect(detectSocialProfiles(html)).toEqual([
      { platform: "Instagram", url: "instagram.com/mainstreetsweets" },
      { platform: "Facebook", url: "facebook.com/MainStreetSweets" },
      { platform: "TikTok", url: "tiktok.com/@mainstreetsweets" },
      { platform: "X/Twitter", url: "x.com/msweets" },
      { platform: "YouTube", url: "youtube.com/@mainstreetsweets" },
      { platform: "LinkedIn", url: "linkedin.com/company/main-street-sweets" },
      { platform: "Yelp", url: "yelp.com/biz/main-street-sweets-newark" },
    ]);
  });
  test("duplicates collapse; no social links -> []", () => {
    expect(detectSocialProfiles(`<a href=https://instagram.com/x>1</a><a href=https://www.instagram.com/x/>2</a>`)).toHaveLength(1);
    expect(detectSocialProfiles(`<a href=/menu>Menu</a>`)).toEqual([]);
  });
});

describe("Step 2g: social links in unusual formats (the Chipotle store-locator case)", () => {
  test("protocol-relative links are found", () => {
    expect(detectSocialProfiles(`<a href="//www.instagram.com/chipotle">IG</a>`)).toEqual([{ platform: "Instagram", url: "instagram.com/chipotle" }]);
  });
  test("a social URL wrapped in a tracking/redirect link is found", () => {
    expect(
      detectSocialProfiles(`<a href="https://locations.chipotle.com/click?url=https%3A%2F%2Fwww.facebook.com%2Fchipotle&amp;ref=footer">FB</a>`)
    ).toEqual([{ platform: "Facebook", url: "facebook.com/chipotle" }]);
  });
  test("entity-encoded hrefs and data-href icon buttons are found", () => {
    expect(detectSocialProfiles(`<a href="https:&#x2F;&#x2F;twitter.com&#x2F;ChipotleTweets">X</a>`)).toEqual([
      { platform: "X/Twitter", url: "twitter.com/ChipotleTweets" },
    ]);
    expect(detectSocialProfiles(`<a href="#" data-href="https://www.tiktok.com/@chipotle">TikTok</a>`)).toEqual([
      { platform: "TikTok", url: "tiktok.com/@chipotle" },
    ]);
  });
  test("share buttons inside a redirect are still not profiles", () => {
    expect(detectSocialProfiles(`<a href="/out?u=https%3A%2F%2Fwww.facebook.com%2Fsharer%2Fsharer.php%3Fu%3Dx">Share</a>`)).toEqual([]);
  });
});
