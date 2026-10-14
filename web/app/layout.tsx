import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const display = Inter_Tight({ variable: "--font-display-face", subsets: ["latin"], weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Nykaa Market Intelligence",
  description: "Brand and product intelligence for beauty on Nykaa India.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} h-full antialiased`}>
      {/* Korean font, split by unicode range so a page only downloads the Hangul it shows (public/fonts/pretendard) */}
      {/* eslint-disable-next-line @next/next/no-css-tags -- a static file in public/, not a module */}
      <head><link rel="stylesheet" href="/fonts/pretendard/pretendard.css" /></head>
      <body className="min-h-full bg-page text-ink">{children}</body>
    </html>
  );
}
