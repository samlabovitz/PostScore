import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fraunces",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Postscore",
  description: "Postscore dashboard",
};

export default function RootLayout({
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
      </body>
    </html>
  );
}
