import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
