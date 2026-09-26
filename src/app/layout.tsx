import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daywell — Your ideas, made possible",
  description: "A calmer way to plan your goals, write your stories, and grow with your own AI companion.",
  applicationName: "Daywell",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Daywell" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
