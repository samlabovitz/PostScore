import { IconCheck, IconPhoto, IconX } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import type { CategoryResult, Suggestion, WebsiteAnalysis } from "@/lib/scoring";

/** Checks worth surfacing here — has_website is trivially true whenever
 * this section renders at all (it only shows for businesses that
 * already have a website), so it adds nothing as an itemized finding. */
const VISUAL_ANALYSIS_CHECK_IDS = [
  "website.https",
  "website.performance_mobile",
  "website.content_depth",
  "website.contact_conversion",
];

/**
 * "What's wrong with your website, shown clearly": a real screenshot of
 * the live site (when one could be captured) next to an itemized list
 * of the real, measured strengths/problems that make up the Website
 * score — every line here is the exact same CheckResult/Suggestion data
 * scoreBusiness() produces everywhere else in the app, never a separate
 * narrative invented for this page. A signal that couldn't be measured
 * (the site blocked our automated check, or it hasn't been analyzed
 * yet) is shown as an honest "couldn't check," never guessed.
 */
export function WebsiteVisualAnalysis({
  websiteAnalysis,
  websiteCategory,
  websiteSuggestions,
}: {
  websiteAnalysis: WebsiteAnalysis | null;
  websiteCategory: CategoryResult | null;
  websiteSuggestions: Suggestion[];
}) {
  if (!websiteCategory) return null;

  const findings = websiteCategory.checks.filter((c) => VISUAL_ANALYSIS_CHECK_IDS.includes(c.id));

  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        Visual analysis
      </div>
      <p className="mb-3 text-sm text-ink-soft">
        What customers actually see when they visit your live site, and the real, measured reasons
        behind your Website score.
      </p>

      <div className="grid grid-cols-1 gap-5 nav:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="flex flex-col overflow-hidden p-0">
          {websiteAnalysis?.screenshotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={websiteAnalysis.screenshotUrl}
              alt="Screenshot of the business's live website"
              className="w-full border-b border-paper-line object-cover object-top"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
              <IconPhoto size={28} className="text-ink-mute" />
              <p className="text-sm text-ink-soft">
                We couldn&apos;t capture a preview of this site.
              </p>
              <p className="text-[12px] text-ink-mute">
                Some sites block automated screenshot tools, or a preview hasn&apos;t been captured
                yet — this doesn&apos;t affect the findings below.
              </p>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex flex-col divide-y divide-paper-line">
            {findings.map((check) => {
              const isGood =
                (check.confidence === "VERIFIED" || check.confidence === "LIKELY") &&
                (check.earnedPoints ?? 0) >= check.maxPoints;
              const isUnknown = check.confidence === "NOT_FOUND" || check.confidence === "UNCERTAIN";
              const suggestion = websiteSuggestions.find((s) => s.checkId === check.id);

              return (
                <div key={check.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="mt-0.5 shrink-0">
                    {isUnknown ? (
                      <Pill variant="neutral">Not checked</Pill>
                    ) : isGood ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green/10 text-green">
                        <IconCheck size={13} />
                      </span>
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red/10 text-red">
                        <IconX size={13} />
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-ink">{check.label}</div>
                    <p className="mt-0.5 text-[13px] text-ink-soft">{check.explanation}</p>
                    {!isGood && !isUnknown && suggestion && (
                      <p className="mt-1 text-[12.5px] text-ink-mute">{suggestion.advice}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
