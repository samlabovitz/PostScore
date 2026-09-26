import Link from "next/link";
import { updatePasswordAction } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string; success?: string };
}) {
  // exchangeCodeForSession (app/auth/callback/route.ts) creates a real
  // session from the reset email's one-time code before ever landing
  // here — so a real session is exactly what "this link is still valid"
  // means. success=1 still has that same session (updateUser doesn't
  // end it), so it's checked first rather than falling into the
  // invalid-link state.
  if (searchParams.success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <Card className="w-full max-w-sm p-6 text-center">
          <div className="mb-6 font-serif text-xl font-semibold">
            <span className="text-ink">Post</span>
            <span className="text-brass">Score</span>
          </div>
          <h1 className="mb-2 text-lg font-semibold text-ink">Your password has been updated</h1>
          <Link href="/">
            <Button type="button" variant="brass" className="mt-2 w-full">
              Go to dashboard
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <Card className="w-full max-w-sm p-6 text-center">
          <div className="mb-6 font-serif text-xl font-semibold">
            <span className="text-ink">Post</span>
            <span className="text-brass">Score</span>
          </div>
          <h1 className="mb-2 text-lg font-semibold text-ink">This reset link is invalid or has expired</h1>
          <p className="mb-4 text-sm text-ink-soft">Request a new one to keep going.</p>
          <Link href="/forgot-password" className="font-medium text-brass hover:underline">
            Request a new link
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 text-center font-serif text-xl font-semibold">
          <span className="text-ink">Post</span>
          <span className="text-brass">Score</span>
        </div>

        <h1 className="mb-1 text-lg font-semibold text-ink">Set a new password</h1>
        <p className="mb-5 text-sm text-ink-soft">Choose a new password for your account.</p>

        {searchParams.error && (
          <p className="mb-4 rounded-lg bg-red/10 px-3 py-2 text-sm text-red">
            {searchParams.error}
          </p>
        )}

        <form action={updatePasswordAction} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-soft">
              New password
            </label>
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-soft">
              Confirm new password
            </label>
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
            />
          </div>
          <Button type="submit" variant="brass" className="mt-1 w-full">
            Update password
          </Button>
        </form>
      </Card>
    </div>
  );
}
