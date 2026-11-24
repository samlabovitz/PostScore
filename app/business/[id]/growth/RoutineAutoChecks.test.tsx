import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/app/actions/weeklyChecklist", () => ({ setWeeklyCheckItem: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
import { LocaleProvider, messages, type Locale } from "@/lib/i18n";
import { WeeklyChecklist } from "./WeeklyChecklist";
import { autoChecks, buildWeeklyChecklistItems, buildWeeklyChecklistStateWithAuto, type WeeklyCheckRow } from "@/lib/weeklyChecklist";

// Nov 22: the weekly routine's old note ("PostScore can't see your Google
// posts or replies yet") was outdated — posts and replies are live since
// 23E. On connected Premium, PostScore checks what it sent or can see.

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const render = (props: Partial<Parameters<typeof WeeklyChecklist>[0]>, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      <WeeklyChecklist businessId="b1" items={buildWeeklyChecklistItems(locale)} initialCheckedItemIds={[]} initialStreakWeeks={0} weekStart="2026-11-16" {...props} />
    </LocaleProvider>
  );

describe("checked by PostScore", () => {
  test("what PostScore sent (posts, replies, photos) or sees on Google counts for its week; sent wins over seen", () => {
    const auto = autoChecks({
      events: [
        { date: "2026-11-17", kind: "replies" },
        { date: "2026-11-18", kind: "posts" },
        { date: "2026-11-10", kind: "photos" },
        { date: "2026-11-18", kind: "campaign" },
        { date: "2026-11-18", kind: "listing" },
      ],
      postsLastAt: "2026-11-19T15:00:00Z",
      photosNewestAt: "2026-11-20T15:00:00Z",
      timeZone: "America/New_York",
    });
    const find = (week: string, item: string) => auto.find((a) => a.week_start === week && a.item_id === item)?.source;
    expect(find("2026-11-16", "reply_reviews")).toBe("sent");
    expect(find("2026-11-16", "post_update")).toBe("sent");
    expect(find("2026-11-16", "add_photo")).toBe("seen");
    expect(find("2026-11-09", "add_photo")).toBe("sent");
    // Offers and listing edits aren't routine items; the review link and hours stay the owner's.
    expect(auto.some((a) => a.item_id === "share_review_link" || a.item_id === "check_hours")).toBe(false);
  });

  test("merged into this week's state and the streak, like the owner's own checks", () => {
    const own: WeeklyCheckRow[] = ["share_review_link", "check_hours", "reply_reviews"].map((item_id) => ({ week_start: "2026-11-09", item_id }));
    const auto = autoChecks({ events: [{ date: "2026-11-10", kind: "posts" }, { date: "2026-11-11", kind: "photos" }, { date: "2026-11-17", kind: "replies" }], postsLastAt: null, photosNewestAt: null, timeZone: "America/New_York" });
    const state = buildWeeklyChecklistStateWithAuto(own, auto, new Date("2026-11-20T15:00:00Z"), "America/New_York");
    expect(state.weekStart).toBe("2026-11-16");
    expect(Array.from(state.checkedItemIds)).toEqual(["reply_reviews"]);
    expect(state.auto).toEqual({ reply_reviews: "sent" });
    // Last week: 3 by the owner + post and photo by PostScore = all five.
    expect(state.streakWeeks).toBe(1);
  });

  test("the list: PostScore's items show checked with who checked them, and can't be unticked", () => {
    const html = render({ initialCheckedItemIds: ["post_update", "add_photo", "check_hours"], auto: { post_update: "sent", add_photo: "seen" }, notice: "auto" });
    expect(text(html)).toContain("Sent from PostScore");
    expect(text(html)).toContain("Seen on Google");
    expect(text(html)).toContain("Checked by you");
    expect(html).toMatch(/<input type="checkbox"[^>]*disabled=""[^>]*\/>/);
  });

  test("the note says only what's true: connected Premium, not connected, or the owner checks them all", () => {
    expect(text(render({ notice: "auto" }))).toContain("PostScore checks off what it sent or can see on Google (posts, review replies, photos). Check the rest off yourself.");
    expect(text(render({ notice: "notConnected" }))).toContain("Not connected: check these off yourself.");
    expect(text(render({ notice: "self" }))).toContain("You check these off yourself.");
    for (const n of ["auto", "notConnected", "self"] as const) expect(text(render({ notice: n }))).not.toContain("can't see your Google posts");
    expect(text(render({ notice: "notConnected" }, "es"))).toContain("Sin conexión: márquelas usted mismo.");
    expect(JSON.stringify(messages.es)).not.toContain("todavía no puede ver sus publicaciones");
  });
});
