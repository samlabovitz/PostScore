import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function SignupPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string };
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 text-center font-serif text-xl font-semibold">
          <span className="text-ink">Post</span>
          <span className="text-brass">Score</span>
        </div>

        <h1 className="mb-1 text-lg font-semibold text-ink">Sign up</h1>
        <p className="mb-5 text-sm text-ink-soft">Create your account.</p>

        {searchParams.error && (
          <p className="mb-4 rounded-lg bg-red/10 px-3 py-2 text-sm text-red">
            {searchParams.error}
          </p>
        )}
        {searchParams.message && (
          <p className="mb-4 rounded-lg bg-green/10 px-3 py-2 text-sm text-green">
            {searchParams.message}
          </p>
        )}

        <form action={signup} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-soft">
              Email
            </label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-soft">
              Password
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
          <Button type="submit" variant="brass" className="mt-1 w-full">
            Sign up
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-soft">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brass hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  );
}
