import { afterEach, beforeEach, describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider, t } from "@/lib/i18n";
import { askPostAIInPlace, markPostaiDockReady, POSTAI_OPEN_EVENT } from "@/lib/postaiDock";
import { POSTAI_ASK_QUESTIONS } from "@/lib/postaiAsk";
import { AskPostAI } from "@/components/studio/AskPostAI";

// Every "Confused? Ask PostAI" link opens the floating PostAI panel in
// place, on the page it's on, with its question typed in (never sent) —
// no trip to the Overview.

const g = globalThis as unknown as { window?: EventTarget & { location: { pathname: string } }; document?: { documentElement: { dataset: Record<string, string> } } };
let opened: Array<{ draft?: string }> = [];

beforeEach(() => {
  const target = new EventTarget() as EventTarget & { location: { pathname: string } };
  // The owner is on Campaigns → Coupons.
  target.location = { pathname: "/business/b1/campaigns" };
  target.addEventListener(POSTAI_OPEN_EVENT, (e) => opened.push((e as CustomEvent<{ draft?: string }>).detail));
  g.window = target;
  g.document = { documentElement: { dataset: {} } };
  opened = [];
});
afterEach(() => {
  delete g.window;
  delete g.document;
});

describe("Ask PostAI from Campaigns", () => {
  test("opens the panel in place with the coupon question filled in — the URL stays on Campaigns", () => {
    markPostaiDockReady(true);
    const question = t("en", POSTAI_ASK_QUESTIONS.coupon_cards);
    let prevented = false;
    expect(askPostAIInPlace({ preventDefault: () => (prevented = true) }, question)).toBe(true);
    // The link's navigation is cancelled: still on Campaigns.
    expect(prevented).toBe(true);
    expect(g.window!.location.pathname).toBe("/business/b1/campaigns");
    // The panel opens with the question typed in (the panel never sends it).
    expect(opened).toEqual([{ draft: "How do I hand out these coupons and keep count of redemptions?" }]);
  });

  test("Spanish and the referral question too", () => {
    markPostaiDockReady(true);
    askPostAIInPlace({ preventDefault: () => {} }, t("es", POSTAI_ASK_QUESTIONS.referral_cards));
    expect(opened).toEqual([{ draft: "¿Cómo llevo un programa de referidos con estas tarjetas?" }]);
  });

  test("a page without the panel: the link's own address is followed (nothing silently swallowed)", () => {
    let prevented = false;
    expect(askPostAIInPlace({ preventDefault: () => (prevented = true) }, "x")).toBe(false);
    expect(prevented).toBe(false);
    expect(opened).toEqual([]);
  });

  test("the panel marks the page only while it's there", () => {
    markPostaiDockReady(true);
    expect(g.document!.documentElement.dataset.postaiDock).toBe("ready");
    markPostaiDockReady(false);
    expect(g.document!.documentElement.dataset.postaiDock).toBeUndefined();
  });

  test("the link: same label, the in-place handler, and only an allowlisted id in its fallback address", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <AskPostAI businessId="b1" question="coupon_cards" />
      </LocaleProvider>
    );
    expect(html).toContain("Confused? Ask PostAI →");
    expect(html).toContain('href="/business/b1?ask=coupon_cards"');
    const src = fs.readFileSync("components/studio/AskPostAI.tsx", "utf8");
    expect(src).toContain("onClick={(e) => askPostAIInPlace(e, t(locale, POSTAI_ASK_QUESTIONS[question]))}");
  });
});

describe("no Ask PostAI link anywhere still goes to the Overview card", () => {
  test("the Overview-with-?ask= address is built only as AskPostAI's fallback", () => {
    const hits = execFileSync("grep", ["-rln", "postaiAskHref\\|?ask=", "app", "components", "lib"], { encoding: "utf8" })
      .split("\n")
      .filter((f) => f && !/\.test\./.test(f))
      .map((f) => path.normalize(f))
      .sort();
    expect(hits).toEqual(["components/assistant/PostAIDock.tsx", "components/studio/AskPostAI.tsx", "lib/postaiAsk.ts"]);
  });

  test("every place with a 'Confused? Ask PostAI' link uses AskPostAI (Campaigns coupons + referrals, Reviews sign)", () => {
    const users = execFileSync("grep", ["-rln", "<AskPostAI", "app", "components"], { encoding: "utf8" }).split("\n").filter(Boolean).sort();
    expect(users).toEqual(["app/business/[id]/campaigns/HowItWorks.tsx", "app/business/[id]/website-reviews/SignStudio.tsx"]);
    // …and nothing else renders that label by itself.
    const label = execFileSync("grep", ["-rln", "dashboard.postaiAsk.link", "app", "components"], { encoding: "utf8" }).split("\n").filter(Boolean);
    expect(label).toEqual(["components/studio/AskPostAI.tsx"]);
  });
});
