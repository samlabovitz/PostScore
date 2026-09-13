// Preview: a business's first-ever report (no baseline scan yet).
// Run `npm run email:dev` and open this file's tab to view it.
import { MonthlyReportEmail } from "../MonthlyReportEmail";
import { SAMPLE_BASELINE } from "../sampleMonthlyReportContent";

export default function Preview() {
  return <MonthlyReportEmail {...SAMPLE_BASELINE} />;
}
