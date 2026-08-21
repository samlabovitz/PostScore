import Link from "next/link";
import { login } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 text-center font-serif text-xl font-semibold">
          <span className="text-ink">Post</span>
          <span className="text-brass">Score</span>
        </div>

        <h1 className="mb-1 text-lg font-semibold text-ink">Log in</h1>
        <p className="mb-5 text-sm text-ink-soft">Welcome back.</p>

        {searchParams.error && (
          <p className="mb-4 rounded-lg bg-red/10 px-3 py-2 text-sm text-red">
            {searchParams.error}
          </p>
        )}

        <form action={login} className="flex flex-col gap-4">
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
              autoComplete="current-password"
              className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
            />
          </div>
          <Button type="submit" variant="brass" className="mt-1 w-full">
            Log in
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-soft">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-brass hover:underline">
            Sign up
          </Link>
        </p>
      </Card>
    </div>
  );
}
