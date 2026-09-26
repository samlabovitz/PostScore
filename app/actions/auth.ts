"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/signup?message=${encodeURIComponent(
      "Check your email to confirm your account before logging in."
    )}`
  );
}

/** The real, current request's own origin — built from the actual
 * incoming headers (never a hardcoded domain), so a password-reset link
 * works whether this is running on localhost or the real deployed site
 * (postscoree.netlify.app), without needing an env var kept in sync
 * with wherever this happens to be deployed. `x-forwarded-*` first
 * since Netlify's edge sits in front of the app; falls back to the
 * plain `host` header (and assumes http only for localhost) for local
 * dev, where nothing sets forwarded headers at all. */
function requestOrigin(): string {
  const headerList = headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Sends Supabase's own built-in password-reset email — never reveals
 * whether the address actually has an account (Supabase's own API for
 * this already doesn't, and the caller — app/forgot-password/page.tsx —
 * shows the exact same message on every successful call regardless).
 * redirectTo points at the existing auth callback route with
 * next=/reset-password, so clicking the email link exchanges the real
 * reset code for a session and lands the owner on the real
 * new-password form, never a guessed or hardcoded URL.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "");

  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${requestOrigin()}/auth/callback?next=/reset-password`,
  });

  if (error) {
    redirect(`/forgot-password?error=${encodeURIComponent("Something went wrong. Please try again.")}`);
  }

  redirect(
    `/forgot-password?message=${encodeURIComponent(
      "If an account exists for that email, we've sent a link to reset your password. Check your inbox and spam folder."
    )}`
  );
}

/**
 * Sets a new password for whoever the current session belongs to — only
 * ever meaningfully reachable from app/reset-password/page.tsx, which
 * only renders this form when a real session already exists (the one
 * the auth callback route just created from a real reset-email code).
 * Validated here too, not just via the form's own minLength — a
 * determined caller can always bypass client-side HTML validation.
 */
export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 6) {
    redirect(`/reset-password?error=${encodeURIComponent("Password must be at least 6 characters.")}`);
  }
  if (password !== confirmPassword) {
    redirect(`/reset-password?error=${encodeURIComponent("Passwords do not match.")}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/reset-password?success=1");
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/** The logged-in session's own real email, or null if there is no
 * session — used by DashboardShell (a client component, so it can't
 * read the session directly) to show it under "Account" in the sidebar.
 * Never throws; an absent session is a normal, expected state here
 * (e.g. a stale client render right as a session expires), not an
 * error. */
export async function getCurrentUserEmail(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}
