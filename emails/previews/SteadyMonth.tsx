// Preview: a quiet month — nothing measurable actually changed.
// Run `npm run email:dev` and open this file's tab to view it.
import { MonthlyReportEmail } from "../MonthlyReportEmail";
import { SAMPLE_STEADY } from "../sampleMonthlyReportContent";

export default function Preview() {
  return <MonthlyReportEmail {...SAMPLE_STEADY} />;
}
