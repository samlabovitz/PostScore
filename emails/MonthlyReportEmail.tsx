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
import type { MetricResult, MonthlyReportContent } from "@/lib/monthlyReport";

export interface MonthlyReportEmailProps {
  businessName: string;
  /** ISO date this report represents — used only to format the visible
   * "Month Year" heading and subject line. Never read from the system
   * clock inside this file; the caller supplies the real send date. */
  reportDate: string;
  content: MonthlyReportContent;
  /** A real per-recipient unsubscribe URL once the preferences/cron piece
   * exists. A placeholder is fine for now (see emails/sampleMonthlyReportContent.ts)
   * but this prop is never optional — every report visibly offers a way
   * to turn these emails off. */
  unsubscribeUrl: string;
}

function formatMonthLabel(iso: string): string {
  // timeZone: "UTC" is load-bearing, not decoration — reportDate is a
  // UTC-midnight ISO date, and formatting it in whatever timezone the
  // server process happens to run in can silently roll it back to the
  // previous day (e.g. "2026-09-01T00:00:00.000Z" reads as August 31st
  // anywhere west of UTC), mislabeling every report's month.
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The exact subject line every report uses — exported so the real send
 * path builds its email subject from this same function, never a
 * separately hand-written string that could drift from what the body
 * actually says. */
export function monthlyReportSubject(businessName: string, reportDate: string): string {
  return `${businessName} — your ${formatMonthLabel(reportDate)} PostScore report`;
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

function ScoreSection({ score }: { score: MonthlyReportContent["score"] }) {
  const headline = `${score.current.total} (${score.current.grade})`;
  let detail: string | null = null;
  if (score.previous && score.scoreDelta !== null) {
    detail =
      score.scoreDelta === 0
        ? "Unchanged since your last report."
        : `${score.scoreDelta > 0 ? "+" : ""}${score.scoreDelta} points vs. last report (was ${score.previous.total}, ${score.previous.grade}).`;
  }
  return (
    <Section>
      <Text style={labelStyle}>PostScore</Text>
      <Text style={{ ...valueStyle, fontSize: "22px", fontWeight: 700 }}>{headline}</Text>
      {detail && <Text style={{ ...valueStyle, fontSize: "13px", marginTop: "-10px" }}>{detail}</Text>}
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

export function MonthlyReportEmail({ businessName, reportDate, content, unsubscribeUrl }: MonthlyReportEmailProps) {
  const monthLabel = formatMonthLabel(reportDate);

  return (
    <Html>
      <Head />
      {/* The inbox preview snippet is the same real summary sentence
          shown in the body — never separately written, so it can't say
          something different from the report itself. */}
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

          <Text style={{ color: "#14243f", fontSize: "16px", lineHeight: "1.5", margin: "0 0 22px" }}>
            {content.summary}
          </Text>

          <Hr style={{ borderColor: "#e5e1d8", margin: "0 0 20px" }} />

          <ScoreSection score={content.score} />
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
