// Preview: the same real-deltas sample as RealDeltas.tsx, rendered with
// locale 'es' — only the "Month Year" heading changes for now (see
// MonthlyReportEmail.tsx's locale prop); every other fragment is still
// hardcoded English, not yet translated.
// Run `npm run email:dev` and open this file's tab to view it.
import { MonthlyReportEmail } from "../MonthlyReportEmail";
import { SAMPLE_REAL_DELTAS } from "../sampleMonthlyReportContent";

export default function Preview() {
  return <MonthlyReportEmail {...SAMPLE_REAL_DELTAS} locale="es" />;
}
