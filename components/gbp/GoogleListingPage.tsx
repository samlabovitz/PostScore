"use client";

// Presence → Google listing (Day 25B step 2; docs/plans/day25a-spec.md §2,
// mockup 05): the listing row by row with "+N pts", "Show up for more" and
// "Protection & changes". The sections are also the old Google Profile
// tab's 4–6.

import { AnswersCard } from "@/components/gbp/MoreWaysCards";
import { fixPlanHref, googleResultsHref, growthPlanHref } from "@/lib/routes";
import { checkHowTo } from "@/lib/actionPlan";
import { isPremiumPlan, type Plan } from "@/lib/plan";
import { gbpResultText } from "@/components/gbp/GbpResultMessage";
import { GBP_PROFILE_ANCHOR, gbpConnectHref } from "@/lib/gbpLanding";
import { PremiumOneClickLine } from "@/components/scoring/PremiumOneClickLine";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { NowMatchPrompt } from "@/components/gbp/NowMatchPrompt";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { changeGoogleEditBack, checkGoogleEditsNow, keepAllGoogleVersions, keepGoogleVersion, reopenGoogleEditAction, undoMadeChange, type ChangeBackResult } from "@/app/actions/gbpGoogleEdits";
import { CompareVersions } from "@/components/gbp/CompareVersions";
import { codedToWeek, shortWeek, versionsOfEdit, versionsOfHours, watchedSummary } from "@/lib/compareVersions";
import { sameWeek } from "@/lib/gbpProfileEdits";
import { bannerEdits, bannerSerious, canChangeBack, isInfoOnly, joinFields, PLURAL_FIELDS, type GoogleEditRow } from "@/lib/gbpGoogleEdits";
import { timeText } from "@/lib/gbpListingFields";
import { doneSinceScan, ideaTypeOf, MAX_IDEAS, prefillFromHash, type Idea } from "@/lib/listingIdeas";
import { IconArrowUpRight, IconLock } from "@tabler/icons-react";
import { ProfileEditsOnGoogle, type StartHours } from "@/components/gbp/ProfileEditsOnGoogle";
import { FixGoogle, FixWebsite, HoursComparePanel, HoursMismatchChooser } from "@/components/hours/HoursMismatchChooser";
import type { WeeklyHours } from "@/lib/gbpProfileEdits";
import { PhotoUpload } from "@/components/gbp/PhotoUpload";
import { ownHoursKey, startHoursFromHash } from "@/lib/hoursChooser";
import { WebsiteLinkFix } from "@/components/gbp/WebsiteLinkFix";
import { CustomerDetailsGoogleEdit, useGbpEdit } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { GbpMessagingStep } from "@/components/gbp/GbpMessagingStep";
import { openProfileEdits } from "@/app/actions/gbpProfileEdits";
import { openOrderLink } from "@/app/actions/gbpOrderLink";
import { GoogleMapsAttribution } from "@/components/google/GoogleMapsAttribution";
import { GOOGLE_WRITES_FOR_EVERYONE } from "@/lib/googleWritesLaunch";
import { formatCount, formatMonthDayTime, formatShortDate, t, useLocale, useTimeZone, type Locale, type MessageKey } from "@/lib/i18n";
import { LISTING_SECTIONS, listingFixLine, localizeHours, editorFromHash, pointsText, ROW_CHECK, rowPoints, listingCounts, listingGroups, sampleIdeas, SHORT_DESCRIPTION, syncedAgo, type Editor, type GoogleTabSaved, type MadeChange, type MadeValue, type BookingState, type ListingRow } from "@/lib/googleProfileTab";
import type { BookingTracking } from "@/lib/bookingPartners";
import { BookingStepsPanel } from "@/components/gbp/BookingSteps";
import { HolidayHoursEditor, ServicesEditor } from "@/components/gbp/ListingFieldEditors";
import { cn } from "@/lib/utils";
import { DOES_FOR_YOU, type Rec } from "@/lib/googleRecommendations";
import { ideaPlanLine } from "@/components/gbp/GoogleRecs";
import { JumpMenu, K, type GoogleProfileTabProps, CREAM, STATUS_DOT, SectionHead, Box, Eyebrow, SampleTag, useTabIdeas, thisWeekRecs } from "@/components/gbp/googleTabParts";

function ideaText(idea: Idea, locale: Locale): { title: string; pill: string; reason: string; button: string } {
  const k = (s: string, p?: Record<string, string | number>) => t(locale, K(`ideas.${idea.id}.${s}`), p);
  switch (idea.id) {
    case "services": {
      const names = idea.missing.map((m) => m.service).join(", ");
      const terms = idea.missing.flatMap((m) => m.terms).slice(0, 3).map((x) => `“${x}”`).join(", ");
      return { title: k("title", { list: names }), pill: t(locale, K("ideas.reach"), { count: formatCount(idea.searches, locale) }), reason: k("reason", { terms, count: formatCount(idea.searches, locale) }), button: k("button") };
    }
    case "description":
      return { title: k("title"), pill: k("pill"), reason: idea.length === 0 ? k("reasonNone") : k("reason", { count: idea.length, text: idea.text.length > 60 ? `${idea.text.slice(0, 59)}…` : idea.text }), button: k("button") };
    case "holiday": {
      const name = t(locale, K(`fields.holiday.${idea.holiday}`));
      const date = formatShortDate(`${idea.date}T12:00:00Z`, locale, "UTC").replace(/,? \d{4}$/, "");
      return { title: k("title", { holiday: name }), pill: k("pill"), reason: k(idea.daysAway === 1 ? "reasonOne" : "reason", { holiday: name, date, count: idea.daysAway }), button: k("button") };
    }
    case "posts":
      return { title: k("title"), pill: k("pill"), reason: k("reason", { topic: t(locale, K(`ideas.posts.topic.${idea.topic}`)) }), button: k("button") };
    case "photos":
      return { title: k("title"), pill: k("pill"), reason: idea.monthsOld === null ? k("reasonNone") : k(idea.monthsOld === 1 ? "reasonOne" : "reason", { count: idea.monthsOld }), button: k("button") };
    case "details": {
      const which = idea.missing.length === 2 ? "both" : idea.missing[0];
      return { title: k(`title.${which}`), pill: k("pill"), reason: k(`reason.${which}`), button: k("button") };
    }
    case "messaging":
      return { title: k("title"), pill: k("pill"), reason: k("reason"), button: k("button") };
    case "extras":
      return { title: k("title"), pill: k("pill"), reason: k("reason", { list: idea.names.map((n) => n.toLowerCase()).join(", ") }), button: k("button") };
    case "category":
      return { title: k("title", { category: idea.category }), pill: t(locale, K("ideas.reach"), { count: formatCount(idea.searches, locale) }), reason: k("reason", { terms: idea.terms.slice(0, 2).map((x) => `“${x}”`).join(", "), category: idea.category }), button: k("button") };
    case "booking":
      return { title: t(locale, K("booking.ideaTitle")), pill: t(locale, K("booking.ideaPill")), reason: t(locale, K("booking.ideaBody"), { partner: idea.provider }), button: t(locale, K("action.turnOnBooking")) };
  }
}

/** `howTo` (the Google listing page on Grow or Free): a fix PostScore would
 * make opens its row's steps ("How to", outlined; locked on Free) — never a
 * button that looks like it does it in one click. */
function IdeaCard({ idea, n, rec = null, type = null, canEdit = false, howTo = null }: { idea: Idea; n: number; rec?: Rec | null; type?: ReturnType<typeof ideaTypeOf>; canEdit?: boolean; howTo?: "steps" | "locked" | null }) {
  const locale = useLocale();
  const plain = ideaText(idea, locale);
  const base = howTo && idea.action.kind === "editor" ? { ...plain, button: t(locale, K("action.howTo")) } : plain;
  // Day 23C: Premium's one button says PostScore does it, when it can write for this place.
  const x = rec && canEdit && DOES_FOR_YOU.includes(rec.kind) ? { ...base, button: t(locale, rec.kind === "photos" ? "dashboard.googleTab.w.photos.upload" : "dashboard.breakdown.action.doItForYou") } : base;
  const a = idea.action;
  const cls =
    howTo && a.kind === "editor"
      ? "inline-flex h-[30px] items-center gap-1 whitespace-nowrap rounded-lg border border-paper-line bg-white px-3 text-[12.5px] font-semibold text-ink hover:border-ink-soft"
      : "inline-flex h-[30px] items-center whitespace-nowrap rounded-lg border border-ink bg-ink px-3 text-[12.5px] font-semibold text-paper";
  return (
    <Box className="grid items-start gap-3 px-3.5 py-3 sm:grid-cols-[24px_1fr_auto]" data-testid={`google-tab-idea-${idea.id}`}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-brass text-[11.5px] font-bold text-brass">{n}</span>
      <div className="min-w-0">
        <h3 className="flex flex-wrap items-center gap-2 text-[14px] font-semibold leading-snug">
          {x.title}
          <span className="rounded-full bg-[color:color-mix(in_srgb,var(--color-green)_12%,white)] px-2 py-0.5 text-[11px] font-bold text-green">{x.pill}</span>
        </h3>
        {rec && (
          <p className="mt-0.5 text-[12.5px] font-semibold leading-snug text-ink" data-testid={`idea-plan-${idea.id}`}>
            {ideaPlanLine(rec, locale, type)}
          </p>
        )}
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-soft">{x.reason}</p>
      </div>
      {a.kind === "editor" ? (
        <a href={a.hash} className={cls} data-testid={`idea-action-${idea.id}`}>
          {howTo === "locked" && <IconLock size={13} className="text-brass" aria-hidden />}
          {x.button}
        </a>
      ) : a.external ? (
        <a href={a.href} target="_blank" rel="noopener noreferrer" className={cls}>
          {x.button}
        </a>
      ) : (
        <Link href={a.href} className={cls}>
          {x.button}
        </Link>
      )}
    </Box>
  );
}

/** Section 5's idea → its Day 23C recommendation (the "how many / when" line). */
const IDEA_REC: Partial<Record<Idea["id"], Rec["kind"]>> = { photos: "photos", holiday: "holiday", posts: "posts", description: "description", details: "details", services: "services" };

/** `page` (Google listing): section 2, and the closing line points to Fix plan and Growth plan. */
export function NextSection(props: GoogleProfileTabProps & { sample: boolean; page?: boolean; howTo?: "steps" | "locked" | null }) {
  const locale = useLocale();
  const [more, setMore] = useState(false);
  const sampleList = sampleIdeas(props.listing.categories ?? null);
  const extras = props.extras ?? null;
  const { ideas, recs, type } = useTabIdeas(props);
  const done = doneSinceScan(props.saved?.made ?? [], props.lastScanAt);
  // Already in section 1's "This week" (photos, the post): not repeated here.
  const thisWeek = new Set(thisWeekRecs(recs).map((r) => r.kind));
  // §2d: the answers card on this page covers the description, customer details and services (never the Growth plan).
  const answered = (id: Idea["id"]) => thisWeek.has("answers") && (id === "description" || id === "details" || id === "services");
  const open = ideas.filter((i) => !done.includes(i.id) && !(IDEA_REC[i.id] && thisWeek.has(IDEA_REC[i.id]!)) && !answered(i.id));
  const shown = more ? open : open.slice(0, MAX_IDEAS);
  // Practice mode with no real numbers yet: the labelled samples.
  const sample = props.sample && !extras && open.length === 0;
  return (
    <SectionHead n={props.page ? 2 : 5} id="next" title={t(locale, K("s5.title"))} meta={t(locale, K("s5.meta"))}>
      {sample && sampleList.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2" data-testid="google-tab-ideas">
          {sampleList.map((n, i) => (
            <Box key={n} className="grid items-start gap-3 px-3.5 py-3 sm:grid-cols-[24px_1fr]" data-testid={`google-tab-idea-${n}`}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-brass text-[11.5px] font-bold text-brass">{i + 1}</span>
              <div className="min-w-0">
                <h3 className="flex flex-wrap items-center gap-2 text-[14px] font-semibold leading-snug">
                  {t(locale, K(`s5.sample${n}.title`))}
                  <span className="rounded-full bg-[color:color-mix(in_srgb,var(--color-green)_12%,white)] px-2 py-0.5 text-[11px] font-bold text-green">{t(locale, K(`s5.sample${n}.tag`))}</span>
                  <SampleTag />
                </h3>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-soft">
                  {t(locale, K(`s5.sample${n}.body`))} {t(locale, K(`s5.sample${n}.why`))}
                </p>
              </div>
            </Box>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2" data-testid="google-tab-ideas">
          {shown.map((idea, i) => (
            <IdeaCard key={idea.id} idea={idea} n={i + 1} rec={recs.find((r) => r.kind === IDEA_REC[idea.id]) ?? null} type={type} canEdit={props.canEditGoogle === true} howTo={props.howTo ?? null} />
          ))}
          {done.map((id) => (
            <Box key={`done-${id}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px]" data-testid={`google-tab-idea-done-${id}`}>
              <span className="text-ink-soft">{t(locale, K(`ideas.done.${id}`))}</span>
              <b className="text-green">{t(locale, K("ideas.doneMark"))}</b>
            </Box>
          ))}
          {open.length > MAX_IDEAS && (
            <button type="button" onClick={() => setMore(!more)} className="w-fit text-[12.5px] font-semibold text-ink underline underline-offset-2" data-testid="ideas-more">
              {more ? t(locale, K("ideas.fewer")) : t(locale, K("ideas.more"), { count: open.length - MAX_IDEAS })}
            </button>
          )}
          {open.length === 0 && done.length === 0 && (
            <Box className="px-3.5 py-3 text-[13px] text-ink-soft" data-testid="google-tab-ideas-none">
              {t(locale, K(extras ? "ideas.none" : "ideas.noRead"))}
            </Box>
          )}
          {props.page ? (
            <p className="text-[12px] text-ink-mute" data-testid="listing-end-line">
              {t(locale, "dashboard.googlePages.listing.endBefore")}{" "}
              <Link href={fixPlanHref(props.businessId)} className="font-semibold text-ink underline underline-offset-2">
                {t(locale, "dashboard.googlePages.listing.endFixPlan")}
              </Link>
              {t(locale, "dashboard.googlePages.listing.endMiddle")}{" "}
              <Link href={growthPlanHref(props.businessId)} className="font-semibold text-ink underline underline-offset-2">
                {t(locale, "dashboard.googlePages.listing.endGrowthPlan")}
              </Link>
              .
            </p>
          ) : (
            <p className="text-[12px] text-ink-mute">{t(locale, K("ideas.recapLink.before"))} <Link href={fixPlanHref(props.businessId)} className="font-semibold text-ink underline underline-offset-2">{t(locale, K("ideas.recapLink.link"))}</Link></p>
          )}
        </div>
      )}
    </SectionHead>
  );
}

// ---------------------------------------------------------------------------
// 4 Your listing
// ---------------------------------------------------------------------------

/** The other names a row answers to (the editor links' #edit-…), for the landing highlight. */
const ROW_ALIASES: Record<string, string> = {
  hours: "edit-hours compare-hours",
  phone: "edit-phone",
  website: "edit-website-link",
  customerDetails: "edit-customer-details",
  photos: "edit-photos",
  booking: "edit-booking edit-booking-steps",
  messaging: "edit-messaging",
  holiday: "edit-holiday",
  services: "edit-services",
  description: "edit-description",
};

const EDITOR_ROW: Record<Editor, string> = {
  holiday: "holiday",
  services: "services",
  photos: "photos",
  booking_steps: "booking",
  booking_partner: "booking",
  hours: "hours",
  phone: "phone",
  description: "description",
  website: "website",
  customer_details: "customerDetails",
  booking: "booking",
  messaging: "messaging",
};

type LiveValue = { kind: "loading" } | { kind: "error" } | { kind: "none" } | { kind: "notOffered" } | { kind: "value"; value: string };
export type LiveValues = { description: LiveValue; booking: LiveValue };

/** The description and booking link, read from Google after the page loads
 * (the editors' own read-only open calls; practice mode: the sample Google). */
/** `listingDescription`: the description from the page's own listing read (the same read the
 * answers and the editor use) — shown as is, never a second read that could fail on its own. */
function useLiveValues(businessId: string, listingDescription?: string | null, skip = false): LiveValues {
  const known: LiveValue | null = listingDescription === undefined ? null : listingDescription ? { kind: "value", value: listingDescription } : { kind: "none" };
  const [live, setLive] = useState<LiveValues>({ description: known ?? { kind: "loading" }, booking: { kind: "loading" } });
  useEffect(() => {
    // Not connected (the Google listing page): nothing to read from Google.
    if (skip) return;
    let alive = true;
    void (async () => {
      // Any failure, even one thrown before a call returns, is "couldn't load" — never an endless shimmer.
      const safe = async <T,>(read: () => Promise<T>): Promise<T | null> => {
        try {
          return await read();
        } catch {
          return null;
        }
      };
      const [profile, order] = await Promise.all([known ? Promise.resolve(null) : safe(() => openProfileEdits(businessId)), safe(() => openOrderLink(businessId))]);
      if (!alive) return;
      const description: LiveValue = known ?? (profile?.status === "ok" ? (profile.description ? { kind: "value", value: profile.description } : { kind: "none" }) : { kind: "error" });
      const own = order?.status === "ok" ? (order.links.find((l) => l.editable) ?? order.links[0] ?? null) : null;
      const booking: LiveValue = order?.status === "none" ? { kind: "notOffered" } : order?.status === "ok" ? (own ? { kind: "value", value: own.uri } : { kind: "none" }) : { kind: "error" };
      setLive({ description, booking });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `known` follows listingDescription
  }, [businessId, listingDescription, skip]);
  return live;
}

/** On the Google listing page (Day 25B): the plan's mode — Premium's
 * editors, Grow's steps, Free's locked steps — whether the rows come only
 * from the last scan (not connected), and the hours-mismatch fix's points. */
export interface ListingPageMode {
  mode: "edit" | "steps" | "locked";
  readOnly: boolean;
  hoursMismatchPoints: number | null;
}

export function ListingSection(props: GoogleProfileTabProps & { page?: ListingPageMode | null }) {
  const locale = useLocale();
  const page = props.page ?? null;
  const timeZone = useTimeZone();
  const groups = listingGroups({
    businessId: props.businessId,
    checks: props.checks,
    phone: props.listing.phone,
    website: props.listing.website,
    category: props.listing.category,
    openingHours: props.listing.openingHours,
    photoCount: props.listing.photoCount,
    rating: props.listing.rating,
    reviewCount: props.listing.reviewCount,
    messagingOn: props.messagingOn,
    replies: props.replyCounts ? { replied: props.replyCounts.replied, inWindow: props.replyCounts.reviewsInWindow } : null,
    booking: props.booking ?? null,
    media: props.media ?? null,
    extras: props.extras ?? null,
    // The page only: a website hours mismatch makes the Hours row ! ("to improve").
    hoursMismatch: page ? props.hoursMismatch === true : undefined,
  });
  const counts = listingCounts(groups);
  const live = useLiveValues(props.businessId, props.extras ? props.extras.description : undefined, page?.readOnly === true);
  const [open, setOpen] = useState<Editor | null>(null);
  // "#edit-services?add=Balayage": section 5's missing services, pre-filled.
  const [prefill, setPrefill] = useState<string[]>([]);
  // "#edit-hours?use=website|own": the hours-mismatch chooser's hours, pre-filled.
  const [startHours, setStartHours] = useState<StartHours>(null);
  // "#compare-hours" (the Overview's "Compare your hours"): the Hours row's compare panel.
  const [compareRequest, setCompareRequest] = useState(0);
  const businessId = props.businessId;
  // ?tab=google#edit-hours (the "Fix it with PostScore" links, the levers,
  // section 5's ideas) opens that row's editor — on load and while on the
  // page. No "run once" guard: under StrictMode (next dev) the effect runs,
  // cleans up and runs again, and a guard left the page with no listener.
  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash.startsWith("#compare-hours")) {
        setCompareRequest((n) => n + 1);
        requestAnimationFrame(() => document.getElementById("listing-hours")?.scrollIntoView({ block: "start" }));
        return;
      }
      const editor = editorFromHash(window.location.hash);
      if (!editor) return;
      setOpen(editor);
      setPrefill(prefillFromHash(window.location.hash));
      setStartHours(
        startHoursFromHash(window.location.hash, () => {
          try {
            return window.sessionStorage.getItem(ownHoursKey(businessId));
          } catch {
            return null;
          }
        })
      );
      requestAnimationFrame(() => document.getElementById(`listing-${EDITOR_ROW[editor]}`)?.scrollIntoView({ block: "start" }));
    };
    // A link to the hash the address bar already shows fires no
    // "hashchange" (the second click on "Add photos"): open it from the click.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href^='#edit-'], a[href^='#compare-']") as HTMLAnchorElement | null;
      if (a && a.getAttribute("href") === window.location.hash) openFromHash();
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", openFromHash);
      document.removeEventListener("click", onClick);
    };
  }, [businessId]);
  const ago = syncedAgo(props.replyCounts?.checkedAt ?? props.lastScanAt, Date.now());
  const agoText = ago ? t(locale, K(ago.unit === "days" && ago.count === 1 ? "ago.daysOne" : `ago.${ago.unit}`), { count: ago.count }) : null;
  const beta = GOOGLE_WRITES_FOR_EVERYONE ? "" : ` · ${t(locale, "dashboard.fixWithPostScore.beta")}`;

  return (
    <SectionHead n={page ? 1 : 4} id="listing" title={t(locale, K("s4.title"))} meta={page && page.mode !== "edit" ? undefined : `${t(locale, K("s4.meta"))}${beta}`} first={page ? true : undefined}>
      <Box className="mt-3 overflow-hidden p-0" data-testid="google-tab-listing">
        <div className={cn("flex flex-wrap items-center justify-between gap-2 border-b border-paper-line/70 px-3 py-2 text-[12.5px]", CREAM)}>
          <span className="whitespace-nowrap rounded-full border border-paper-line bg-white px-2.5 py-1 text-[12.5px] font-semibold text-green">
            {page?.readOnly ? (
              <span className="text-ink-mute">{props.lastScanAt ? t(locale, "dashboard.googleProfile.listingAsOf", { date: formatShortDate(props.lastScanAt, locale, timeZone) }) : t(locale, "dashboard.googleProfile.listingNoScan")}</span>
            ) : (
              <>● {props.practice ? t(locale, K(props.practiceSource === "real" ? "strip.practiceReal" : "strip.practice")) : agoText ? t(locale, K("strip.synced"), { ago: agoText }) : t(locale, K("strip.connected"))}</>
            )}
          </span>
          {props.practice && props.practiceSource === "fallback" && (
            <span data-testid="google-tab-practice-fallback" className="text-[12px] text-amber">
              {t(locale, K("strip.practiceFallback"))}
            </span>
          )}
          <span className="text-[12.5px] text-ink-mute" data-testid="google-tab-counts">
            {t(locale, K("count.ok"), { count: counts.ok })} · <b className="text-red">{t(locale, K("count.fix"), { count: counts.fix })}</b> ·{" "}
            <b className="text-amber">{t(locale, K("count.improve"), { count: counts.improve })}</b>
          </span>
          {props.listing.googleMapsUri && /^https:\/\//.test(props.listing.googleMapsUri) && (
            <a href={props.listing.googleMapsUri} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center whitespace-nowrap rounded-lg border border-paper-line bg-white px-2.5 text-[12.5px] font-semibold text-ink">
              {t(locale, K("strip.open"))}
            </a>
          )}
        </div>
        {groups.map((g, gi) => (
          <div key={g.id}>
            <div className={cn("px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-mute", CREAM, gi > 0 && "border-t border-paper-line/70")}>{t(locale, K(`group.${g.id}`))}</div>
            {g.rows.map((row) => (
              <ListingRowView key={row.id} row={row} props={props} page={page} live={live} prefill={prefill} startHours={startHours} compareRequest={compareRequest} open={row.action?.kind === "editor" && open === row.action.editor} onToggle={(e) => setOpen((cur) => (cur === e ? null : e))} />
            ))}
          </div>
        ))}
        <div className="border-t border-paper-line/70 px-3 pb-2">
          <GoogleMapsAttribution>
            <p className="text-[12px] text-ink-mute">
              {props.lastScanAt ? t(locale, "dashboard.googleProfile.listingAsOf", { date: formatShortDate(props.lastScanAt, locale, timeZone) }) : t(locale, "dashboard.googleProfile.listingNoScan")}
            </p>
          </GoogleMapsAttribution>
        </div>
      </Box>
    </SectionHead>
  );
}

/** The row's value and fixed note in words (the check's own note wins). */
export function rowText(row: ListingRow, locale: Locale, extra: { replyNote?: string | null; live?: LiveValues } = {}): { label: string; value: string; note: string | null; action: string | null } {
  const label = t(locale, K(`row.${row.id}.label`));
  const missing = t(locale, K("row.missing"));
  let value: string;
  let note: string | null = row.note;
  switch (row.id) {
    case "booking":
      // From the real link (the page's read): none / via {provider}, and whose it is.
      if (row.meta) {
        const m = row.meta;
        if (m.kind === "none") {
          value = t(locale, K("row.booking.none"));
          note = null;
        } else {
          value = t(locale, K("row.booking.via"), { provider: m.provider });
          note = m.tracking === "turn_on" ? t(locale, K("row.booking.notCounted"), { partner: m.provider }) : t(locale, K("row.booking.button"));
        }
        break;
      }
    // falls through: no read yet — the editor's live read
    case "description": {
      // Read from Google in the background (useLiveValues); "" while loading.
      const v = extra.live?.[row.id];
      note = t(locale, K(`row.${row.id}.note`));
      if (!v || v.kind === "loading") value = "";
      else if (v.kind === "error") {
        value = t(locale, K("row.liveFailed"));
        note = null;
      } else if (v.kind === "none") value = t(locale, K(`row.${row.id}.none`));
      else if (v.kind === "notOffered") value = t(locale, K("row.booking.notOffered"));
      else if (row.id === "description") {
        value = `“${v.value.length > 90 ? `${v.value.slice(0, 90).trimEnd()}…` : v.value}”`;
        note = v.value.trim().length < SHORT_DESCRIPTION ? t(locale, K("row.description.short"), { count: v.value.length }) : t(locale, K("row.description.chars"), { count: v.value.length });
      } else value = v.value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
      break;
    }
    case "messaging":
      value = t(locale, K(row.status === "ok" ? "row.messaging.on" : row.status === "warn" ? "row.messaging.off" : "row.messaging.unknown"));
      note = t(locale, K("row.messaging.note"));
      break;
    case "posts":
      // Read from Google: "{N} in the last 30 days · last one {date}" or "None in 30+ days".
      if (row.meta) {
        value = row.meta.kind === "none" ? t(locale, K("row.posts.none")) : t(locale, K(Number(row.value) === 1 ? "row.posts.countOne" : "row.posts.count"), { count: row.value ?? "0" });
        note = row.meta.lastAt ? t(locale, K("row.posts.last"), { date: formatShortDate(row.meta.lastAt, locale) }) : t(locale, K("row.posts.never"));
        break;
      }
      value = t(locale, K("row.soon"));
      note = t(locale, K("row.posts.note"));
      break;
    case "holiday":
      if (row.meta?.kind === "none") {
        value = t(locale, K("row.holiday.noneSoon"));
        note = null;
        break;
      }
      if (row.meta?.kind === "list") {
        // "Thanksgiving (Nov 26): not set · Christmas Eve (Dec 24): set".
        const list = JSON.parse(row.meta.list) as Array<{ id: string; date: { year: number; month: number; day: number }; set: boolean }>;
        value = list.map((h) => `${t(locale, K(`fields.holiday.${h.id}`))} (${formatShortDate(`${h.date.year}-${String(h.date.month).padStart(2, "0")}-${String(h.date.day).padStart(2, "0")}T12:00:00Z`, locale, "UTC").replace(/,? \d{4}$/, "")}): ${t(locale, K(h.set ? "row.holiday.set" : "row.holiday.notSet"))}`).join(" · ");
        note = t(locale, K("row.holiday.note"));
        break;
      }
      value = t(locale, K("row.soon"));
      note = t(locale, K(`row.${row.id}.note`));
      break;
    case "services": {
      const names = JSON.parse(row.meta?.names ?? "[]") as string[];
      value = names.length === 0 ? t(locale, K("row.services.none")) : names.length > 6 ? t(locale, K("row.services.more"), { list: names.slice(0, 6).join(", "), count: names.length - 6 }) : names.join(", ");
      note = t(locale, K("row.services.note"));
      break;
    }
    case "customerDetails":
      if (row.meta?.open !== undefined) {
        const mark = (part: "payment" | "parking" | "accessibility") => `${t(locale, `dashboard.gbpEdit.groupShort.${part}` as MessageKey)} ${row.meta![part] === "1" ? "✓" : "✗"}`;
        const open = Number(row.meta.open);
        value = [mark("payment"), mark("parking"), mark("accessibility")].join(" · ");
        note = [t(locale, K("row.customerDetails.scored")), ...(open > 0 ? [t(locale, K(open === 1 ? "row.customerDetails.moreOne" : "row.customerDetails.more"), { count: open })] : [])].join(" · ");
        break;
      }
      value = t(locale, K("row.customerDetails.value"));
      break;
    case "photos":
      if (row.meta?.kind === "read") {
        // "{N} photos · newest {X} months ago".
        value = t(locale, K("row.photos.read"), { count: row.value ?? "0", ago: Number(row.meta.months) === 0 ? t(locale, K("row.photos.thisMonth")) : t(locale, K(Number(row.meta.months) === 1 ? "row.photos.monthAgo" : "row.photos.monthsAgo"), { count: row.meta.months }) });
        note = t(locale, K("row.photos.addMore"));
        break;
      }
      if (row.meta?.kind === "none") {
        value = t(locale, K("row.photos.zero"));
        note = t(locale, K("row.photos.addMore"));
        break;
      }
      value = row.value !== null ? t(locale, K("row.photos.value"), { count: row.value }) : missing;
      note = t(locale, K("row.photos.note"));
      break;
    case "reviews":
      value = row.value !== null ? t(locale, K("row.reviews.value"), { value: row.value }) : missing;
      note = extra.replyNote ?? null;
      break;
    default:
      value = row.value ?? missing;
  }
  const action =
    row.action === null
      ? null
      : row.action.kind === "link"
        ? t(locale, K(row.id === "reviews" ? "action.openInbox" : row.id === "photos" ? "action.addOnGoogle" : row.id === "posts" ? "action.postIdeas" : "action.howTo"))
        : row.id === "booking" && row.meta?.kind === "none"
          ? t(locale, K("action.addLink"))
          : row.action.editor === "booking_partner"
            ? t(locale, K("action.managedBy"), { provider: row.meta?.provider ?? "" })
            : row.action.editor === "booking_steps"
              ? t(locale, K("action.turnOnBooking"))
              : row.action.editor === "services"
              ? t(locale, K("action.addServices"))
              : row.action.editor === "photos"
              ? t(locale, K("action.addPhotos"))
              : row.action.editor === "description" && row.meta?.short === "1"
              ? t(locale, K("action.writeWithPostAI"))
              : row.action.editor === "holiday"
              ? t(locale, K(row.status === "ok" ? "action.edit" : "action.setHolidays"))
              : t(locale, K(row.id === "messaging" ? "action.howToInline" : row.id === "customerDetails" ? "action.update" : row.status === "bad" ? "action.fix" : "action.edit"));
  return { label, value, note, action };
}

/** The rows only a connected listing can fill in (read from Google, nothing in the scan). */
const UNKNOWN_UNTIL_CONNECTED = ["description", "booking", "messaging", "holiday", "posts"];

function ListingRowView({ row, props, page = null, live, open, onToggle, prefill, startHours = null, compareRequest = 0 }: { row: ListingRow; props: GoogleProfileTabProps; page?: ListingPageMode | null; live: LiveValues; open: boolean; onToggle: (e: Editor) => void; prefill?: string[]; startHours?: StartHours; compareRequest?: number }) {
  const locale = useLocale();
  // The page: "+N pts" from the saved scan; Grow's steps or Free's lock instead of an editor.
  const points = page ? rowPoints(row.id, props.checks, { hoursMismatchPoints: row.id === "hours" && props.hoursMismatch ? page.hoursMismatchPoints : null }) : 0;
  const editing = !page || page.mode === "edit";
  const gbpEdit = useGbpEdit();
  const replyNote =
    row.id === "reviews" && props.replyCounts && props.replyCounts.reviewsInWindow > 0
      ? t(locale, K("row.reviews.note"), { replied: props.replyCounts.replied, total: props.replyCounts.reviewsInWindow })
      : row.id === "reviews"
        ? t(locale, K("row.reviews.noteNone"))
        : null;
  const base = rowText(row, locale, { replyNote, live });
  // Not connected: the rows only Google can tell are unknown until it is.
  const unknown = page?.readOnly && UNKNOWN_UNTIL_CONNECTED.includes(row.id) && (row.status === "neutral" || row.status === "soon");
  const text =
    page && row.id === "reviews" && base.action
      ? { ...base, action: t(locale, "dashboard.googlePages.listing.replyInReviews") }
      : unknown
        ? { ...base, value: t(locale, "dashboard.googlePages.listing.unknown") }
        : page?.readOnly && row.id === "photos" && !row.meta
          ? // The scan's photo count; the newest photo's date only comes with the connection.
            { ...base, note: t(locale, "dashboard.googlePages.listing.photosNote") }
          : page && row.id === "hours"
            ? // Google matches the website now: the scan is out of date — never "differs".
              { ...base, value: localizeHours(base.value, locale), ...(props.hoursMismatch && props.hoursMatchNow ? { note: t(locale, "dashboard.hoursCheck.staleTitle") } : {}) }
            : base;
  // Booking: the page's read already has it (meta); only an unread row waits for the live read.
  const loading = !unknown && (row.id === "description" || (row.id === "booking" && !row.meta)) && live[row.id].kind === "loading";
  const dot = STATUS_DOT[row.status];
  const strong = row.status === "bad";
  const actionBase = "inline-flex h-8 items-center whitespace-nowrap rounded-lg border px-2.5 text-[12.5px] font-semibold";
  const actionCls = cn(actionBase, strong ? "border-ink bg-ink text-white" : "border-paper-line text-ink hover:border-ink-soft");
  const plainCls = cn(actionBase, "border-paper-line bg-white text-ink hover:border-ink-soft");
  const primaryCls = cn(actionBase, "border-ink bg-ink text-white");
  // Hours: "Compare" (the website and Google show different hours) beside "Edit".
  const [compareOpen, setCompareOpen] = useState(false);
  const compare = row.id === "hours" && props.hoursMismatch === true && props.hoursMatchNow !== true;
  // Free: "Compare" shows both versions read-only; the steps stay locked.
  const compareReadOnly = page?.mode === "locked";
  useEffect(() => {
    if (compareRequest > 0 && compare) setCompareOpen(true);
  }, [compareRequest, compare]);
  return (
    <div id={`listing-${row.id}`} data-anchor-alias={ROW_ALIASES[row.id]} className="scroll-mt-24 border-t border-paper-line/70" data-testid={`listing-row-${row.id}`} data-status={row.status}>
      <div
        className={cn(
          "grid min-h-[44px] items-center gap-x-3 gap-y-0.5 px-3 py-[7px] text-[13px]",
          // The page, under 860px: the buttons and "+N pts" on their own line under the text, left-aligned.
          page ? "grid-cols-[24px_1fr] nav:grid-cols-[24px_160px_1fr_auto]" : "grid-cols-[24px_1fr_auto] sm:grid-cols-[24px_160px_1fr_auto]"
        )}
      >
        <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold", dot.cls)} aria-hidden>
          {dot.mark}
        </span>
        <span className="font-semibold">{text.label}</span>
        <span className={cn("col-start-2 row-start-2 min-w-0 text-[13px] leading-snug text-ink-soft", page ? "nav:col-start-auto nav:row-start-auto" : "sm:col-start-auto sm:row-start-auto")}>
          {loading ? (
            <span data-testid={`listing-loading-${row.id}`} aria-label={t(locale, K("row.loading"))} className="block h-3.5 w-48 max-w-full animate-pulse rounded bg-paper-deep motion-reduce:animate-none" />
          ) : (
            <span className="break-words" title={row.id === "photos" && row.meta?.kind === "read" ? t(locale, K("row.photos.tooltip")) : undefined}>
              {text.value}
            </span>
          )}
          {text.note && <small className="mt-0.5 block text-[12px] text-ink-mute line-clamp-2">{text.note}</small>}
        </span>
        {/* Flush with the card's right padding: every row's buttons share one right edge. */}
        <span
          className={cn(
            "flex flex-wrap items-center gap-1.5",
            page ? "col-start-2 row-start-3 mt-1 justify-start nav:col-start-auto nav:row-start-auto nav:mt-0 nav:justify-end" : "col-start-3 row-start-1 justify-end sm:col-start-auto sm:row-start-auto"
          )}
          data-testid={page ? `listing-actions-${row.id}` : undefined}
        >
          {points > 0 && (
            <span className="whitespace-nowrap rounded-full border border-[color:color-mix(in_srgb,var(--color-brass)_35%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)] px-2 py-0.5 text-[12px] font-semibold text-brass" data-testid={`listing-pts-${row.id}`}>
              {t(locale, "dashboard.googlePages.listing.rowPts", { points: pointsText(points) })}
            </span>
          )}
          {compare && (
            <button type="button" className={primaryCls} aria-expanded={compareOpen} data-testid="listing-action-compare" onClick={() => setCompareOpen(!compareOpen)}>
              {t(locale, compareOpen ? "dashboard.hoursChooser.hideShort" : "dashboard.hoursChooser.compareShort")}
            </button>
          )}
          {row.action?.kind === "link" &&
            (row.action.external ? (
              <a href={row.action.href} target="_blank" rel="noopener noreferrer" className={cn(actionCls, "inline-flex items-center gap-1")}>
                {text.action}
                <IconArrowUpRight size={13} aria-hidden />
              </a>
            ) : (
              <Link href={page ? listingPageHref(row.action.href, props.businessId) : row.action.href} className={page && row.id === "reviews" ? primaryCls : actionCls}>
                {text.action}
              </Link>
            ))}
          {row.action?.kind === "editor" && (
            <button
              type="button"
              className={compare ? plainCls : actionCls}
              aria-expanded={open}
              data-testid={`listing-action-${row.id}`}
              onClick={() => onToggle((row.action as { editor: Editor }).editor)}
            >
              {open ? t(locale, K("action.close")) : compare ? t(locale, K(editing ? "action.edit" : "action.howTo")) : editing || row.action.editor === "messaging" || row.action.editor === "booking_partner" || row.action.editor === "booking_steps" ? text.action : t(locale, K("action.howTo"))}
            </button>
          )}
        </span>
      </div>
      {open && row.action?.kind === "editor" && (
        <div className="border-t border-[color:color-mix(in_srgb,var(--color-brass)_18%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_5%,white)] px-3 pb-3 pt-2.5 sm:pl-[51px]" data-testid={`listing-editor-${row.id}`}>
          {editing ? (
            <RowEditor editor={row.action.editor} businessId={props.businessId} suggested={gbpEdit.websiteSuggested ?? null} booking={props.booking ?? null} prefill={prefill} startHours={startHours} />
          ) : page?.mode === "locked" ? (
            <LockedSteps />
          ) : row.action.editor === "messaging" || row.action.editor === "booking_partner" || row.action.editor === "booking_steps" ? (
            // Already a read-only panel or the steps themselves.
            <RowEditor editor={row.action.editor} businessId={props.businessId} suggested={null} booking={props.booking ?? null} />
          ) : (
            <RowSteps row={row} label={text.label} businessId={props.businessId} checks={props.checks} hoursMismatch={props.hoursMismatch === true} />
          )}
        </div>
      )}
      {/* "Your website and Google listing show different hours": the shared panel, from the row's "Compare". */}
      {compare && compareOpen && !open && (
        <div className="px-3 pb-2.5 sm:pl-[51px]" data-testid="listing-compare-hours">
          <HoursComparePanel businessId={props.businessId} onTab readOnly={compareReadOnly} lastScanAt={props.lastScanAt} />
          {compareReadOnly && (
            <div className="mt-2">
              <LockedSteps />
            </div>
          )}
        </div>
      )}
      {/* Day 23B: a PostScore change to this field is live — save it as the confirmed details? (asked once) */}
      {editing && (row.id === "phone" || row.id === "hours") && props.nowMatch?.[row.id] && (
        <div className="px-3 pb-2.5 sm:pl-[51px]">
          <NowMatchPrompt businessId={props.businessId} field={row.id} prompt={props.nowMatch[row.id]!} />
        </div>
      )}
      {/* After a choice, once a scan shows they match: "Hours match … ✓". */}
      {editing && row.id === "hours" && props.hoursMismatch === false && !open && (
        <div className="px-3 pb-2 sm:pl-[51px] empty:hidden">
          <HoursMismatchChooser businessId={props.businessId} mismatch={false} onTab />
        </div>
      )}
    </div>
  );
}

/** Grow (and a listing that isn't connected): how to fix the row yourself —
 * the score check's own "How to fix it" (the breakdown's words and links),
 * or the plain steps on Google for rows without a check — then "Premium does
 * this for you in one click →" where Premium can. */
function RowSteps({ row, label, businessId, checks, hoursMismatch }: { row: ListingRow; label: string; businessId: string; checks: GoogleProfileTabProps["checks"]; hoursMismatch: boolean }) {
  const locale = useLocale();
  const gbp = useGbpEdit();
  const check = ROW_CHECK[row.id] ? checks.find((c) => c.id === ROW_CHECK[row.id]) : undefined;
  const howTo = check ? checkHowTo(check, locale) : null;
  const S = (k: string) => `dashboard.googlePages.listing.steps.${k}` as MessageKey;
  // Rows without a score check that Premium still changes for you (holiday hours, services, description, booking link, photos).
  const premiumRow = !check && row.action?.kind === "editor" && ["holiday", "services", "description", "booking", "photos"].includes(row.action.editor);
  return (
    <div className="flex flex-col gap-1.5 text-[13px] text-ink" data-testid={`listing-steps-${row.id}`}>
      <b className="text-[12.5px]">{t(locale, S("title"))}</b>
      {howTo ? (
        <>
          <p className="leading-snug text-ink-soft">{howTo.steps}</p>
          {howTo.links.length > 0 && (
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              {howTo.links.map((l) =>
                l.external ? (
                  <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline decoration-brass underline-offset-2">
                    {l.label}
                    <IconArrowUpRight size={13} aria-hidden />
                  </a>
                ) : (
                  <Link key={l.href} href={l.href} className="font-semibold underline decoration-brass underline-offset-2">
                    {l.label}
                  </Link>
                )
              )}
            </p>
          )}
        </>
      ) : (
        <>
          <ol className="list-decimal space-y-0.5 pl-5 text-ink-soft">
            <li>{t(locale, S("generic1"))}</li>
            <li>{t(locale, S("generic2"), { field: label.toLowerCase() })}</li>
            <li>{t(locale, S("generic3"))}</li>
          </ol>
          <a href={GOOGLE_PROFILE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 font-semibold underline decoration-brass underline-offset-2">
            {t(locale, S("open"))}
            <IconArrowUpRight size={13} aria-hidden />
          </a>
        </>
      )}
      {check ? (
        <PremiumOneClickLine businessId={businessId} item={{ checkId: check.id, missingParts: (check.meta?.parts ?? "").split(",").filter(Boolean), hoursMismatch: row.id === "hours" && hoursMismatch }} />
      ) : (
        premiumRow && gbp.enabled && !gbp.premium && (
          <Link href={`/business/${businessId}/settings#compare-plans`} data-testid="premium-one-click" className="w-fit text-[12px] font-medium text-ink-mute underline decoration-brass/60 underline-offset-2 hover:text-ink">
            {t(locale, "dashboard.fix.premiumOneClick")}
          </Link>
        )
      )}
    </div>
  );
}

/** Free: the row and its points are the audit; the steps are on Grow. */
function LockedSteps() {
  const locale = useLocale();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-soft" data-testid="listing-steps-locked">
      <IconLock size={14} className="text-brass" aria-hidden />
      <span>{t(locale, "dashboard.googlePages.listing.locked")}</span>
      <UpgradeTrigger feature="grow" />
    </div>
  );
}

/** On the Google listing page, a link to a Google results anchor (the
 * post preview) goes to Google results; everything else stays. */
export function listingPageHref(href: string, businessId: string): string {
  return href.startsWith("#this-week") ? googleResultsHref(businessId, { hash: href }) : href;
}

/** A booking partner's button: read-only — no editor, no Approve / Undo,
 * no "changes to Google are off" banner (it doesn't apply). Case A: why
 * Google counts 0 bookings. */
function PartnerBookingPanel({ link, tracking }: { link: { uri: string; provider: string }; tracking: BookingTracking }) {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-1.5 text-[13px] text-ink" data-testid="booking-partner-panel">
      <a href={link.uri} target="_blank" rel="noopener noreferrer" className="w-fit break-all font-semibold underline decoration-brass underline-offset-2">
        {link.uri.replace(/^https?:\/\//, "")}
      </a>
      <p className="text-ink-soft">{t(locale, K("booking.partnerAdded"), { provider: link.provider })}</p>
      {tracking.kind === "partner_not_counted" && (
        <p data-testid="booking-not-counted" className="rounded-lg bg-white px-2.5 py-1.5 text-[12.5px] text-ink-soft">
          {t(locale, K("booking.notCountedA"), { provider: tracking.provider })}
        </p>
      )}
    </div>
  );
}

/** The existing editors, unchanged: their own preview → approve → read
 * back → undo, live-places lock and practice mode. */
function RowEditor({ editor, businessId, suggested, booking, prefill, startHours = null }: { editor: Editor; businessId: string; suggested: string | null; booking: BookingState | null; prefill?: string[]; startHours?: StartHours }) {
  if (editor === "holiday") return <HolidayHoursEditor businessId={businessId} />;
  if (editor === "services") return <ServicesEditor businessId={businessId} prefill={prefill} />;
  if (editor === "photos") return <PhotoUpload businessId={businessId} />;
  if (editor === "booking_partner" && booking && booking.link.kind === "partner") return <PartnerBookingPanel link={booking.link} tracking={booking.tracking} />;
  if (editor === "booking_steps" && booking && booking.tracking.kind === "turn_on") return <BookingStepsPanel businessId={businessId} provider={booking.tracking.provider} partnerId={booking.tracking.partnerId} still={booking.tracking.still} />;
  if (editor === "hours" || editor === "phone" || editor === "description") return <ProfileEditsOnGoogle businessId={businessId} fields={[editor]} orderLink={false} intro={false} startHours={editor === "hours" ? startHours : null} />;
  if (editor === "booking") return <ProfileEditsOnGoogle businessId={businessId} fields={[]} orderLink intro={false} />;
  if (editor === "website") return <WebsiteLinkFix businessId={businessId} suggested={suggested} autoLoad />;
  if (editor === "customer_details") return <CustomerDetailsGoogleEdit businessId={businessId} autoLoad openEditing />;
  return <GbpMessagingStep on={null} />;
}

// ---------------------------------------------------------------------------
// 6 Protection & changes
// ---------------------------------------------------------------------------

const GOOGLE_PROFILE_URL = "https://business.google.com/";
const SMALL_BTN = "inline-flex h-[26px] items-center rounded-md border px-2.5 text-[12px] font-semibold disabled:opacity-60";

/** Red banner at the top of the tab while Google's own edits are open. */
/** The banner at the top of the tab: the fields Google changed (never one
 * it only filled in that matches our scan), amber with "I know, that's
 * right" / "Review" — red with "Review" only for the name, the address or a
 * closed listing. */
/** The banner's one line ("Your hours were changed on Google on Nov 14"), or
 * null when nothing changed and the listing is open — also the Overview's
 * "Your Google listing" card's first line (Day 23B). */
export function googleEditsLine(saved: GoogleTabSaved | null, scan: { website?: string | null; phone?: string | null }, locale: Locale): { headline: string; serious: boolean; ids: string[] } | null {
  const edits = bannerEdits(saved?.googleEdits?.open ?? [], scan);
  const status = saved?.businessStatus ?? null;
  const closed = status === "CLOSED_TEMPORARILY" || status === "CLOSED_PERMANENTLY";
  if (edits.length === 0 && !closed) return null;
  const serious = bannerSerious(edits.map((e) => e.field), status);
  const latest = edits.map((e) => e.detected_at).sort().pop();
  const date = latest ? formatShortDate(latest, locale).replace(/,? \d{4}$/, "") : "";
  const names = edits.map((e) => t(locale, K(`banner.field.${e.field}`)));
  const headline =
    edits.length === 0
      ? t(locale, K(status === "CLOSED_PERMANENTLY" ? "banner.closed" : "banner.closedTemp"))
      : edits.length === 1
        ? t(locale, K(PLURAL_FIELDS.includes(edits[0].field) ? "banner.onePlural" : "banner.one"), { field: names[0], date })
        : t(locale, K("banner.many"), { fields: joinFields(names, t(locale, K("banner.and"))), date });
  return { headline, serious, ids: edits.map((e) => e.id) };
}

export function GoogleEditsBanner({ businessId, saved, scan }: { businessId: string; saved: GoogleTabSaved | null; scan: { website?: string | null; phone?: string | null } }) {
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const line = googleEditsLine(saved, scan, locale);
  if (hidden || !line) return null;
  const { headline, serious } = line;
  return (
    <div
      role={serious ? "alert" : "status"}
      data-testid="google-edits-banner"
      data-tone={serious ? "red" : "amber"}
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border px-3.5 py-2.5 text-[13px]",
        serious ? "border-red/30 bg-[color:color-mix(in_srgb,var(--color-red)_8%,white)] text-red" : "border-amber/30 bg-[color:color-mix(in_srgb,var(--color-amber)_10%,white)] text-ink"
      )}
    >
      <div className="min-w-0">
        <b className={serious ? "text-red" : "text-ink"}>{headline}</b>
        <p className="text-[12px] text-ink-mute">{t(locale, K("banner.why"))}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!serious && (
          <BannerAccept
            businessId={businessId}
            ids={line.ids}
            busy={busy}
            onDone={() => {
              setHidden(true);
              router.refresh();
            }}
            setBusy={setBusy}
          />
        )}
        <a href="#others" className={cn("inline-flex h-[30px] items-center rounded-lg border px-3 text-[12.5px] font-semibold", serious ? "border-red bg-red text-white" : "border-ink bg-white text-ink")} data-testid="banner-review">
          {t(locale, K("banner.review"))}
        </a>
      </div>
    </div>
  );
}

function BannerAccept({ businessId, ids, busy, onDone, setBusy }: { businessId: string; ids: string[]; busy: boolean; onDone: () => void; setBusy: (b: boolean) => void }) {
  const locale = useLocale();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await keepAllGoogleVersions(businessId, ids).catch(() => null);
        setBusy(false);
        if (r?.status === "ok") onDone();
      }}
      className="inline-flex h-[30px] items-center rounded-lg border border-ink bg-ink px-3 text-[12.5px] font-semibold text-paper disabled:opacity-60"
      data-testid="banner-accept"
    >
      {t(locale, K("banner.accept"))}
    </button>
  );
}

const quoted = (v: string | null, locale: Locale) => (v ? `“${v}”` : t(locale, K("others.emptyValue")));

/** One of Google's own edits: Google's version vs the owner's, side by side
 * (components/gbp/CompareVersions.tsx). "Keep Google's version" changes
 * nothing on Google; "Keep your version" sends it back through the safety
 * flow when writes are allowed, otherwise shows the steps on Google. */
export function GoogleEditItem({ businessId, edit, canEdit, practice, website = null }: { businessId: string; edit: GoogleEditRow; canEdit: boolean; practice: boolean; website?: GoogleProfileTabProps["websiteHours"] }) {
  // Hours: Google's version vs the WEBSITE's (last scan), when the site's hours could be read.
  if (edit.field === "hours" && website?.week) return <GoogleHoursVsWebsite businessId={businessId} edit={edit} canEdit={canEdit} website={{ ...website, week: website.week }} />;
  return <GoogleEditVsOwner businessId={businessId} edit={edit} canEdit={canEdit} practice={practice} noSiteHours={edit.field === "hours"} />;
}

/** Section 6's hours card: Google's hours vs the website's, day by day.
 * "Keep Google's version" → how to update the website (unless it already
 * matches); "Keep website's version" → the hours editor with the website's
 * hours (writes allowed) or the steps on Google. */
function GoogleHoursVsWebsite({ businessId, edit, canEdit, website }: { businessId: string; edit: GoogleEditRow; canEdit: boolean; website: NonNullable<GoogleProfileTabProps["websiteHours"]> & { week: WeeklyHours } }) {
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"choose" | "website" | "google">("choose");
  const google = codedToWeek(edit.google_value);
  const owner = codedToWeek(edit.owner_value);
  const siteMatchesGoogle = !!google && sameWeek(google, website.week);
  const ownerDiffers = !!owner && !(google && sameWeek(owner, google)) && !sameWeek(owner, website.week);
  const resolved = edit.resolution === "kept" || edit.resolution === "changed_back";
  async function keepGoogle() {
    setStage(siteMatchesGoogle ? "choose" : "website");
    setBusy(true);
    const r = await keepGoogleVersion(businessId, edit.id).catch(() => ({ status: "failed" }) as const);
    setBusy(false);
    if (r.status === "ok") router.refresh();
  }
  async function reopen() {
    setStage("choose");
    const r = await reopenGoogleEditAction(businessId, edit.id).catch(() => ({ status: "failed" }) as const);
    if (r.status === "ok") router.refresh();
  }
  return (
    <div className="border-t border-paper-line/60 py-2.5 first:border-t-0" data-testid="google-edit-hours">
      <CompareVersions
        question={t(locale, K("others.question"), { field: t(locale, K("protect.field.hours")).toLowerCase() })}
        versions={versionsOfHours(google, website.week, locale)}
        mineLabel={t(locale, "dashboard.compareVersions.website")}
        mineIcon="globe"
        mineFooter={
          ownerDiffers ? (
            <p className="text-[11.5px] text-ink-mute" data-testid="you-entered">
              {t(locale, K("others.youEntered"), { hours: shortWeek(owner, locale) })}
            </p>
          ) : null
        }
        googleButton={{ label: t(locale, K("others.keep")), note: t(locale, siteMatchesGoogle ? K("others.keepNote") : "dashboard.hoursChooser.keepGoogleNote"), onClick: keepGoogle, testId: "keep-google", disabled: busy }}
        mineButton={{ label: t(locale, "dashboard.compareVersions.keepWebsite"), note: t(locale, canEdit ? "dashboard.hoursChooser.keepWebsiteNoteWrite" : "dashboard.hoursChooser.keepWebsiteNoteGuide"), onClick: () => setStage("google"), testId: "keep-website", primary: true, disabled: busy }}
        chosen={resolved ? { text: t(locale, K("others.chosenGoogle")), at: edit.resolved_at ?? edit.detected_at, onChange: reopen } : stage === "google" ? { text: t(locale, "dashboard.hoursChooser.chosen.website"), at: new Date().toISOString(), onChange: () => setStage("choose") } : null}
      >
        {stage === "website" && <FixWebsite view={website} week={google} locale={locale} />}
        {stage === "google" && <FixGoogle businessId={businessId} view={{ canEdit }} week={website.week} own={false} onTab />}
      </CompareVersions>
    </div>
  );
}

function GoogleEditVsOwner({ businessId, edit, canEdit, practice, noSiteHours = false }: { businessId: string; edit: GoogleEditRow; canEdit: boolean; practice: boolean; noSiteHours?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"choose" | "confirm" | "guide">("choose");
  const [msg, setMsg] = useState<{ key: string; tone: "ok" | "warn" | "bad" } | null>(null);
  const label = t(locale, K(`protect.field.${edit.field}`));
  const versions = versionsOfEdit(edit.field, edit.google_value, edit.owner_value, locale);
  const resolved = edit.resolution === "kept" || edit.resolution === "changed_back";
  // Google filled in something the owner left empty: only "Change on Google" (sending "nothing" would clear it).
  const added = !edit.owner_value;
  const inApp = !added && canChangeBack(edit.field) && canEdit;
  async function keep() {
    setBusy(true);
    const r = await keepGoogleVersion(businessId, edit.id).catch(() => ({ status: "failed" }) as const);
    setBusy(false);
    if (r.status === "ok") router.refresh();
    else setMsg({ key: "others.actionFailed", tone: "bad" });
  }
  async function sendBack() {
    setBusy(true);
    const r = await changeGoogleEditBack(businessId, edit.id, practice ? "accept" : null).catch(() => ({ status: "error", error: "failed" }) as ChangeBackResult);
    setBusy(false);
    if (r.status === "sent" || r.status === "pending_review" || r.status === "no_change") {
      setMsg({ key: r.status === "sent" ? "others.back.sent" : r.status === "pending_review" ? "others.back.pending" : "others.back.noChange", tone: r.status === "pending_review" ? "warn" : "ok" });
      router.refresh();
    } else if (r.status === "editing_off" || r.status === "on_google" || r.status === "google_added") setStage("guide");
    else setMsg({ key: "others.actionFailed", tone: "bad" });
  }
  async function reopen() {
    if (edit.resolution === "changed_back") {
      document.getElementById("google-tab-made")?.scrollIntoView({ block: "start" });
      return;
    }
    const r = await reopenGoogleEditAction(businessId, edit.id).catch(() => ({ status: "failed" }) as const);
    if (r.status === "ok") router.refresh();
  }
  const mineLines = versions.kind === "days" ? versions.days.map((d) => `${d.label}: ${d.mine}`) : edit.owner_value ? [edit.owner_value] : [];
  return (
    <div className="border-t border-paper-line/60 py-2.5 first:border-t-0" data-testid={`google-edit-${edit.field}`}>
      <CompareVersions
        question={t(locale, K("others.question"), { field: label.toLowerCase() })}
        versions={versions}
        mineLabel={t(locale, K("others.yourVersion"))}
        mineFooter={noSiteHours ? <p className="text-[11.5px] text-ink-mute" data-testid="no-site-hours">{t(locale, K("others.noSiteHours"))}</p> : null}
        googleButton={{ label: t(locale, K("others.keep")), note: t(locale, K("others.keepNote")), onClick: keep, testId: "keep-google", disabled: busy }}
        mineButton={
          added
            ? { label: t(locale, K("others.changeOnGoogle")), note: t(locale, K("others.noteGuide")), onClick: () => setStage("guide"), testId: "change-back", primary: true, disabled: busy }
            : { label: t(locale, K("others.keepMine")), note: t(locale, K(inApp ? "others.noteWrite" : "others.noteGuide")), onClick: () => setStage(inApp ? "confirm" : "guide"), testId: "change-back", primary: true, disabled: busy }
        }
        chosen={resolved ? { text: t(locale, K(edit.resolution === "kept" ? "others.chosenGoogle" : "others.chosenMine")), at: edit.resolved_at ?? edit.detected_at, onChange: reopen } : null}
      >
        {!resolved && stage === "confirm" && (
          <div className="flex flex-col gap-1.5 rounded-lg bg-paper p-2.5 text-[12.5px]" data-testid="change-back-preview">
            <b>{t(locale, K("others.previewTitle"), { field: label.toLowerCase() })}</b>
            {versions.kind === "days" ? <HoursLines lines={mineLines} /> : <p className="text-[14px] font-semibold">{edit.owner_value}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={sendBack} className={cn(SMALL_BTN, "border-ink bg-ink text-paper")} data-testid="approve-change-back">
                {t(locale, K("others.approve"))}
              </button>
              <button type="button" disabled={busy} onClick={() => setStage("choose")} className={cn(SMALL_BTN, "border-paper-line bg-white text-ink")}>
                {t(locale, K("others.cancel"))}
              </button>
            </div>
            <p className="text-ink-mute">{t(locale, K("others.previewNote"))}</p>
          </div>
        )}
        {!resolved && stage === "guide" && (
          <div className="rounded-lg bg-paper p-2.5 text-[12.5px]" data-testid="change-back-guide">
            <b>{t(locale, K("others.guide.title"))}</b>
            {!canChangeBack(edit.field) && <p className="mt-0.5 text-ink-soft">{t(locale, K("others.guide.why"))}</p>}
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>{t(locale, K("others.guide.step1"))}</li>
              <li>{t(locale, K("others.guide.step2"), { field: label })}</li>
              <li>{added ? t(locale, K("others.guide.step3Added")) : versions.kind === "days" ? t(locale, K("others.guide.step3Hours")) : t(locale, K("others.guide.step3"), { value: edit.owner_value ?? "" })}</li>
            </ol>
            {versions.kind === "days" && !added && <HoursLines lines={mineLines} />}
            <div className="mt-2 flex flex-wrap gap-2">
              <a href={GOOGLE_PROFILE_URL} target="_blank" rel="noopener noreferrer" className={cn(SMALL_BTN, "w-fit border-ink bg-ink text-paper")}>
                {t(locale, K("others.openOnGoogle"))}
              </a>
              {!added && <CopyLines lines={mineLines} />}
            </div>
          </div>
        )}
        {msg && (
          <p role="status" className={cn("text-[12.5px]", msg.tone === "ok" ? "text-green" : msg.tone === "warn" ? "text-amber" : "text-red")}>
            {t(locale, K(msg.key))}
          </p>
        )}
      </CompareVersions>
    </div>
  );
}

function HoursLines({ lines }: { lines: string[] }) {
  return (
    <ul className="mt-1 text-[12.5px] text-ink">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

function CopyLines({ lines }: { lines: string[] }) {
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  if (lines.length === 0) return null;
  return (
    <button type="button" onClick={() => void navigator.clipboard?.writeText(lines.join("\n")).then(() => setCopied(true), () => undefined)} className={cn(SMALL_BTN, "border-paper-line bg-white text-ink")} data-testid="copy-value">
      {t(locale, K(copied ? "others.copied" : "others.copy"))}
    </button>
  );
}

function CheckNow({ businessId, checkedAt }: { businessId: string; checkedAt: string | null }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "too_soon" | "failed">("idle");
  async function run() {
    setState("busy");
    const r = await checkGoogleEditsNow(businessId).catch(() => ({ status: "failed" }) as const);
    setState(r.status === "ok" ? "done" : r.status === "too_soon" ? "too_soon" : "failed");
    if (r.status === "ok") router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-paper-line/60 pt-2 text-[12.5px] text-ink-mute" data-testid="google-edits-check">
      <span>{state === "done" ? t(locale, K("others.checkedNow")) : checkedAt ? t(locale, K("others.lastChecked"), { time: formatMonthDayTime(checkedAt, locale, timeZone) }) : t(locale, K("others.notChecked"))}</span>
      <span className="flex items-center gap-2">
        {state === "too_soon" && <span className="text-amber">{t(locale, K("others.tooSoon"))}</span>}
        {state === "failed" && <span className="text-red">{t(locale, K("others.checkFailed"))}</span>}
        <button type="button" disabled={state === "busy"} onClick={run} className="font-semibold text-ink underline underline-offset-2 disabled:opacity-60" data-testid="check-now">
          {state === "busy" ? t(locale, K("others.checking")) : t(locale, K("others.checkNow"))}
        </button>
      </span>
    </div>
  );
}

function madeValueText(v: MadeValue | null | undefined, locale: Locale): string | null {
  if (!v) return null;
  if ("text" in v) return v.text;
  if ("added" in v) return t(locale, K("made.added"), { list: v.added.join(", ") });
  if ("photos" in v) return t(locale, K(v.photos === 1 ? "made.photosOne" : "made.photos"), { count: v.photos });
  return v.dates
    .map((d) => {
      const date = formatShortDate(`${d.date}T12:00:00Z`, locale, "UTC").replace(/,? \d{4}$/, "");
      return d.closed ? t(locale, K("made.dateClosed"), { date }) : t(locale, K("made.dateOpen"), { date, open: timeText(d.open ?? undefined, locale), close: timeText(d.close ?? undefined, locale) });
    })
    .join(", ");
}

const MADE_SHOWN = 10;

function MadeRow({ businessId, c, practice, canEdit }: { businessId: string; c: MadeChange; practice: boolean; canEdit: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const value = madeValueText(c.value, locale);
  async function undo() {
    if (!c.batchId) return;
    setState("busy");
    const r = await undoMadeChange(businessId, c.batchId, practice ? "accept" : null).catch(() => ({ status: "failed" }) as const);
    if (r.status === "ok") router.refresh();
    else setState("failed");
  }
  return (
    <div className="flex flex-col border-t border-paper-line/60 py-2 text-[13px] first:border-t-0" data-testid="made-row">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-ink-soft">
          {c.practice && (
            <span className="mr-1.5 rounded-full bg-[color:color-mix(in_srgb,var(--color-amber)_14%,white)] px-1.5 py-0.5 text-[10.5px] font-bold text-amber" data-testid="made-practice">
              {t(locale, K("made.practice"))}
            </span>
          )}
          <b className="text-ink">{t(locale, K(`made.kind.${c.kind}`))}</b>
          {value && <>: {value}</>} <span className="text-ink-mute">· {formatShortDate(c.at, locale)}</span>
        </span>
        <span className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap", c.status === "live" ? "font-semibold text-green" : c.status === "reviewing" || c.status === "undo" || c.status === "held" ? "text-amber" : c.status === "failed" || c.status === "rejected" ? "text-red" : "text-ink-mute")}>
          {c.status === "undo" ? t(locale, K(c.daysLeft === 1 ? "made.status.undoOne" : "made.status.undo"), { count: c.daysLeft }) : t(locale, K(`made.status.${c.status}`))}
          {c.status === "undo" && canEdit && c.batchId && (
            <button type="button" disabled={state === "busy"} onClick={undo} className={cn(SMALL_BTN, "border-paper-line text-ink")} data-testid="made-undo">
              {state === "busy" ? t(locale, K("made.undoing")) : t(locale, K("made.undo"))}
            </button>
          )}
        </span>
      </div>
      {state === "failed" && <p className="text-[12px] text-red">{t(locale, K("made.undoFailed"))}</p>}
    </div>
  );
}

/** `page` (Google listing): section 3. `plan` (the page's mode): Premium as
 * on the old tab; Grow sees changes by anyone else with the steps to change
 * them back yourself (no "Made from PostScore"); Free a locked teaser. */
export function ProtectionSection(props: GoogleProfileTabProps & { page?: boolean; mode?: ListingPageMode["mode"] }) {
  const locale = useLocale();
  const [showAll, setShowAll] = useState(false);
  if (props.mode === "locked") return <ProtectionLocked />;
  const showMade = props.mode !== "steps";
  const saved = props.saved;
  const others = saved?.others ?? null;
  const edits = saved?.googleEdits ?? null;
  const canEdit = props.canEditGoogle === true;
  const status = saved?.businessStatus ?? null;
  const statusKey = status === "OPERATIONAL" ? "open" : status === "CLOSED_TEMPORARILY" ? "closedTemp" : status === "CLOSED_PERMANENTLY" ? "closed" : "unknown";
  const verified = props.extras?.verified === true;
  const made = saved?.made ?? [];
  const shown = showAll ? made : made.slice(0, MADE_SHOWN);
  const li = "flex items-start justify-between gap-3 border-t border-paper-line/60 py-2 text-[13px] first:border-t-0";
  // Open edits first, then the ones chosen in the last day (collapsed: "✓ You kept …").
  const shownEdits = [...(edits?.open ?? []), ...(edits?.recent ?? []).filter((r) => !(edits?.open ?? []).some((o) => o.field === r.field))];
  // Never "Unchanged" while a change is listed: between-scan changes + Google's open edits
  // (not one Google only filled in that matches our scan — that's info only).
  const scan = { website: props.listing.website, phone: props.listing.phone };
  const realOpen = (edits?.open ?? []).filter((e) => !isInfoOnly(e, scan));
  const openFields = realOpen.map((e) => (e.field === "title" ? "name" : e.field));
  const watched = watchedSummary(others?.fields ?? [], realOpen.map((e) => e.field));
  return (
    <SectionHead n={props.page ? 3 : 6} id="protection" title={t(locale, K("s6.title"))} meta={t(locale, K("s6.meta"))} first={props.page ? false : undefined}>
      <div className="mt-3.5 grid gap-4 sm:grid-cols-2">
        <Box className={cn("scroll-mt-24 p-3.5", (shownEdits.length > 0 || !showMade) && "sm:col-span-2")} id="others" data-testid="google-tab-others">
          <Eyebrow>{t(locale, K("others.title"))}</Eyebrow>
          <div className="mt-2">
            <div className={cn(li, shownEdits.length > 0 && "flex-col items-stretch")}>
              <span className="text-ink-soft">{t(locale, K("others.suggested"))}</span>
              {!edits || !edits.available ? (
                <span className="text-ink-mute">{t(locale, K("others.unknown"))}</span>
              ) : shownEdits.length === 0 ? (
                <b className="text-green">{t(locale, K("others.none"))} ✓</b>
              ) : (
                <div data-testid="google-edits-list">
                  {shownEdits.map((e) =>
                    isInfoOnly(e, scan) ? (
                      // Google filled in what the owner left empty, and it matches our scan: info only.
                      <p key={e.id} className="border-t border-paper-line/60 py-2 text-[13px] first:border-t-0" data-testid={`google-added-${e.field}`}>
                        <b>{t(locale, K(`protect.field.${e.field}`))}:</b> {e.google_value} <span className="text-ink-mute">· {t(locale, K("others.addedByGoogle"))}</span> <b className="text-green">{t(locale, K("others.looksRight"))} ✓</b>
                      </p>
                    ) : (
                      <GoogleEditItem key={e.id} businessId={props.businessId} edit={e} canEdit={canEdit} practice={props.practice} website={props.websiteHours ?? null} />
                    )
                  )}
                </div>
              )}
            </div>
            <div className={cn(li, watched.length > 0 && "flex-col items-stretch gap-1")}>
              <span className="text-ink-soft">{t(locale, K("others.fields"))}</span>
              {others === null && watched.length === 0 ? (
                <span className="text-ink-mute">{t(locale, K("others.unknownScan"))}</span>
              ) : watched.length === 0 ? (
                <b className="text-green">{t(locale, K("others.unchanged"))} ✓</b>
              ) : (
                <div data-testid="google-tab-others-changed">
                  <b className="text-amber" data-testid="watched-summary">
                    {t(locale, K("others.changedCount"), { count: watched.length, fields: watched.map((f) => t(locale, K(`protect.field.${f}`)).toLowerCase()).join(", ") })}
                  </b>
                  <ul className="mt-0.5 space-y-0.5">
                    {watched.map((f) => {
                      const ch = others?.changes?.find((c) => c.field === f);
                      return (
                        <li key={f} className="text-ink-soft">
                          <b className="text-ink">{t(locale, K(`protect.field.${f}`))}:</b>{" "}
                          {ch && (ch.from || ch.to) ? (
                            <>
                              {quoted(ch.from, locale)} → {quoted(ch.to, locale)}
                              {others?.at && <span className="text-ink-mute"> · {formatShortDate(others.at, locale)}</span>}
                            </>
                          ) : openFields.includes(f) ? (
                            t(locale, K("others.changedByGoogle"))
                          ) : (
                            t(locale, K("others.changedShort"))
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
            <div className={li}>
              <span className="text-ink-soft">{t(locale, K("others.status"))}</span>
              <b className={statusKey === "open" ? "text-green" : statusKey === "unknown" ? "text-ink-mute" : "text-red"} data-testid="listing-status">
                {t(locale, K(`others.statusValue.${statusKey}`))}
                {verified && <span className="font-semibold"> · {t(locale, K("others.verified"))}</span>}
              </b>
            </div>
          </div>
          {props.connected && edits?.available && <CheckNow businessId={props.businessId} checkedAt={edits.checkedAt} />}
          <p className="mt-2 text-[12px] text-ink-mute">{t(locale, K("others.note"))}</p>
        </Box>
        {showMade && (
        <Box className="p-3.5" data-testid="google-tab-made">
          <Eyebrow>{t(locale, K("made.title"))}</Eyebrow>
          <div className="mt-2">
            {made.length === 0 ? (
              <p className="py-2 text-[13px] text-ink-mute">{t(locale, K("made.empty"))}</p>
            ) : (
              shown.map((c, i) => <MadeRow key={`${c.batchId ?? c.at}-${i}`} businessId={props.businessId} c={c} practice={props.practice} canEdit={canEdit} />)
            )}
          </div>
          {made.length > MADE_SHOWN && (
            <button type="button" onClick={() => setShowAll(!showAll)} className="mt-1 text-[12.5px] font-semibold text-ink underline underline-offset-2" data-testid="made-show-all">
              {showAll ? t(locale, K("made.showLess")) : t(locale, K("made.showAll"), { count: made.length })}
            </button>
          )}
        </Box>
        )}
      </div>
    </SectionHead>
  );
}

/** Free: what the protection does, no live details (no changes, no status). */
function ProtectionLocked() {
  const locale = useLocale();
  return (
    <SectionHead n={3} id="protection" title={t(locale, K("s6.title"))} first={false}>
      <Box className="mt-3.5 flex flex-col gap-2 p-3.5" data-testid="google-listing-protection-locked">
        <Eyebrow className="flex items-center gap-1.5">
          <IconLock size={13} aria-hidden />
          {t(locale, K("others.title"))}
        </Eyebrow>
        <p className="max-w-[720px] text-[13.5px] leading-snug text-ink-soft">{t(locale, "dashboard.googlePages.listing.protectLocked")}</p>
        <UpgradeTrigger feature="grow" />
      </Box>
    </SectionHead>
  );
}

// ---------------------------------------------------------------------------
// The Google listing page (Presence). Day 25B step 2.
// ---------------------------------------------------------------------------

export interface GoogleListingPageProps extends GoogleProfileTabProps {
  plan: Plan;
  /** The saved scan's Google-listing points (the "completeness" category) and total score. */
  listingPoints: { points: number; weight: number } | null;
  score: number | null;
  /** The hours-mismatch fix's points (the website check's), for the Hours row's "+N pts". */
  hoursMismatchPoints?: number | null;
}

const LISTING_LABELS: Partial<Record<string, MessageKey>> = {};
const LINK = "font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink";
const L = (k: string) => `dashboard.googlePages.listing.${k}` as MessageKey;

/** Presence → Google listing (mockup 05). Every plan sees the rows and their
 * "+N pts" (the audit). Premium (connected) fixes them here; Grow gets the
 * steps to do it yourself with "Premium does this for you in one click →";
 * Free sees the steps locked. Not connected: the rows from the last scan
 * under a Connect card. */
export function GoogleListingPage(props: GoogleListingPageProps) {
  const locale = useLocale();
  const premium = isPremiumPlan(props.plan);
  const live = props.connected || props.practice;
  const mode: ListingPageMode["mode"] = props.plan === "free" ? "locked" : premium && live ? "edit" : "steps";
  const sample = props.practice && !(props.insights && props.insights.length > 0);
  const fix = props.listingPoints && props.score !== null ? listingFixLine(props.checks, props.listingPoints, props.score) : null;
  const lead = mode === "edit" ? L("lead") : mode === "steps" ? L("leadGrow") : L("leadFree");
  return (
    <div className="flex flex-col pb-[68px]" data-testid="google-listing-page" data-mode={mode} data-view={live ? "connected" : "not-connected"}>
      <header className="mb-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 font-serif text-[28px] font-semibold leading-tight text-ink">
          {t(locale, L("title"))}
          {props.listingPoints && (
            <span className="font-sans text-[15px] font-semibold text-ink-soft" data-testid="google-listing-pts">
              {t(locale, L("pts"), { earned: pointsText(Math.round(props.listingPoints.points * 10) / 10), of: pointsText(props.listingPoints.weight) })}
            </span>
          )}
        </h1>
        <p className="mt-1 max-w-[720px] text-[14px] leading-snug text-ink-soft">{t(locale, lead)}</p>
      </header>
      {props.result && (
        <p id={GBP_PROFILE_ANCHOR} role="status" className={cn("mb-3 scroll-mt-20 text-[13px] font-medium", props.result === "connected" ? "text-green" : "text-red")}>
          {gbpResultText(locale, props.result, props.business)}
        </p>
      )}
      {/* Presence's one link into Growth: what the listing brings in. */}
      <p className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-paper-line bg-white px-3.5 py-2.5 text-[13px] text-ink-soft" data-testid="google-listing-brings-in">
        <span>{t(locale, L("bringsIn"))}</span>
        <Link href={googleResultsHref(props.businessId)} className={LINK}>
          {t(locale, L("bringsInLink"))}
        </Link>
      </p>
      {fix && (
        <p className="mb-3 text-[13.5px] text-ink" data-testid="google-listing-fix-line">
          <b className="font-semibold">{t(locale, L(fix.count === 1 ? "fixOne" : "fixMany"), { count: fix.count, from: pointsText(fix.from), to: pointsText(fix.to), scoreFrom: fix.scoreFrom, scoreTo: fix.scoreTo })}</b>{" "}
          <Link href={fixPlanHref(props.businessId)} className={LINK} data-testid="google-listing-fix-plan">
            {t(locale, L("fixPlanLink"))}
          </Link>
        </p>
      )}
      {live && <GoogleEditsBanner businessId={props.businessId} saved={props.saved} scan={{ website: props.listing.website, phone: props.listing.phone }} />}
      {!live && <ListingNotConnected {...props} />}
      {live && <JumpMenu sample={sample} sections={LISTING_SECTIONS} labels={LISTING_LABELS} />}
      <ListingSection {...props} page={{ mode, readOnly: !live, hoursMismatchPoints: props.hoursMismatchPoints ?? null }} />
      {live && <NextSection {...props} sample={sample} page howTo={mode === "edit" ? null : mode} />}
      {/* §2d: answering customers' common questions (description, services, customer details) is a Presence fix —
          here, not on the Growth plan. */}
      {live && props.connected && props.plan !== "free" && (
        <div id="listing-answers" className="scroll-mt-20">
          <AnswersCard businessId={props.businessId} premium={premium} />
        </div>
      )}
      {(live || mode === "locked") && <ProtectionSection {...props} page mode={mode} />}
    </div>
  );
}

/** Not connected: the Connect card above the rows from the last scan. */
function ListingNotConnected(props: GoogleListingPageProps) {
  const locale = useLocale();
  const premium = isPremiumPlan(props.plan);
  const button = "inline-flex w-fit items-center rounded-lg bg-ink px-4 py-2 text-[13.5px] font-semibold text-paper hover:bg-ink/90";
  return (
    <Box className="mb-1 flex flex-col gap-2 p-4" data-testid="google-listing-not-connected">
      <h2 className="font-serif text-[18px] font-semibold text-ink">{t(locale, L(premium ? "notConnected.title" : "notConnected.titleGrow"))}</h2>
      <p className="max-w-[720px] text-[13.5px] leading-snug text-ink-soft">{t(locale, L(props.needsReconnect ? "notConnected.reconnectBody" : premium ? "notConnected.body" : "notConnected.bodyGrow"))}</p>
      {props.canStart ? (
        <a href={gbpConnectHref(props.businessId, "profile")} className={button} data-testid="google-listing-connect">
          {t(locale, props.needsReconnect ? "dashboard.googlePages.results.notConnected.reconnect" : "dashboard.googlePages.results.notConnected.connect")}
        </a>
      ) : (
        <Link href={`/business/${props.businessId}/connect-gbp`} className={button} data-testid="google-listing-connect">
          {t(locale, "dashboard.googlePages.results.notConnected.connect")}
        </Link>
      )}
    </Box>
  );
}
