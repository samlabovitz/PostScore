import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";

vi.mock("server-only", () => ({}));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { MESSAGING_ATTRIBUTE_IDS, messagingOnFromAttributes } from "@/lib/gbpMessaging";
import { readGbpMessagingWith } from "@/lib/gbpMessaging.server";
import { GbpMessagingStep, GoogleAiAnswersLine } from "@/components/gbp/GbpMessagingStep";
import { GOOGLE_LINKS } from "@/lib/googleHelpLinks";
import { CUSTOMER_DETAIL_OPTIONS } from "@/lib/gbpAttributes";
import { resetGbpQuota } from "@/lib/gbpQuota";

const html = (node: React.ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>).replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

describe("“Let customers text you from Google” — detection (read-only)", () => {
  test("✓ only when a texting or WhatsApp option is really set on the location", () => {
    expect(messagingOnFromAttributes([{ name: "attributes/url_text_messaging", uriValues: [{ uri: "sms:+13025551234" }] }])).toBe(true);
    expect(messagingOnFromAttributes([{ name: "attributes/url_whatsapp", uriValues: [{ uri: "https://wa.me/13025551234" }] }])).toBe(true);
    expect(messagingOnFromAttributes([{ name: "attributes/url_text_messaging", uriValues: [{ uri: " " }] }])).toBe(false);
    expect(messagingOnFromAttributes([{ name: "attributes/url_facebook", uriValues: [{ uri: "https://facebook.com/x" }] }])).toBe(false);
    expect(messagingOnFromAttributes([])).toBe(false);
  });

  test("one GET of the owner's own location; Google errors are “not known” (no ✓), never a guess", async () => {
    resetGbpQuota();
    const calls: Array<{ url: string; method: string }> = [];
    const ok: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), method: init?.method ?? "GET" });
      return new Response(JSON.stringify({ attributes: [{ name: "attributes/url_text_messaging", valueType: "URL", uriValues: [{ uri: "sms:+13025551234" }] }] }), { status: 200 });
    };
    expect(await readGbpMessagingWith("locations/1", "ya29.TEST", ok)).toBe(true);
    expect(calls).toEqual([{ url: "https://mybusinessbusinessinformation.googleapis.com/v1/locations/1/attributes", method: "GET" }]);
    expect(await readGbpMessagingWith("locations/1", "ya29.TEST", async () => new Response("{}", { status: 403 }))).toBeNull();
  });

  test("never turned on for an owner: nothing writes a messaging attribute", () => {
    const server = fs.readFileSync("lib/gbpMessaging.server.ts", "utf8");
    expect(server).not.toMatch(/method:\s*"(PATCH|POST|PUT|DELETE)"/);
    // The "Update on Google" editor never offers them either.
    const offered = Object.values(CUSTOMER_DETAIL_OPTIONS).flat();
    for (const id of MESSAGING_ATTRIBUTE_IDS) expect(offered).not.toContain(id);
  });
});

describe("the step (EN + ES), with Google's own link", () => {
  test("steps + official link while not on; ✓ when on; never scored, never turned on for you", () => {
    const off = html(<GbpMessagingStep on={false} />);
    expect(off).toContain("Let customers text you from Google — turn on messaging in your Business Profile (about 2 min)");
    expect(off).toContain("Click Edit profile → Contact.");
    expect(off).toContain(`href="${GOOGLE_LINKS.chatHelp}"`);
    expect(GOOGLE_LINKS.chatHelp).toBe("https://support.google.com/business/answer/15013580");
    expect(off).toContain("PostScore never turns it on for you. It doesn't change your PostScore.");
    expect(off).not.toContain('data-testid="gbp-messaging-on"');
    const on = html(<GbpMessagingStep on />);
    expect(on).toContain("On — customers can text you from your Google profile.");
    expect(on).not.toContain("Click Edit profile");
    const es = html(<GbpMessagingStep on={null} />, "es");
    expect(es).toContain("Permita que los clientes le escriban desde Google: active la mensajería en su Perfil de Empresa en Google (unos 2 min)");
    expect(es).toContain(`href="${GOOGLE_LINKS.chatHelp}?hl=es"`);
    expect(es).toContain("PostScore nunca lo activa por usted");
  });

  test("the AI line; Premium gets “Update on Google” (the Customer details row)", () => {
    const premium = html(<GoogleAiAnswersLine businessId="b1" premium />);
    expect(premium).toContain("Google's AI answers customers' questions from your profile. Fill in your services, prices, hours, parking and payments so it answers correctly.");
    expect(premium).toContain('href="/business/b1#check-customer_details"');
    expect(html(<GoogleAiAnswersLine businessId="b1" premium={false} />)).not.toContain("Update on Google");
    expect(html(<GoogleAiAnswersLine businessId="b1" premium />, "es")).toContain("La IA de Google responde las preguntas de los clientes");
  });

  test("it's on the Growth Google Profile tab, the connect page's next steps, and the Customer details row", () => {
    expect(fs.readFileSync("components/gbp/GoogleProfilePanel.tsx", "utf8")).toMatch(/data-testid="profile-strength"[\s\S]*<GbpMessagingStep on=\{connected \? messagingOn : null\} \/>/);
    const connect = fs.readFileSync("app/business/[id]/connect-gbp/ConnectGbpView.tsx", "utf8");
    expect(connect).toContain('data-testid="connect-next-steps"');
    expect(connect).toContain("<GoogleAiAnswersLine businessId={businessId} premium");
    expect(fs.readFileSync("components/scoring/CategoryCard.tsx", "utf8")).toContain("<GoogleAiAnswersLine");
  });
});
