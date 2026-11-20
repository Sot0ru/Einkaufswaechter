import { GeistMono } from "geist/font/mono";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Selbst gehostet (über @fontsource-variable), damit der Build ohne Netzwerkzugriff funktioniert.
const overpass = localFont({
  src: "../../node_modules/@fontsource-variable/overpass/files/overpass-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-overpass",
});

const TITLE = "Einkaufswächter – Wocheneinkaufs-Optimierer";
const DESCRIPTION =
  "Vergleicht deine Einkaufsliste über Lidl, Aldi, Rewe, Edeka, Kaufland, Netto & Penny – und zeigt, ob sich ein zweiter Supermarkt für Wochenangebote wirklich lohnt.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#173a5e" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1f36" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${overpass.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
