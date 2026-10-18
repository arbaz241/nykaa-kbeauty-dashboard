import type { NextConfig } from "next";

// Static export: plain HTML/CSS/JS served from a CDN (Cloudflare Pages). All data is fetched in the
// browser from Supabase with the signed-in user's session, so row-level security applies.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
