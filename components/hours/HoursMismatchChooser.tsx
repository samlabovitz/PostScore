"use client";

// "Compare your site and Google listing": ONE panel wherever the "website
// and Google listing show different hours" recommendation appears (Overview
// Top recommendations, the Growth recap step, the Google Profile tab's Hours
// row). Google's hours and the website's side by side, day by day
// (components/gbp/CompareVersions.tsx), then only the fix for the other side:
//   "Keep website's hours" → Google: the hours editor pre-filled with the
//      website's hours (writes allowed) or the steps on Google;
//   "Keep Google's version" → the website: the builder's steps + the hours;
//   "Neither is right?" → the owner types them (from Google's), then both fixes.
// The choice is remembered in this browser until a scan shows the hours
// match (lib/hoursChooser.ts). Points never change here.

import { googleListingHref } from "@/lib/routes";
import { useEffect, useState } from "react";
import { openHoursCompare, type OpenHoursCompareResult } from "@/app/actions/hoursChooser";
import { builderGuideFor } from "@/lib/websiteBuilderGuides";
import { WEEK_ORDER, closedWeek, timeInput, parseTimeInput, type WeeklyHours } from "@/lib/gbpProfileEdits";
import { choiceKey, choiceState, dayName, fixesFor, hoursLines, ownHoursKey, parseStoredChoice, type HoursChoice, type StoredChoice } from "@/lib/hoursChooser";
import { versionsOfHours } from "@/lib/compareVersions";
import { CompareVersions } from "@/components/gbp/CompareVersions";
import { t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PremiumOneClickLine } from "@/components/scoring/PremiumOneClickLine";

const K = (key: string) => `dashboard.hoursChooser.${key}` as MessageKey;
const GOOGLE_BUSINESS_URL = "https://business.google.com/";
const BTN = "inline-flex h-[30px] w-fit items-center rounded-lg border px-3 text-[12.5px] font-semibold";

function readChoice(businessId: string): StoredChoice | null {
  try {
    return parseStoredChoice(window.localStorage.getItem(choiceKey(businessId)));
  } catch {
    return null;
  }
}
function saveChoice(businessId: string, choice: HoursChoice, at: string) {
  try {
    window.localStorage.setItem(choiceKey(businessId), JSON.stringify({ choice, at }));
  } catch {
    // Private window: the panel still works; it just won't remember.
  }
}
function forgetChoice(businessId: string) {
  try {
    window.localStorage.removeItem(choiceKey(businessId));
  } catch {
    // nothing to forget
  }
}

function CopyHours({ lines }: { lines: string[] }) {
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  if (lines.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(lines.join("\n")).then(() => setCopied(true), () => setCopied(false));
      }}
      className={cn(BTN, "border-paper-line bg-white text-ink")}
      data-testid="copy-hours"
    >
      {copied ? t(locale, K("copied")) : t(locale, K("copy"))}
    </button>
  );
}

function HoursList({ lines }: { lines: string[] }) {
  return (
    <ul className="text-[12.5px] text-ink">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

/** a / c: fix Google — the editor (writes allowed) or the steps on Google. */
export function FixGoogle({ businessId, view, week, own, onTab }: { businessId: string; view: { canEdit: boolean }; week: WeeklyHours | null; own: boolean; onTab: boolean }) {
  const locale = useLocale();
  const lines = hoursLines(week, locale);
  if (view.canEdit) {
    const hash = own ? "#edit-hours?use=own" : "#edit-hours?use=website";
    const go = () => {
      if (own && week) {
        try {
          window.sessionStorage.setItem(ownHoursKey(businessId), JSON.stringify(week));
        } catch {
          // falls back to the editor's current hours
        }
      }
    };
    return (
      <div className="flex flex-col gap-1.5" data-testid="fix-google-editor">
        <b className="text-[13px]">{t(locale, K(own ? "google.titleOwn" : "google.title"))}</b>
        <a href={onTab ? hash : googleListingHref(businessId, { hash })} onClick={go} className={cn(BTN, "border-ink bg-ink text-paper")} data-testid="open-hours-editor">
          {t(locale, K(own ? "google.buttonOwn" : "google.button"))}
        </a>
        <p className="text-[12px] text-ink-mute">{t(locale, K("google.safety"))}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5" data-testid="fix-google-steps">
      <b className="text-[13px]">{t(locale, K("google.stepsTitle"))}</b>
      <ol className="list-decimal space-y-0.5 pl-5 text-[12.5px]">
        <li>{t(locale, K("google.step1"))}</li>
        <li>{t(locale, K("google.step2"))}</li>
        <li>{t(locale, K("google.step3"))}</li>
      </ol>
      <HoursList lines={lines} />
      <div className="flex flex-wrap gap-2">
        <a href={GOOGLE_BUSINESS_URL} target="_blank" rel="noopener noreferrer" className={cn(BTN, "border-ink bg-ink text-paper")}>
          {t(locale, K("openOnGoogle"))}
        </a>
        <CopyHours lines={lines} />
      </div>
      {/* Grow and Free: the steps, never a write — and what Premium does instead (hidden on Premium). */}
      <PremiumOneClickLine businessId={businessId} item={{ checkId: "website.info_consistency", hoursMismatch: true }} />
    </div>
  );
}

/** b / c: fix the website — the builder's steps, the hours, and (managed sites) ask Sam. */
export function FixWebsite({ view, week, locale }: { view: Pick<Extract<OpenHoursCompareResult, { status: "ok" }>, "builder" | "siteUrl" | "managedEmail">; week: WeeklyHours | null; locale: Locale }) {
  const lines = hoursLines(week, locale);
  const guide = view.builder ? builderGuideFor(view.builder.id, "website.info_consistency", null) : null;
  const where = view.builder?.name ?? t(locale, K("site.yourWebsite"));
  const steps = guide ? guide.steps[locale] : [t(locale, K("site.step1")), t(locale, K("site.step2")), t(locale, K("site.step3"))];
  const mail = view.managedEmail
    ? `mailto:${view.managedEmail}?subject=${encodeURIComponent(t(locale, K("site.askSubject")))}&body=${encodeURIComponent(`${t(locale, K("site.askBody"))}\n\n${lines.join("\n")}${view.siteUrl ? `\n\n${view.siteUrl}` : ""}`)}`
    : null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="fix-website">
      <b className="text-[13px]">{t(locale, K("site.title"), { where })}</b>
      <ol className="list-decimal space-y-0.5 pl-5 text-[12.5px]">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
        <li>{t(locale, K("site.paste"))}</li>
      </ol>
      <HoursList lines={lines} />
      <div className="flex flex-wrap items-center gap-2">
        <CopyHours lines={lines} />
        {guide && (
          <a href={guide.url} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-semibold text-ink underline underline-offset-2">
            {t(locale, K("site.help"), { where })}
          </a>
        )}
        {mail && (
          <a href={mail} className="text-[12.5px] font-semibold text-ink underline underline-offset-2" data-testid="ask-sam">
            {t(locale, K("site.askSam"))}
          </a>
        )}
      </div>
    </div>
  );
}

/** c: the owner's own hours, one range per day, starting from Google's. */
function OwnHours({ value, onChange }: { value: WeeklyHours; onChange: (w: WeeklyHours) => void }) {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-1" data-testid="own-hours">
      {WEEK_ORDER.map((day) => {
        const d = value[day];
        const r = d.mode === "open" ? d.ranges[0] : null;
        const set = (next: WeeklyHours[number]) => onChange(value.map((x, i) => (i === day ? next : x)));
        return (
          <div key={day} className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="w-24 capitalize">{dayName(day, locale)}</span>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={d.mode === "closed"} onChange={(e) => set(e.target.checked ? { mode: "closed" } : { mode: "open", ranges: [{ open: 9 * 60, close: 17 * 60 }] })} />
              {t(locale, K("own.closed"))}
            </label>
            {r && (
              <>
                <input type="time" value={timeInput(r.open)} aria-label={t(locale, K("own.opens"))} onChange={(e) => set({ mode: "open", ranges: [{ open: parseTimeInput(e.target.value) ?? r.open, close: r.close }] })} className="rounded border border-paper-line px-1.5 py-0.5" />
                <input type="time" value={timeInput(r.close)} aria-label={t(locale, K("own.closes"))} onChange={(e) => set({ mode: "open", ranges: [{ open: r.open, close: parseTimeInput(e.target.value) ?? r.close }] })} className="rounded border border-paper-line px-1.5 py-0.5" />
              </>
            )}
            {d.mode === "open24" && <span className="text-ink-mute">{t(locale, K("own.open24"))}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function HoursComparePanel({ businessId, onTab = false, initialView = null }: { businessId: string; onTab?: boolean; initialView?: OpenHoursCompareResult | null }) {
  const locale = useLocale();
  const [view, setView] = useState<OpenHoursCompareResult | null>(initialView);
  const [failed, setFailed] = useState(false);
  const [stored, setStored] = useState<StoredChoice | null>(null);
  const [own, setOwn] = useState<WeeklyHours | null>(null);
  const [ownDone, setOwnDone] = useState(false);
  useEffect(() => {
    setStored(readChoice(businessId));
    if (initialView) return;
    openHoursCompare(businessId).then(setView, () => setFailed(true));
  }, [businessId, initialView]);
  if (failed) return <p className="text-[13px] text-red">{t(locale, K("loadFailed"))}</p>;
  if (!view) return <p className="text-[13px] text-ink-soft">{t(locale, K("loading"))}</p>;
  if (view.status !== "ok") return <p className="text-[13px] text-red">{t(locale, K("loadFailed"))}</p>;
  const choice = stored?.choice ?? null;
  const pick = (c: HoursChoice) => {
    const at = new Date().toISOString();
    setStored({ choice: c, at });
    saveChoice(businessId, c, at);
    if (c === "own") {
      setOwn(view.google ?? view.site ?? closedWeek());
      setOwnDone(false);
    }
  };
  const clear = () => {
    setStored(null);
    forgetChoice(businessId);
  };
  const fixes = fixesFor(choice === "own" && !ownDone ? null : choice);
  const googleTarget = choice === "own" ? own : view.site;
  const websiteTarget = choice === "own" ? own : view.google;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-paper-deep bg-paper/40 p-3.5" data-testid="hours-compare">
      <CompareVersions
        testId="hours-versions"
        question={t(locale, K("question"))}
        versions={versionsOfHours(view.google, view.site, locale, view.googleLines)}
        mineLabel={t(locale, "dashboard.compareVersions.website")}
        mineIcon="globe"
        googleButton={{ label: t(locale, K("keepGoogle")), note: t(locale, K("keepGoogleNote")), onClick: () => pick("google"), testId: "choice-google" }}
        mineButton={{ label: t(locale, "dashboard.compareVersions.keepWebsite"), note: t(locale, K(view.canEdit ? "keepWebsiteNoteWrite" : "keepWebsiteNoteGuide")), onClick: () => pick("website"), testId: "choice-website", primary: true }}
        extra={
          <button type="button" onClick={() => pick("own")} className="w-fit text-[12.5px] font-semibold text-ink underline underline-offset-2" data-testid="choice-own">
            {t(locale, K("neither"))}
          </button>
        }
        chosen={stored ? { text: t(locale, K(`chosen.${stored.choice}`)), at: stored.at, onChange: clear } : null}
      >
        {choice === "own" && own && !ownDone && (
          <div className="flex flex-col gap-2">
            <OwnHours value={own} onChange={setOwn} />
            <button type="button" onClick={() => setOwnDone(true)} className={cn(BTN, "border-ink bg-ink text-paper")} data-testid="own-continue">
              {t(locale, K("own.continue"))}
            </button>
          </div>
        )}
        {fixes.website && <FixWebsite view={view} week={websiteTarget ?? null} locale={locale} />}
        {fixes.google && <FixGoogle businessId={businessId} view={view} week={googleTarget ?? null} own={choice === "own"} onTab={onTab} />}
      </CompareVersions>
      <p className="text-[11.5px] text-ink-mute">{t(locale, K(view.live ? "sourceLive" : "sourceScan"))}</p>
    </div>
  );
}

/** The button + panel, for the recommendation cards and the Hours row. */
export function HoursMismatchChooser({ businessId, mismatch = true, onTab = false }: { businessId: string; mismatch?: boolean; onTab?: boolean }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"done" | "chosen" | "none">("none");
  useEffect(() => {
    const s = choiceState(readChoice(businessId), mismatch);
    setState(s);
    // The scan shows they match now: Done ✓ once, then forget the choice.
    if (s === "done") forgetChoice(businessId);
  }, [businessId, mismatch]);
  if (state === "done")
    return (
      <p className="text-[12.5px] font-semibold text-green" data-testid="hours-match-done">
        {t(locale, K("done"))}
      </p>
    );
  if (!mismatch) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="hours-chooser">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={cn(BTN, "border-ink bg-ink text-paper")} data-testid="compare-hours">
        {t(locale, K(open ? "hide" : "compare"))}
      </button>
      {open && <HoursComparePanel businessId={businessId} onTab={onTab} />}
    </div>
  );
}
