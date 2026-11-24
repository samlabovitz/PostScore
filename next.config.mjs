/** @type {import('next').NextConfig} */
const nextConfig = {
  // `npm run dev:new` (the new-design preview on :3001) builds into its own
  // folder, so it never overwrites `npm run dev`'s .next on :3000.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // instrumentation.ts: startup warnings for GOOGLE_WRITES_LIVE_PLACES.
    instrumentationHook: true,
    // The review sign PDF route reads its print fonts from disk; make
    // sure they ship with that serverless function.
    outputFileTracingIncludes: {
      "/api/business/[id]/review-sign": ["./public/sign-fonts/**/*.ttf"],
      "/api/business/[id]/print-card": ["./public/sign-fonts/**/*.ttf"],
    },
  },
};

export default nextConfig;
