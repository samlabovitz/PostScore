"use client";

// Day 23B (docs/plans/business-details-flow.md): the owner's confirmed
// details differ from Google or the website → one task per field, fixed at
// the source. Premium + connected (Google writes allowed): "PostScore can do
// this for you" (the Google Profile tab's editor, the owner's details filled
// in). Otherwise: the steps on Google + "Open on Google ↗" (Premium not
// connected: "Connect Google so PostScore can do this for you"). Only the
// website differs: the Website page's fix steps. Never points.

import { googleListingHref } from "@/lib/routes";
import Link from "next/link";
import { IconWand } from "@tabler/icons-react";
import { FixButton, FIX_BUTTON_CLASS, useFixContext } from "@/components/scoring/FixButton";
import { canDoForYou, fixDestination, hasGoogleTab, type FixItem } from "@/lib/fixDestination";
import { PremiumOneClickLine } from "@/components/scoring/PremiumOneClickLine";
import { DETAILS_EDITOR_HASH, mergedKind, type DetailsMismatch } from "@/lib/detailsMismatch";
import { GOOGLE_BUSINESS_URL } from "@/lib/googleProfileTab";
import { ownHoursKey } from "@/lib/hoursChooser";
import { ownerHoursSummary, type OwnerDetails } from "@/lib/ownerDetails";
import { t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";

const K = (key: string) => `dashboard.detailsMismatch.${key}` as MessageKey;
const LINK = "font-semibold text-ink underline decoration-brass underline-offset-2";

function Task({ businessId, m, owner }: { businessId: string; m: DetailsMismatch; owner: OwnerDetails | null }) {
  const locale = useLocale();
  const ctx = useFixContext(businessId);
  const field = t(locale, K(`field.${m.field}`));
  const editor = DETAILS_EDITOR_HASH[m.field];
  const doIt = m.google && editor !== null && canDoForYou(ctx);
  return (
    <li data-testid={`details-mismatch-${m.field}`} data-google={m.google ? "1" : "0"} data-website={m.website ? "1" : "0"} className="flex flex-col gap-1.5 py-3 first:pt-1 last:pb-1">
      <b className="text-[13.5px] text-ink">{t(locale, K(m.google ? (m.website ? "title.both" : "title.google") : "title.website"), { field })}</b>
      <p className="text-[12.5px] leading-snug text-ink-soft">{t(locale, K("why"))}</p>
      {doIt ? (
        <Link
          href={googleListingHref(businessId, { hash: editor })}
          data-testid="fix-button"
          data-kind="do_it"
          onClick={() => {
            // The hours editor starts on the owner's own week (lib/hoursChooser.ts).
            if (m.field === "hours" && owner?.hours.kind === "regular") {
              try {
                window.sessionStorage.setItem(ownHoursKey(businessId), JSON.stringify(owner.hours.week));
              } catch {
                // the editor starts on Google's hours instead
              }
            }
          }}
          className={FIX_BUTTON_CLASS}
        >
          <IconWand size={14} aria-hidden />
          {t(locale, "dashboard.breakdown.action.doItForYou")} →
        </Link>
      ) : m.google ? (
        <>
          <p className="text-[12.5px] text-ink-soft">{t(locale, K(`steps.${m.field}`))}</p>
          <a href={GOOGLE_BUSINESS_URL} target="_blank" rel="noopener noreferrer" data-testid="fix-button" data-kind="steps" className={FIX_BUTTON_CLASS}>
            {t(locale, "dashboard.fix.openOnGoogle")} ↗
          </a>
          {editor !== null && <PremiumOneClickLine businessId={businessId} item={{ checkId: m.field === "hours" ? "completeness.hours" : "completeness.phone" }} />}
          {ctx.premium && !hasGoogleTab(ctx) && editor !== null && (
            <Link href={`/business/${businessId}/connect-gbp`} data-testid="details-mismatch-connect" className={`text-[12.5px] ${LINK}`}>
              {t(locale, K("connect"))}
            </Link>
          )}
        </>
      ) : (
        <Link href={`/business/${businessId}/website#check-info_consistency`} data-testid="fix-button" data-kind="steps" className={FIX_BUTTON_CLASS}>
          {t(locale, "dashboard.breakdown.action.fixWebsite")} →
        </Link>
      )}
      <Link href={`/business/${businessId}/settings#details`} data-testid="details-mismatch-keep" className={`w-fit text-[12px] ${LINK}`}>
        {t(locale, K(m.google ? "keepGoogle" : "keepWebsite"))}
      </Link>
    </li>
  );
}

export function DetailsMismatchTasks({ businessId, mismatches, owner, className }: { businessId: string; mismatches: DetailsMismatch[]; owner: OwnerDetails | null; className?: string }) {
  const locale = useLocale();
  if (mismatches.length === 0) return null;
  return (
    <section data-testid="details-mismatch" className={className ?? "rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5"}>
      <h3 className="text-[14px] font-semibold text-ink">{t(locale, K("heading"))}</h3>
      <ul className="mt-1 flex flex-col divide-y divide-paper-line">
        {mismatches.map((m) => (
          <Task key={m.field} businessId={businessId} m={m} owner={owner} />
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Day 23B: merged into the scored "Matches your Google listing" task — ONE
// task per field with every version side by side (Top recommendations, the
// Growth recap). The +points stay the scored check's; the score never reads
// the confirmed details.
// ---------------------------------------------------------------------------

function versionText(v: NonNullable<DetailsMismatch["versions"]>["owner"] | null, locale: Locale): string | null {
  if (!v) return null;
  return "text" in v ? v.text : ownerHoursSummary(v.hours, locale);
}

/** "Your hours don't match everywhere" (two fields: "Your hours and phone number …"). */
export function mergedTitle(mismatches: DetailsMismatch[], locale: Locale): string {
  // Google and the website agree: only the confirmed details are off.
  if (mismatches.length === 1 && mergedKind(mismatches) === "owner_only") return t(locale, K(`merged.ownerOnly.${mismatches[0].field}`));
  const names = mismatches.map((m) => t(locale, K(`field.${m.field}`)));
  const field = names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} ${t(locale, "dashboard.breakdown.and")} ${names[names.length - 1]}`;
  return mismatches.length > 1 ? t(locale, K("merged.titleMany"), { field }) : t(locale, K(`merged.title.${mismatches[0]?.field ?? "hours"}`));
}

/** "You confirmed … · Google … · Website …", one line per side. */
export function DetailsVersions({ mismatches }: { mismatches: DetailsMismatch[] }) {
  const locale = useLocale();
  return (
    <div data-testid="details-versions" className="flex flex-col gap-1.5 rounded-lg bg-paper px-3 py-2 text-[12.5px]">
      {mismatches.map((m) => (
        <dl key={m.field} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5">
          {mismatches.length > 1 && <dt className="col-span-2 font-semibold text-ink">{t(locale, K(`fieldTitle.${m.field}`))}</dt>}
          {(["owner", "google", "website"] as const).map((side) => {
            const text = versionText(m.versions?.[side] ?? null, locale);
            if (side === "website" && !text) return null;
            return (
              <div key={side} className="contents" data-testid={`version-${m.field}-${side}`}>
                <dt className="text-ink-mute">{t(locale, K(`versions.${side}`))}</dt>
                <dd className="min-w-0 break-words text-ink">{text ?? t(locale, K("versions.none"))}</dd>
              </div>
            );
          })}
        </dl>
      ))}
    </div>
  );
}

/** The merged task's one button: hours → the Hours compare panel (Premium +
 * connected) or the Website page's steps; phone → its Google editor or the
 * steps; address → the Website page's steps (no PostScore address editor). */
/** The one-click fix Premium has for a merged task (the hours compare, the phone editor), or null. */
export function mergedOneClickItem(mismatches: DetailsMismatch[]): FixItem | null {
  const fields = mismatches.map((m) => m.field);
  if (fields.includes("hours")) return { checkId: "website.info_consistency", hoursMismatch: true };
  if (fields.includes("phone")) return { checkId: "completeness.phone" };
  return null;
}

export function MergedFixButton({ businessId, mismatches, fromScore = false, premiumLine = true }: { businessId: string; mismatches: DetailsMismatch[]; fromScore?: boolean; premiumLine?: boolean }) {
  const ctx = useFixContext(businessId);
  const locale = useLocale();
  const fields = mismatches.map((m) => m.field);
  const oneClick = mergedOneClickItem(mismatches);
  if (fields.includes("hours")) return <FixButton businessId={businessId} fromScore={fromScore} premiumLine={premiumLine} item={{ checkId: "website.info_consistency", hoursMismatch: true }} />;
  if (fields.includes("phone") && canDoForYou(ctx)) {
    return (
      <Link href={googleListingHref(businessId, { hash: "edit-phone" })} data-testid="fix-button" data-kind="do_it" className={FIX_BUTTON_CLASS}>
        <IconWand size={14} aria-hidden />
        {t(locale, "dashboard.breakdown.action.doItForYou")} →
      </Link>
    );
  }
  return (
    <>
      <FixButton businessId={businessId} fromScore={fromScore} premiumLine={false} item={{ checkId: "website.info_consistency" }} />
      {premiumLine && oneClick && <PremiumOneClickLine businessId={businessId} item={oneClick} className="w-full" />}
    </>
  );
}

/**
 * The merged task's actions. Google and the website agree (only the
 * confirmed details differ): "Update your confirmed hours" → Settings, the
 * card filled in with Google's version, plus "Or change them on Google and
 * your website". Otherwise: fix Google / the website (MergedFixButton) and
 * "Is Google's version right?".
 */
export function MergedActions({ businessId, mismatches, fromScore = false, only, premiumLine = true }: { businessId: string; mismatches: DetailsMismatch[]; fromScore?: boolean; only?: "button" | "link"; premiumLine?: boolean }) {
  const locale = useLocale();
  const ctx = useFixContext(businessId);
  if (mergedKind(mismatches) !== "owner_only") {
    return (
      <>
        {only !== "link" && <MergedFixButton businessId={businessId} mismatches={mismatches} fromScore={fromScore} premiumLine={premiumLine} />}
        {only !== "button" && <KeepGoogleLink businessId={businessId} />}
      </>
    );
  }
  const field = mismatches[0].field;
  const other =
    field === "hours"
      ? fixDestination({ checkId: "website.info_consistency", hoursMismatch: true }, ctx).href
      : field === "phone" && hasGoogleTab(ctx)
        ? googleListingHref(businessId, { hash: "edit-phone" })
        : `/business/${businessId}/website#check-info_consistency`;
  return (
    <>
      {only !== "link" && (
        <Link href={`/business/${businessId}/settings?use=google&field=${field}#details`} data-testid="fix-button" data-kind="update-details" className={FIX_BUTTON_CLASS}>
          {t(locale, K(`merged.update.${field}`))} →
        </Link>
      )}
      {only !== "button" && (
        <Link href={other} data-testid="details-change-everywhere" className={`w-fit text-[12px] ${LINK}`}>
          {t(locale, K(field === "hours" ? "merged.orChangeThem" : "merged.orChangeIt"))}
        </Link>
      )}
    </>
  );
}

export function KeepGoogleLink({ businessId }: { businessId: string }) {
  const locale = useLocale();
  return (
    <Link href={`/business/${businessId}/settings#details`} data-testid="details-mismatch-keep" className={`w-fit text-[12px] ${LINK}`}>
      {t(locale, K("keepGoogle"))}
    </Link>
  );
}
