import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import "./globals.css";

const TITLE = "Einkaufswächter – Wocheneinkaufs-Optimierer";
const DESCRIPTION =
  "Vergleicht deine Einkaufsliste über Lidl, Aldi, Rewe, Edeka, Kaufland, Netto & Penny – und zeigt, ob sich ein zweiter Supermarkt für Wochenangebote wirklich lohnt.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Einkaufswächter",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b7a5c" },
    { media: "(prefers-color-scheme: dark)", color: "#0e131a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
