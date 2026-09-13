// Preview: missing data — no competitor scan this period, and the
// baseline scan predates profile-snapshot tracking.
// Run `npm run email:dev` and open this file's tab to view it.
import { MonthlyReportEmail } from "../MonthlyReportEmail";
import { SAMPLE_MISSING_DATA } from "../sampleMonthlyReportContent";

export default function Preview() {
  return <MonthlyReportEmail {...SAMPLE_MISSING_DATA} />;
}
