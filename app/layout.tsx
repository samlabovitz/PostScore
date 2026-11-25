import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { canSwitchPlan, getPlan } from "@/lib/premium";
import { DevPlanPill } from "@/components/dev/DevPlanPill";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DEV_TIER_COOKIE, devPreviewTier, devTierAllowed } from "@/lib/devTier";

// Self-hosted (app/fonts, SIL Open Font License): Fraunces for headings,
// page titles, business names and score numbers (`font-serif`), Inter for
// everything else (`font-sans`) — the same families and weights as before
// (Fraunces 400–700, Inter 400–600), but no longer downloaded from Google
// Fonts when the server starts: a failed download there silently swapped
// every heading to a sans fallback.
const fraunces = localFont({
  src: "./fonts/Fraunces-latin-wght.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  variable: "--font-fraunces",
  fallback: ["Georgia", "serif"],
});
const inter = localFont({
  src: "./fonts/Inter-latin-wght.woff2",
  weight: "400 600",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Postscore",
  description: "Postscore dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The honest default — this single root layout has no way to know a
  // nested /business/[id]/* route's own business (and so its real
  // language) before rendering server-side. components/layout/
  // DashboardShell.tsx, which DOES know it on every dashboard page,
  // corrects this client-side to the current business's real language;
  // a page with no business in context (this one, login/signup, the
  // home list) simply leaves it at "en".
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${inter.variable} antialiased`}>
        {children}
        {/* Development, or (production) only a PLAN_SWITCHER_EMAILS user — checked on the server. */}
        {(await canSwitchPlan()) && <DevPlanPill plan={await getPlan()} tier={await devTierForPill()} />}
      </body>
    </html>
  );
}

/** The dev test login's preview tier for the pill ("real" when none); undefined for everyone else. */
async function devTierForPill(): Promise<number | "real" | undefined> {
  if (process.env.NODE_ENV !== "development") return undefined;
  const { data } = await createClient().auth.getUser();
  const allowed = devTierAllowed(process.env, data.user?.email);
  if (!allowed) return undefined;
  return devPreviewTier(cookies().get(DEV_TIER_COOKIE)?.value, true) ?? "real";
}
