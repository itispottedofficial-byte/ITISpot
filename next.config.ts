import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.ITISPOT_DIST_DIR || ".next",
  env: { ITISPOT_RUNTIME: process.env.ITISPOT_RUNTIME || "node" },
  serverExternalPackages: ["sharp", "heic-convert", "heic-decode"],
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "production" ? "" : "'unsafe-eval'"} https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
          },
        ],
      },
    ];
  },
};
export default config;
