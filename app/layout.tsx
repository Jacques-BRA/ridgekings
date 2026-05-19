import type { Metadata } from "next";
import { Inter, Bebas_Neue, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopBar } from "@/components/TopBar";
import { Footer } from "@/components/Footer";

// Every route is per-user (balance, leaderboard, wagers, bet detail) and
// auth-gated by proxy.ts. Static prerendering at build time would not only
// be wasted work but would execute server modules without a real DB or
// session, causing build crashes. Force-dynamic at the root applies to
// every child segment unless explicitly overridden.
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "RidgeKings — The Office Sportsbook",
  description: "Where Productivity Goes To Die",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${bebas.variable} ${mono.variable} dark`}>
      <body className="min-h-screen bg-bg-base text-text antialiased flex flex-col">
        <TopBar />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
