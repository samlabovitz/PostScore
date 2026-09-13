// Preview: a genuinely good month — real improvement across every metric.
// Run `npm run email:dev` and open this file's tab to view it.
import { MonthlyReportEmail } from "../MonthlyReportEmail";
import { SAMPLE_REAL_DELTAS } from "../sampleMonthlyReportContent";

export default function Preview() {
  return <MonthlyReportEmail {...SAMPLE_REAL_DELTAS} />;
}
