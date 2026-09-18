// Preview: the same real-deltas sample as RealDeltas.tsx, rendered with
// locale 'es' — every section now has real, reviewed Spanish copy (see
// lib/i18n/messages.ts's es dictionary): month heading, headline, score
// visual, rating/review-count metric lines, competitor standing, listing
// changes, and the focus section's own label. This sample is deliberately
// the "everything real and active" one (no unavailable/unmeasured
// branches) so a translation reviewer sees the fullest possible set of
// real Spanish sentences in one render. Only the focus section's actual
// pointer text (lib/monthlyReport.ts, lib/scoring.ts, lib/profileChanges.ts)
// and business-derived values (name, listing-change descriptions) stay in
// English — out of scope for this file's dictionary.
// Run `npm run email:dev` and open this file's tab to view it.
import { MonthlyReportEmail } from "../MonthlyReportEmail";
import { SAMPLE_REAL_DELTAS } from "../sampleMonthlyReportContent";

export default function Preview() {
  return <MonthlyReportEmail {...SAMPLE_REAL_DELTAS} locale="es" />;
}
