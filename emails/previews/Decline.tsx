// Preview: a genuine decline — real drops in score, rating, reviews,
// and competitor rank, supportive but never congratulatory.
// Run `npm run email:dev` and open this file's tab to view it.
import { MonthlyReportEmail } from "../MonthlyReportEmail";
import { SAMPLE_DECLINE } from "../sampleMonthlyReportContent";

export default function Preview() {
  return <MonthlyReportEmail {...SAMPLE_DECLINE} />;
}
