import type { NextConfig } from "next";

const backendOrigin = (
  process.env.VISION3D_BACKEND_ORIGIN?.trim() || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const dev = process.env.NODE_ENV === "development";
const publicHttps = process.env.NEXT_PUBLIC_PUBLIC_APP_URL?.startsWith("https://");
const configuredApi = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
const apiOrigin = configuredApi && /^https?:\/\//i.test(configuredApi)
  ? new URL(configuredApi).origin
  : "";
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline' ${dev ? "'unsafe-eval'" : "'wasm-unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  `connect-src 'self' blob: data: ${apiOrigin}${dev ? " ws: wss:" : ""}`.trim(),
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          ...(publicHttps && !dev ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
        ],
      },
      {
        source: "/ar/:token",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Permissions-Policy", value: "xr-spatial-tracking=(self)" },
        ],
      },
      {
        source: "/create",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
        ],
      },
      {
        source: "/samples/:path*.glb",
        headers: [
          { key: "Content-Type", value: "model/gltf-binary" },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
