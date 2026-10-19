/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The review sign PDF route reads its print fonts from disk; make
    // sure they ship with that serverless function.
    outputFileTracingIncludes: {
      "/api/business/[id]/review-sign": ["./public/sign-fonts/**/*.ttf"],
      "/api/business/[id]/print-card": ["./public/sign-fonts/**/*.ttf"],
    },
  },
};

export default nextConfig;
