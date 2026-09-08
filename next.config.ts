import type { NextConfig } from "next";

const supabaseHost = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).host : undefined;

const nextConfig: NextConfig = {
  // Product photos are pre-sized WebP files; serve them as-is from local or Supabase storage.
  images: {
    unoptimized: true,
    remotePatterns: supabaseHost ? [{ protocol: "https", hostname: supabaseHost }] : [],
  },
  serverExternalPackages: ["postgres", "embedded-postgres", "bwip-js", "exceljs", "@react-pdf/renderer"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
