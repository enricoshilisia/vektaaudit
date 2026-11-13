import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import { FlashBanner } from "@/components/FlashBanner";
import { readFlash } from "@/lib/server/flash";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-mono" });
const serif = IBM_Plex_Serif({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: { default: "VektaAudit", template: "%s · VektaAudit" },
  description: "Audit management for internal audit teams and audit firms",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body className="bg-canvas font-sans text-ink antialiased">
        <FlashBanner flash={await readFlash()} />
        {children}
      </body>
    </html>
  );
}
