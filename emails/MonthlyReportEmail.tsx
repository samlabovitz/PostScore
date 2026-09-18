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
import { DEFAULT_LOCALE, formatMonthLabel, type Locale } from "@/lib/i18n";

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
   * normalizeLocale() by the caller) — only ever affects the "Month Year"
   * label for now. Every other string in this template is still
   * hardcoded English; see lib/i18n's message dictionary for the plan to
   * translate the rest. Defaults to DEFAULT_LOCALE so every existing
   * caller/sample that doesn't pass this keeps rendering exactly as
   * before. */
  locale?: Locale;
}

/** The exact subject line every report uses — exported so the real send
 * path builds its email subject from this same function, never a
 * separately hand-written string that could drift from what the body
 * actually says. */
export function monthlyReportSubject(businessName: string, reportDate: string, locale: Locale = DEFAULT_LOCALE): string {
  return `${businessName} — your ${formatMonthLabel(reportDate, locale)} PostScore report`;
}

function capitalizeFirst(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

// Each fragment names exactly one real, checked movement — the same
// fields lib/monthlyReport.ts's isSteady computation checks, in the same
// order. A fragment is only ever produced from a real, non-null,
// non-zero delta; nothing here estimates or infers movement.
function scoreFragment(score: ScoreMovement): string | null {
  if (score.scoreDelta !== null && score.scoreDelta !== 0) {
    const abs = Math.abs(score.scoreDelta);
    return `your score ${score.scoreDelta > 0 ? "rose" : "dropped"} ${abs} point${abs === 1 ? "" : "s"}`;
  }
  if (score.gradeChanged) return `your grade changed to ${score.current.grade}`;
  return null;
}

function reviewFragment(reviewCount: MetricResult): string | null {
  if (!reviewCount.available || reviewCount.delta === null || reviewCount.delta === 0) return null;
  const abs = Math.abs(reviewCount.delta);
  return reviewCount.delta > 0
    ? `you gained ${abs} review${abs === 1 ? "" : "s"}`
    : `you lost ${abs} review${abs === 1 ? "" : "s"}`;
}

function ratingFragment(rating: MetricResult): string | null {
  if (!rating.available || rating.delta === null || rating.delta === 0) return null;
  return `your rating ${rating.delta > 0 ? "rose" : "dropped"} to ${rating.current.toFixed(1)}★`;
}

function competitorFragment(competitor: CompetitorMovement): string | null {
  if (!competitor.available || competitor.rankDelta === 0) return null;
  return `you moved ${competitor.rankDelta > 0 ? "up" : "down"} to #${competitor.current.rank} of ${competitor.current.totalCompetitors}`;
}

function listingFragment(listingChanges: ListingChangesResult): string | null {
  if (!listingChanges.available || listingChanges.changes.length === 0) return null;
  const n = listingChanges.changes.length;
  return `there ${n === 1 ? "was" : "were"} ${n} listing change${n === 1 ? "" : "s"}`;
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
function earnedTonePhrase(scoreDelta: number | null): string | null {
  if (scoreDelta === null || scoreDelta === 0) return null;
  return scoreDelta > 0
    ? "Great progress this month."
    : "It happens — here's what to focus on to turn it around.";
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
export function buildHeadline(content: MonthlyReportContent): string {
  if (content.kind === "baseline") {
    return "Your baseline is set — welcome to PostScore. Here's where you stand today.";
  }
  if (content.isSteady) {
    return "A steady month — your presence held its ground.";
  }

  const fragments = [
    scoreFragment(content.score),
    reviewFragment(content.reviewCount),
    ratingFragment(content.rating),
    competitorFragment(content.competitor),
    listingFragment(content.listingChanges),
  ].filter((f): f is string => f !== null);

  const base = `${capitalizeFirst(fragments.slice(0, 2).join(" and "))}.`;
  const tone = earnedTonePhrase(content.score.scoreDelta);
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
}: {
  label: string;
  metric: MetricResult;
  format: (n: number) => string;
  unmeasuredNote: string;
}) {
  if (!metric.available) {
    return (
      <Section>
        <Text style={labelStyle}>{label}</Text>
        <Text style={mutedStyle}>Not measured this period — {unmeasuredNote}</Text>
      </Section>
    );
  }

  let detail: string;
  if (metric.delta === null) {
    detail = `${format(metric.current)} (no prior report to compare against)`;
  } else if (metric.delta === 0) {
    detail = `${format(metric.current)} — unchanged`;
  } else {
    const sign = metric.delta > 0 ? "+" : "";
    detail = `${format(metric.current)} (${sign}${format(metric.delta)} vs. last report)`;
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
function ScoreVisual({ score }: { score: MonthlyReportContent["score"] }) {
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
                {`${score.current.total}/100 · ${score.current.grade}`}
              </Text>
            </td>
            {showDelta && (
              <td align="right">
                <Text style={{ color: "#6b7890", fontSize: "12.5px", margin: 0 }}>
                  {`${score.scoreDelta! > 0 ? "+" : ""}${score.scoreDelta} since last report`}
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
function FocusSection({ content }: { content: MonthlyReportContent }) {
  return (
    <Section>
      <Text style={labelStyle}>This month & what to focus on</Text>
      <Text style={{ ...valueStyle, margin: "0 0 10px" }}>{buildHeadline(content)}</Text>
      {content.focus.nothingNotable ? (
        <Text style={mutedStyle}>
          Nothing notable to flag this month — your listing and site are in strong shape across the board.
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

function CompetitorSection({ competitor }: { competitor: MonthlyReportContent["competitor"] }) {
  if (!competitor.available) {
    return (
      <Section>
        <Text style={labelStyle}>Competitor standing</Text>
        <Text style={mutedStyle}>Not tracked this period — no competitor scan is available to compare.</Text>
      </Section>
    );
  }
  const rankLine = `#${competitor.current.rank} of ${competitor.current.totalCompetitors} nearby`;
  const deltaLine =
    competitor.rankDelta === 0
      ? "Same as your last report."
      : `${competitor.rankDelta > 0 ? "Moved up" : "Moved down"} from #${competitor.previous.rank} last report.`;
  return (
    <Section>
      <Text style={labelStyle}>Competitor standing</Text>
      <Text style={valueStyle}>{rankLine}</Text>
      <Text style={{ ...valueStyle, fontSize: "13px", marginTop: "-10px" }}>{deltaLine}</Text>
    </Section>
  );
}

function ListingChangesSection({ listingChanges }: { listingChanges: MonthlyReportContent["listingChanges"] }) {
  if (!listingChanges.available) {
    return (
      <Section>
        <Text style={labelStyle}>Listing changes</Text>
        <Text style={mutedStyle}>
          Not available for this comparison — one of the two scans predates listing-change tracking, or this is
          your first report.
        </Text>
      </Section>
    );
  }
  if (listingChanges.changes.length === 0) {
    return (
      <Section>
        <Text style={labelStyle}>Listing changes</Text>
        <Text style={valueStyle}>No other listing changes detected this month.</Text>
      </Section>
    );
  }
  return (
    <Section>
      <Text style={labelStyle}>Listing changes</Text>
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
            {monthLabel} report
          </Text>
          <Heading style={{ color: "#14243f", fontSize: "22px", margin: "0 0 18px" }}>{businessName}</Heading>

          <Text style={{ color: "#14243f", fontSize: "17px", fontWeight: 600, lineHeight: "1.5", margin: "0 0 20px" }}>
            {buildHeadline(content)}
          </Text>

          <Hr style={{ borderColor: "#e5e1d8", margin: "0 0 20px" }} />

          <ScoreVisual score={content.score} />
          <MetricLine
            label="Rating"
            metric={content.rating}
            format={(n) => `${n.toFixed(1)}★`}
            unmeasuredNote="this scan didn't include a real rating value."
          />
          <MetricLine
            label="Review count"
            metric={content.reviewCount}
            format={(n) => `${n}`}
            unmeasuredNote="this scan didn't include a real review count."
          />
          <CompetitorSection competitor={content.competitor} />
          <ListingChangesSection listingChanges={content.listingChanges} />

          <Hr style={{ borderColor: "#e5e1d8", margin: "4px 0 20px" }} />

          {content.kind === "baseline" && (
            <Text style={{ color: "#6b7890", fontSize: "12.5px", lineHeight: "1.5", margin: "0 0 20px" }}>
              This is your first PostScore report — a real baseline, not a trend. Next month&apos;s report will
              show real month-over-month change.
            </Text>
          )}

          <FocusSection content={content} />

          <Hr style={{ borderColor: "#e5e1d8", margin: "4px 0 20px" }} />

          <Text style={{ color: "#9aa3b2", fontSize: "11.5px", lineHeight: "1.5", margin: 0 }}>
            You&apos;re receiving this because monthly email reports are on for {businessName}.{" "}
            <Link href={unsubscribeUrl} style={{ color: "#9aa3b2", textDecoration: "underline" }}>
              Unsubscribe from these reports
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default MonthlyReportEmail;
