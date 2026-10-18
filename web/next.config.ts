import { existsSync, readFileSync } from "node:fs";
import type { NextConfig } from "next";

// Static export: plain HTML/CSS/JS served from a CDN (Cloudflare Pages). Data comes from the nightly data files next
// to the site when scripts/export-data.mjs wrote them (open access), else from Supabase with the signed-in user's
// session, so row-level security applies.
const manifest = existsSync("public/data/manifest.json") ? readFileSync("public/data/manifest.json", "utf8") : "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  env: { NEXT_PUBLIC_DATA_MANIFEST: manifest },
};

export default nextConfig;
