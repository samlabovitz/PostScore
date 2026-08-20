import { DashboardShell } from "@/components/layout/DashboardShell";
import { ScoreCard } from "@/components/dashboard/ScoreCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";

const STAT_LABELS = ["Reviews", "Response rate", "Avg. rating", "Visibility"];

export default function Home() {
  return (
    <DashboardShell>
      <div className="flex flex-col gap-6 nav:gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">
              Overview
            </h1>
            <p className="mt-1 text-sm text-ink-soft">—</p>
          </div>
          <div className="flex gap-2">
            <Button variant="default" size="sm" className="flex-1 sm:flex-none">
              Secondary action
            </Button>
            <Button variant="brass" size="sm" className="flex-1 sm:flex-none">
              Primary action
            </Button>
          </div>
        </div>

        <ScoreCard />

        <div className="flex flex-col gap-4">
          <SectionHeading title="Performance" />
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {STAT_LABELS.map((label) => (
              <Card key={label} className="p-4">
                <StatTile label={label} />
              </Card>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
