// The real unsubscribe destination for the monthly report email's
// unsubscribe link (see emails/MonthlyReportEmail.tsx and the URL built
// in app/api/cron/monthly-reports/route.ts) — matches that link's exact
// shape: /unsubscribe?business=<id>&token=<real per-business token>.
//
// Deliberately public and unauthenticated: an email recipient clicking
// this link from their inbox has no PostScore session, and requiring one
// would make the link itself non-functional for its one real job. The
// real per-business unsubscribe_token (supabase/schema.sql) is what
// actually authorizes this write, not a login — the same reasoning the
// cron route documents for using the service-role admin client: this is
// the system acting on a specific owner's behalf via a real, unguessable
// credential in the URL, not that owner's own logged-in session.
//
// A GET that performs a write is unusual, but it's the standard shape
// for an email unsubscribe link (including the industry-standard
// List-Unsubscribe header some clients use) and is exactly what was
// asked for here — this route only ever turns monthly_report_enabled
// OFF, never on, so a stray prefetch/link-scanner re-visiting this URL
// does no further harm than an owner clicking it twice.
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

function UnsubscribeShell({
  title,
  message,
  tone,
}: {
  title: string;
  message: string;
  tone: "success" | "error";
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <div className="mb-6 font-serif text-xl font-semibold">
          <span className="text-ink">Post</span>
          <span className="text-brass">Score</span>
        </div>
        <h1 className={tone === "error" ? "mb-2 text-lg font-semibold text-red" : "mb-2 text-lg font-semibold text-ink"}>
          {title}
        </h1>
        <p className="text-sm text-ink-soft">{message}</p>
      </Card>
    </div>
  );
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { business?: string; token?: string };
}) {
  const businessId = searchParams.business;
  const token = searchParams.token;

  if (!businessId || !token) {
    return (
      <UnsubscribeShell
        title="Invalid unsubscribe link"
        message="This link is missing information and can't be processed. If you clicked this from a real PostScore email, please contact support."
        tone="error"
      />
    );
  }

  // Service-role admin client — no session exists here to RLS-scope
  // against (see this file's top comment). Every business row's own
  // real unsubscribe_token is what proves this request is authorized,
  // checked explicitly below rather than relied on implicitly.
  const supabase = createAdminClient();

  const { data: business, error } = await supabase
    .from("businesses")
    .select("id, name, unsubscribe_token, monthly_report_enabled")
    .eq("id", businessId)
    .maybeSingle();

  if (error || !business || business.unsubscribe_token !== token) {
    return (
      <UnsubscribeShell
        title="Invalid or expired link"
        message="We couldn't verify this unsubscribe link. If you're still receiving emails you don't want, please contact support."
        tone="error"
      />
    );
  }

  if (business.monthly_report_enabled) {
    const { error: updateError } = await supabase
      .from("businesses")
      .update({ monthly_report_enabled: false })
      .eq("id", business.id);

    if (updateError) {
      return (
        <UnsubscribeShell
          title="Something went wrong"
          message="We verified your link but couldn't update your preference just now. Please try again in a moment."
          tone="error"
        />
      );
    }
  }

  return (
    <UnsubscribeShell
      title="You're unsubscribed"
      message={`Monthly email reports are now off for ${business.name ?? "this business"}. You can turn them back on anytime from its Reports page.`}
      tone="success"
    />
  );
}
