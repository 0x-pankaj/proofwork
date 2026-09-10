import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

// `||`, not `??`: an unset Worker variable arrives as an empty string.
const SITE_URL = process.env.PUBLIC_WEB_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Proofwork — bounties that pay themselves",
    template: "%s · Proofwork",
  },
  description:
    "Escrowed USDC bounties for open-source work, settled on Arc the moment a maintainer merges the pull request.",
  openGraph: {
    siteName: "Proofwork",
    type: "website",
    images: [{ url: "/cover.png", width: 1600, height: 900, alt: "Proofwork" }],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-5 pb-24 sm:px-8">{children}</main>
        <footer className="border-rule mx-auto w-full max-w-6xl border-t px-5 py-8 text-sm text-ink-faint sm:px-8">
          <p>
            Escrow on Arc, Circle&apos;s USDC chain. Every payment on this site is a real
            transaction you can open in the explorer.
          </p>
        </footer>
      </body>
    </html>
  );
}
