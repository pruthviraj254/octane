import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { Providers } from "@/components/providers";
import "./globals.css";

// Bundled with the app, so type never depends on a font server being reachable.
const display = localFont({
  src: "../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});
const serif = localFont({
  src: "../node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2",
  variable: "--font-instrument",
  weight: "400",
  style: "italic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Octane",
  description: "An open gas market. No gas token needed; one fee in stablecoins.",
};

export const viewport: Viewport = {
  themeColor: "#070a12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${display.variable} ${serif.variable}`}>
      <body className="min-h-screen overflow-x-hidden">
        <Providers>
          <Nav />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
