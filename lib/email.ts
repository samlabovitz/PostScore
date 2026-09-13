// Thin transactional-email wrapper around Resend — the one place
// RESEND_API_KEY is ever read. "server-only" makes any accidental import
// from client code a build error rather than a leaked API key, same
// discipline as lib/supabase/admin.ts's service-role client.
//
// This module knows nothing about WHAT gets sent — no report content, no
// templates, no recipient logic. It's exactly one function: hand it a
// recipient, a subject, and either real HTML or a real React element,
// and it reports back whether the send genuinely succeeded, never
// throwing uncaught and never silently swallowing a failure.
import "server-only";
import type { ReactNode } from "react";
import { Resend } from "resend";

/** Resend's own sandbox sender — works with no domain verification, so
 * sending works out of the box in development. Override with
 * REPORT_FROM_EMAIL once a real domain is verified in the Resend
 * dashboard; no code change needed when that happens. */
const DEFAULT_FROM_EMAIL = "PostScore <onboarding@resend.dev>";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  /** Real rendered HTML for the message body. Provide this or `react`
   * (not both) — whichever the caller already has on hand. */
  html?: string;
  /** A real React element to render as the message body, as an
   * alternative to pre-rendered `html`. */
  react?: ReactNode;
  /** Overrides REPORT_FROM_EMAIL/DEFAULT_FROM_EMAIL for this one send —
   * most callers should just omit this and let the env var decide. */
  from?: string;
}

export type SendEmailResult = { status: "sent"; id: string } | { status: "error"; message: string };

/**
 * Sends one real transactional email via Resend. Never throws: every
 * failure — missing API key, no content provided, a real Resend API
 * error, or an unexpected network/thrown error — comes back as
 * `{ status: "error", message }` instead, and is also logged with
 * console.error so a failed send is never silently swallowed (same
 * genuine-error-logging discipline as the screenshot upload path in
 * lib/websiteScreenshotUpload.ts).
 */
export async function sendEmail({ to, subject, html, react, from }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY is not configured — email not sent.");
    return { status: "error", message: "Email sending isn't configured yet (missing RESEND_API_KEY)." };
  }

  if (!html && !react) {
    console.error("[email] sendEmail called with neither html nor react content — nothing to send.");
    return { status: "error", message: "No email content provided (html or react is required)." };
  }

  const resend = new Resend(apiKey);
  const sender = from ?? process.env.REPORT_FROM_EMAIL ?? DEFAULT_FROM_EMAIL;

  try {
    const { data, error } = await resend.emails.send(
      react
        ? { from: sender, to, subject, react }
        : { from: sender, to, subject, html: html! }
    );

    if (error) {
      console.error(`[email] send to "${Array.isArray(to) ? to.join(", ") : to}" failed: ${error.name} — ${error.message}`);
      return { status: "error", message: error.message };
    }

    return { status: "sent", id: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] send to "${Array.isArray(to) ? to.join(", ") : to}" threw an unexpected error: ${message}`);
    return { status: "error", message: "Failed to send email — an unexpected error occurred." };
  }
}
