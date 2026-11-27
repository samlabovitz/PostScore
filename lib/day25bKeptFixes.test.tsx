// Day 25B: the drafts written in the background and the score breakdown's clickable rows — and (Nov 26) §2d "one home
// per task" taken back out: Fix plan's This week holds every quick fix again, the Growth plan keeps replies and answers.
import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1", useParams: () => ({ id: "b1" }) }));

import { LocaleProvider, t, type Locale } from "@/lib/i18n";
import { weekKinds } from "@/lib/tabIdeas";
import { postState, thisWeekKinds } from "@/components/gbp/ThisWeekList";
import { isWeeklyChecklistItemId } from "@/lib/weeklyChecklist";
import { CategoryCard, HoursStateContext } from "@/components/scoring/CategoryCard";

const wrap = (node: ReactNode, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

describe("§2d taken back out (Nov 26); Fix plan v3 and the Growth checklist since (lib/fixPlanV3.test.tsx)", () => {
  const recs = (["replies", "photos", "posts", "answers", "description"] as const).map((kind) => ({ kind, plan: {} })) as never;
  test("Google results' week list keeps the replies, photos, the post and the answers (the Growth plan has its own checklist)", () => {
    expect(weekKinds(recs).map((r) => r.kind)).toEqual(["replies", "photos", "posts", "answers"]);
    expect(thisWeekKinds(recs).map((r) => r.kind)).toEqual(["replies", "photos", "posts", "answers"]);
  });
  test("check-offs: only the app's own ids are written (the security fix stays; the Growth checklist's habits included)", () => {
    expect(isWeeklyChecklistItemId("check_hours")).toBe(true);
    expect(isWeeklyChecklistItemId("start_offer")).toBe(true);
    expect(isWeeklyChecklistItemId("seasonal_idea")).toBe(true);
    expect(isWeeklyChecklistItemId("anything")).toBe(false);
    expect(readFileSync("app/actions/weeklyChecklist.ts", "utf8")).toContain("if (!isWeeklyChecklistItemId(itemId))");
  });
  test("Google's side unknown: the sentence without it (EN + ES), never 'Google says .'", () => {
    const k = "content.checks.website.info_consistency.explanation.conflictHoursLabelledNoGoogle" as const;
    expect(t("en", k, { label: "Hours", site: "Thursday 9:30 AM–6:00 PM" })).toBe("Your website's Hours say Thursday 9:30 AM–6:00 PM, which doesn't match your Google listing.");
    expect(t("es", k, { label: "Horario", site: "jueves 9:30–18:00" })).toBe("El apartado «Horario» de su sitio web dice jueves 9:30–18:00, lo cual no coincide con su ficha de Google.");
    expect(t("es", "content.checks.website.info_consistency.explanation.conflictNoGoogle", { site: "555-1234" })).toBe("Su sitio web dice 555-1234, lo cual no coincide con su ficha de Google.");
  });
});

describe("drafts written in the background, never on page load", () => {
  test("the post: openPostDraft only reads the saved draft (the plain draft, said plainly, until one is saved)", () => {
    const actions = readFileSync("app/actions/gbpPosts.ts", "utf8");
    const open = actions.slice(actions.indexOf("export async function openPostDraft("), actions.indexOf("export async function", actions.indexOf("export async function openPostDraft(") + 10));
    expect(open).not.toContain("await draft(inputs, cleanDay(day));");
    expect(open).toContain("pending = true;");
    expect(readFileSync("lib/postDrafts.server.ts", "utf8")).toContain("export async function writeWeekDrafts(");
    expect(readFileSync("app/api/cron/reply-drafts/route.ts", "utf8")).toContain("await writeWeekDrafts(admin, id, plan)");
    expect(readFileSync("lib/replyBatch.server.ts", "utf8")).toContain('(await import("@/lib/postDrafts.server")).writeWeekDrafts(admin, businessId, plan)');
  });
  test("the answers' description: read from post_drafts, never written on page load", () => {
    const answers = readFileSync("app/actions/googleAnswers.ts", "utf8");
    expect(answers).toContain("return savedAnswersDescription(admin, businessId, inputs.locale);");
    expect(answers).not.toContain("callAnthropicMessage");
  });
  test("a saved draft shows at once: never 'Getting drafts ready…' for it", () => {
    expect(postState({ status: "loading", text: "Saved", latest: null, blockedToday: null, problems: [], flags: [], publish: null } as never)).toBe("ready");
    expect(postState({ status: "loading", text: "", latest: null, blockedToday: null, problems: [], flags: [], publish: null } as never)).toBe("loading");
  });
});

describe("score breakdown: rows that look and act clickable", () => {
  const check = { id: "visibility.review_replies", label: "Replying to reviews", earnedPoints: 0, maxPoints: 6, confidence: "VERIFIED", explanation: "You replied to 0 of your last 20 reviews." };
  const category = { id: "visibility", label: "Reviews", earnedPoints: 0, possiblePoints: 6, relativeScore: 0, weight: 40, checks: [check] };
  test("the whole row toggles; keyboard Enter/Space; aria-expanded; a chevron with 'Details' from 1024 px; buttons inside don't toggle", () => {
    const html = wrap(<CategoryCard category={category as never} embedded businessId="b1" />);
    // Losing points: it starts open (Nov 27); the chevron still closes it.
    expect(html).toMatch(/role="button" tabindex="0" aria-expanded="true" aria-controls="more-check-review_replies"/);
    expect(html).toContain('data-testid="row-chevron"');
    expect(html).toMatch(/<span class="hidden lg:inline">Details<\/span>/);
    expect(html).toContain("cursor-pointer");
    // A closed row tints on hover (this one starts open: it's losing points).
    expect(readFileSync("components/scoring/CategoryCard.tsx", "utf8")).toContain('"border-transparent hover:rounded-lg hover:bg-paper"');
    const src = readFileSync("components/scoring/CategoryCard.tsx", "utf8");
    expect(src).toContain('if ((e.target as HTMLElement).closest("a, button, input, label, summary")) return;');
    expect(src).toContain('if (e.key !== "Enter" && e.key !== " ") return;');
    // Open: a soft tint and a thin gold left edge.
    expect(src).toContain('show ? "rounded-r-lg border-brass bg-[color:color-mix(in_srgb,var(--color-brass)_7%,white)]"');
    expect(text(wrap(<CategoryCard category={category as never} embedded businessId="b1" />, "es"))).toContain("Detalles");
  });
  test("the waiting row says 'Waiting for Google' once (the pill), then 'Your Business Profile already matches your website…' (EN + ES)", () => {
    const hours = { id: "website.info_consistency", label: "Matches your Google listing", earnedPoints: 0.5, maxPoints: 1, confidence: "VERIFIED", explanation: "x" };
    const card = (locale: Locale) => text(wrap(<HoursStateContext.Provider value={{ kind: "differs", days: [], profileAhead: true }}><CategoryCard category={{ ...category, id: "website", checks: [hours] } as never} embedded businessId="b1" /></HoursStateContext.Provider>, locale));
    const en = card("en");
    expect(en.match(/Waiting for Google/g)?.length).toBe(1);
    expect(en).toContain("Your Business Profile already matches your website; Google Maps hasn't published it yet.");
    expect(card("es")).toContain("Su Perfil de Empresa ya coincide con su sitio web; Google Maps aún no lo ha publicado.");
  });
});
