import type { NextConfig } from "next";

// STATIC_EXPORT=1 builds the static GitHub Pages demo (API routes are removed
// by the workflow before building; the client runs in NEXT_PUBLIC_STATIC mode).
// GITHUB_PAGES=1 additionally prefixes paths for github.io/<repo>/ hosting.
const isStatic = process.env.STATIC_EXPORT === "1";
const onPages = process.env.GITHUB_PAGES === "1";

const nextConfig: NextConfig = {
  ...(isStatic ? { output: "export" as const, images: { unoptimized: true } } : {}),
  ...(onPages ? { basePath: "/schema-translator-xero" } : {}),
};

export default nextConfig;
