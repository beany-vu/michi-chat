import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image: .next/standalone carries its own
  // pruned node_modules and server.js. The headers() below still apply there.
  output: "standalone",
  // Server Actions default to a 1 MB body. A whole-tenant import or one big KB document
  // (the HS nomenclature is 3.2 MB) posts more than that and surfaced as "This page
  // couldn't load" in the admin. 8 MB covers a tenant file with room; the chat route is a
  // route handler with its own cap and is not affected.
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  // Static security headers for the admin area ONLY.
  //
  // CORS deliberately does NOT live here. The chat endpoint sets its own per-tenant CORS
  // headers in its route handler, because a permissive Allow-Origin landing on an admin
  // response would let any tenant's page read admin JSON using the operator's cookie.
  async headers() {
    return [
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
