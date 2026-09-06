import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "michi-chat",
  description: "A small multi-tenant chat assistant platform for small businesses",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
