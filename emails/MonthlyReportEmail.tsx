// The monthly "here's what happened" report email. This component's
// ONLY job is to render a real MonthlyReportContent (lib/monthlyReport.ts)
// faithfully — it makes no scoring decisions, computes no deltas, and
// adds no optimism the content didn't already earn. Every honest state
// the pure builder can produce (a real delta, a confirmed "unchanged," or
// an honestly unavailable metric) gets its own distinct, calm rendering
// below — never collapsed into a fabricated zero or a dash that implies
// a real value.
//
// Plain and trustworthy over flashy on purpose: no logos, no charts, no
// decorative images — this is a small business owner's real monthly
// standing, in plain text.
//
// Every English sentence below is sourced from lib/i18n's message
// dictionary via t()/tPlural(), keyed under "report.*" — this file itself
// holds no hardcoded UI copy anymore. Only two kinds of literal text
// remain hardcoded here on purpose: "PostScore" (the product's own brand
// name, never translated — see lib/i18n's proper-noun rule) and passed-in
// values like businessName (also never translated). No Spanish values
// exist in the dictionary yet, so every t()/tPlural() call currently
// renders the exact same English text this file used to hardcode.
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type {
  CompetitorMovement,
  ListingChangesResult,
  MetricResult,
  MonthlyReportContent,
  ScoreMovement,
} from "@/lib/monthlyReport";
import { DEFAULT_LOCALE, formatMonthLabel, t, tPlural, type Locale } from "@/lib/i18n";

export interface MonthlyReportEmailProps {
  businessName: string;
  /** ISO date this report represents — used only to format the visible
   * "Month Year" heading and subject line. Never read from the system
   * clock inside this file; the caller supplies the real send date. */
  reportDate: string;
  content: MonthlyReportContent;
  /** A real, working per-business unsubscribe URL — the real cron route
   * (app/api/cron/monthly-reports) builds this from the business's own
   * real unsubscribe_token (supabase/schema.sql) and app/unsubscribe/page.tsx
   * validates it and turns monthly_report_enabled off, no login required.
   * Sample/preview fixtures (emails/sampleMonthlyReportContent.ts) use a
   * clearly-fake placeholder instead, since they aren't real businesses.
   * Never optional — every report visibly offers a way to turn these
   * emails off. */
  unsubscribeUrl: string;
  /** The business's own chosen language (businesses.language, run through
   * normalizeLocale() by the caller). Defaults to DEFAULT_LOCALE so every
   * existing caller/sample that doesn't pass this keeps rendering exactly
   * as before. */
  locale?: Locale;
}

/** The exact subject line every report uses — exported so the real send
 * path builds its email subject from this same function, never a
 * separately hand-written string that could drift from what the body
 * actually says. */
export function monthlyReportSubject(businessName: string, reportDate: string, locale: Locale = DEFAULT_LOCALE): string {
  return t(locale, "report.subject", { businessName, month: formatMonthLabel(reportDate, locale) });
}

function capitalizeFirst(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

// Each fragment names exactly one real, checked movement — the same
// fields lib/monthlyReport.ts's isSteady computation checks, in the same
// order. A fragment is only ever produced from a real, non-null,
// non-zero delta; nothing here estimates or infers movement.
function scoreFragment(score: ScoreMovement, locale: Locale): string | null {
  if (score.scoreDelta !== null && score.scoreDelta !== 0) {
    const abs = Math.abs(score.scoreDelta);
    return tPlural(locale, score.scoreDelta > 0 ? "report.fragment.scoreRose" : "report.fragment.scoreDropped", abs);
  }
  if (score.gradeChanged) return t(locale, "report.fragment.gradeChanged", { grade: score.current.grade });
  return null;
}

function reviewFragment(reviewCount: MetricResult, locale: Locale): string | null {
  if (!reviewCount.available || reviewCount.delta === null || reviewCount.delta === 0) return null;
  const abs = Math.abs(reviewCount.delta);
  return tPlural(locale, reviewCount.delta > 0 ? "report.fragment.reviewsGained" : "report.fragment.reviewsLost", abs);
}

function ratingFragment(rating: MetricResult, locale: Locale): string | null {
  if (!rating.available || rating.delta === null || rating.delta === 0) return null;
  return t(locale, rating.delta > 0 ? "report.fragment.ratingRose" : "report.fragment.ratingDropped", {
    value: rating.current.toFixed(1),
  });
}

function competitorFragment(competitor: CompetitorMovement, locale: Locale): string | null {
  if (!competitor.available || competitor.rankDelta === 0) return null;
  return t(locale, competitor.rankDelta > 0 ? "report.fragment.competitorUp" : "report.fragment.competitorDown", {
    rank: competitor.current.rank,
    total: competitor.current.totalCompetitors,
  });
}

function listingFragment(listingChanges: ListingChangesResult, locale: Locale): string | null {
  if (!listingChanges.available || listingChanges.changes.length === 0) return null;
  return tPlural(locale, "report.fragment.listingChanges", listingChanges.changes.length);
}

/**
 * A short tone note earned strictly by the real score movement — never
 * an unconditional "way to go" that could fire on a flat or declining
 * month. Gated purely on the sign of the same real scoreDelta already
 * shown in the score bar, so this can never appear without a real
 * number behind it:
 *   - a real, positive scoreDelta earns a warm (not over-the-top) note —
 *     this is the ONLY branch of this entire template allowed to sound
 *     pleased, and only because the business actually earned it.
 *   - a real, negative scoreDelta gets something supportive, never
 *     congratulatory — acknowledging the month without softening what
 *     actually happened (that's still stated plainly, just above this).
 *   - no real delta (null, or exactly 0 — the isSteady case is already
 *     handled before this is ever called) gets no added tone at all.
 */
function earnedTonePhrase(scoreDelta: number | null, locale: Locale): string | null {
  if (scoreDelta === null || scoreDelta === 0) return null;
  return scoreDelta > 0 ? t(locale, "report.tone.positive") : t(locale, "report.tone.negative");
}

/**
 * The one- or two-sentence "at a glance" headline shown at the top of
 * the email, above the detailed numbers. Distinct from content.summary
 * (still used as the inbox preview snippet) — this is deliberately
 * shorter and never repeats a number already spelled out below.
 *
 * Every branch is a direct, honest read of real content, and any warmth
 * is earned and conditional — never unconditional praise or an emoji
 * that would fire the same way regardless of the real month:
 *   - baseline: no comparison is possible, so none is implied — just a
 *     plain, welcoming "here's where you stand."
 *   - isSteady: a real, checked "nothing moved" — warm in tone, but
 *     never false praise for movement that didn't happen.
 *   - otherwise: the top one or two real facts that actually moved,
 *     picked in the same priority order (and from the same fields) as
 *     isSteady itself checks — so a non-steady report can never produce
 *     an empty headline, and a steady one can never sneak in a fact —
 *     plus earnedTonePhrase's real-scoreDelta-gated note: supportive on
 *     a real decline, warmly earned on a real improvement, silent
 *     otherwise.
 */
export function buildHeadline(content: MonthlyReportContent, locale: Locale = DEFAULT_LOCALE): string {
  if (content.kind === "baseline") {
    return t(locale, "report.headline.baseline");
  }
  if (content.isSteady) {
    return t(locale, "report.headline.steady");
  }

  const fragments = [
    scoreFragment(content.score, locale),
    reviewFragment(content.reviewCount, locale),
    ratingFragment(content.rating, locale),
    competitorFragment(content.competitor, locale),
    listingFragment(content.listingChanges, locale),
  ].filter((f): f is string => f !== null);

  const base = `${capitalizeFirst(fragments.slice(0, 2).join(` ${t(locale, "common.and")} `))}.`;
  const tone = earnedTonePhrase(content.score.scoreDelta, locale);
  return tone ? `${base} ${tone}` : base;
}

const labelStyle = { color: "#3a4a66", fontSize: "12.5px", fontWeight: 600, margin: "0 0 3px" };
const valueStyle = { color: "#14243f", fontSize: "15px", lineHeight: "1.4", margin: "0 0 16px" };
const mutedStyle = { color: "#6b7890", fontSize: "13px", lineHeight: "1.4", margin: "0 0 16px", fontStyle: "italic" as const };

/**
 * Renders one numeric metric (rating, review count) in exactly one of
 * four honest states — never a fifth, invented one:
 *   - unavailable: we don't even know the current value.
 *   - available, no prior value: a real current number, no comparison
 *     claim (never presented as "steady" or "0 change").
 *   - available, delta 0: a real, confirmed no-change.
 *   - available, delta non-zero: a real change, plainly stated —
 *     including a decline, in the same plain language as an increase.
 */
function MetricLine({
  label,
  metric,
  format,
  unmeasuredNote,
  locale,
}: {
  label: string;
  metric: MetricResult;
  format: (n: number) => string;
  unmeasuredNote: string;
  locale: Locale;
}) {
  if (!metric.available) {
    return (
      <Section>
        <Text style={labelStyle}>{label}</Text>
        <Text style={mutedStyle}>{t(locale, "report.metric.notMeasuredPrefix")}{unmeasuredNote}</Text>
      </Section>
    );
  }

  let detail: string;
  if (metric.delta === null) {
    detail = t(locale, "report.metric.noPrior", { value: format(metric.current) });
  } else if (metric.delta === 0) {
    detail = t(locale, "report.metric.unchanged", { value: format(metric.current) });
  } else {
    const sign = metric.delta > 0 ? "+" : "";
    detail = t(locale, "report.metric.delta", { value: format(metric.current), delta: `${sign}${format(metric.delta)}` });
  }

  return (
    <Section>
      <Text style={labelStyle}>{label}</Text>
      <Text style={valueStyle}>{detail}</Text>
    </Section>
  );
}

/**
 * The one visual element in this email: the current PostScore as a
 * horizontal bar filled to the real score, with its real letter grade.
 * Built only from content.score.current — a value every report always
 * has for real. The small "+N since last report" label only appears
 * when score.scoreDelta is a real, non-zero number (i.e. a real baseline
 * exists AND something actually moved); on a baseline report
 * (scoreDelta: null) or a steady one (scoreDelta: 0) it's omitted
 * entirely rather than shown as "+0" — this bar never implies
 * month-over-month movement that isn't real.
 */
function ScoreVisual({ score, locale }: { score: MonthlyReportContent["score"]; locale: Locale }) {
  const pct = score.current.total;
  const showDelta = score.scoreDelta !== null && score.scoreDelta !== 0;

  return (
    <Section style={{ margin: "0 0 20px" }}>
      <Text style={labelStyle}>PostScore</Text>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ background: "#eceadf", borderRadius: "7px" }}>
              <table role="presentation" width={`${pct}%`} cellPadding={0} cellSpacing={0} style={{ borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ background: "#14243f", borderRadius: "7px", height: "12px", fontSize: "1px", lineHeight: "12px" }}>
                      &nbsp;
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: "collapse", marginTop: "8px" }}>
        <tbody>
          <tr>
            <td>
              <Text style={{ ...valueStyle, fontSize: "20px", fontWeight: 700, margin: 0 }}>
                {t(locale, "report.score.summary", { total: score.current.total, grade: score.current.grade })}
              </Text>
            </td>
            {showDelta && (
              <td align="right">
                <Text style={{ color: "#6b7890", fontSize: "12.5px", margin: 0 }}>
                  {t(locale, "report.score.sinceLastReport", {
                    delta: `${score.scoreDelta! > 0 ? "+" : ""}${score.scoreDelta}`,
                  })}
                </Text>
              </td>
            )}
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

/**
 * The closing "This month & what to focus on" section. Its ONLY job is
 * to display content.focus exactly as the pure builder assembled it —
 * this component makes no selection or phrasing decisions of its own.
 * The "this month" line reuses buildHeadline(content), the same real,
 * honest recap already shown at the top — never a second, differently-
 * worded summary that could drift from it. Below that, either every
 * real pointer the builder found (each one already traced back to a
 * real check, a real competitor gap, a real detected change, or the
 * one fixed general tip — see lib/monthlyReport.ts's buildFocus), or,
 * when there genuinely was nothing to flag, an honest line saying so —
 * never a fabricated concern to fill the space.
 */
function FocusSection({ content, locale }: { content: MonthlyReportContent; locale: Locale }) {
  return (
    <Section>
      <Text style={labelStyle}>{t(locale, "report.focus.label")}</Text>
      <Text style={{ ...valueStyle, margin: "0 0 10px" }}>{buildHeadline(content, locale)}</Text>
      {content.focus.nothingNotable ? (
        <Text style={mutedStyle}>
          {t(locale, "report.focus.nothingNotable")}
        </Text>
      ) : (
        content.focus.pointers.map((pointer, i) => (
          <Text key={i} style={{ ...valueStyle, margin: "0 0 6px" }}>
            • {pointer.text}
          </Text>
        ))
      )}
    </Section>
  );
}

function CompetitorSection({ competitor, locale }: { competitor: MonthlyReportContent["competitor"]; locale: Locale }) {
  if (!competitor.available) {
    return (
      <Section>
        <Text style={labelStyle}>{t(locale, "report.competitorSection.label")}</Text>
        <Text style={mutedStyle}>{t(locale, "report.competitorSection.unavailable")}</Text>
      </Section>
    );
  }
  const rankLine = t(locale, "report.competitorSection.rank", {
    rank: competitor.current.rank,
    total: competitor.current.totalCompetitors,
  });
  const deltaLine =
    competitor.rankDelta === 0
      ? t(locale, "report.competitorSection.same")
      : t(
          locale,
          competitor.rankDelta > 0 ? "report.competitorSection.movedUp" : "report.competitorSection.movedDown",
          { rank: competitor.previous.rank }
        );
  return (
    <Section>
      <Text style={labelStyle}>{t(locale, "report.competitorSection.label")}</Text>
      <Text style={valueStyle}>{rankLine}</Text>
      <Text style={{ ...valueStyle, fontSize: "13px", marginTop: "-10px" }}>{deltaLine}</Text>
    </Section>
  );
}

function ListingChangesSection({ listingChanges, locale }: { listingChanges: MonthlyReportContent["listingChanges"]; locale: Locale }) {
  if (!listingChanges.available) {
    return (
      <Section>
        <Text style={labelStyle}>{t(locale, "report.listingSection.label")}</Text>
        <Text style={mutedStyle}>
          {t(locale, "report.listingSection.unavailable")}
        </Text>
      </Section>
    );
  }
  if (listingChanges.changes.length === 0) {
    return (
      <Section>
        <Text style={labelStyle}>{t(locale, "report.listingSection.label")}</Text>
        <Text style={valueStyle}>{t(locale, "report.listingSection.none")}</Text>
      </Section>
    );
  }
  return (
    <Section>
      <Text style={labelStyle}>{t(locale, "report.listingSection.label")}</Text>
      {listingChanges.changes.map((change) => (
        <Text key={change.field} style={{ ...valueStyle, margin: "0 0 4px" }}>
          • {change.description}
        </Text>
      ))}
    </Section>
  );
}

export function MonthlyReportEmail({
  businessName,
  reportDate,
  content,
  unsubscribeUrl,
  locale = DEFAULT_LOCALE,
}: MonthlyReportEmailProps) {
  const monthLabel = formatMonthLabel(reportDate, locale);

  return (
    <Html>
      <Head />
      {/* The inbox preview snippet uses the fuller real summary sentence
          content.summary already computes — a separate, more detailed
          line from the short on-page headline below, but never a
          separately hand-written one that could drift from real content. */}
      <Preview>{content.summary}</Preview>
      <Body style={{ backgroundColor: "#f6f5f1", fontFamily: "Georgia, 'Times New Roman', serif", margin: 0, padding: "24px 0" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e5e1d8",
            borderRadius: "12px",
            padding: "32px",
            maxWidth: "560px",
          }}
        >
          <Text style={{ color: "#6b7890", fontSize: "11.5px", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 4px" }}>
            {t(locale, "report.monthHeading", { month: monthLabel })}
          </Text>
          <Heading style={{ color: "#14243f", fontSize: "22px", margin: "0 0 18px" }}>{businessName}</Heading>

          <Text style={{ color: "#14243f", fontSize: "17px", fontWeight: 600, lineHeight: "1.5", margin: "0 0 20px" }}>
            {buildHeadline(content, locale)}
          </Text>

          <Hr style={{ borderColor: "#e5e1d8", margin: "0 0 20px" }} />

          <ScoreVisual score={content.score} locale={locale} />
          <MetricLine
            label={t(locale, "report.label.rating")}
            metric={content.rating}
            format={(n) => `${n.toFixed(1)}★`}
            unmeasuredNote={t(locale, "report.unmeasured.rating")}
            locale={locale}
          />
          <MetricLine
            label={t(locale, "report.label.reviewCount")}
            metric={content.reviewCount}
            format={(n) => `${n}`}
            unmeasuredNote={t(locale, "report.unmeasured.reviewCount")}
            locale={locale}
          />
          <CompetitorSection competitor={content.competitor} locale={locale} />
          <ListingChangesSection listingChanges={content.listingChanges} locale={locale} />

          <Hr style={{ borderColor: "#e5e1d8", margin: "4px 0 20px" }} />

          {content.kind === "baseline" && (
            <Text style={{ color: "#6b7890", fontSize: "12.5px", lineHeight: "1.5", margin: "0 0 20px" }}>
              {t(locale, "report.baselineNote")}
            </Text>
          )}

          <FocusSection content={content} locale={locale} />

          <Hr style={{ borderColor: "#e5e1d8", margin: "4px 0 20px" }} />

          <Text style={{ color: "#9aa3b2", fontSize: "11.5px", lineHeight: "1.5", margin: 0 }}>
            {t(locale, "report.footer.enabledForPrefix")}{businessName}.{" "}
            <Link href={unsubscribeUrl} style={{ color: "#9aa3b2", textDecoration: "underline" }}>
              {t(locale, "report.footer.unsubscribeLinkText")}
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default MonthlyReportEmail;
