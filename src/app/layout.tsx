import type { Metadata } from "next";
import { Inter, Playfair_Display, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Opus Archive — Classical Music Database",
  description:
    "Explore classical composers, opus & catalog numbers, historical timelines, and musical influence networks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${inter.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen flex flex-col bg-[#faf8f4] text-[#1a1816]">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-stone-200/80 bg-white/70 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
            <div className="flex items-center gap-2">
              <span className="font-serif text-sm font-semibold text-stone-800">
                Opus Archive
              </span>
              <span>·</span>
              <span>Classical Music Reference & Influence Atlas</span>
            </div>
            <div>
              Powered by Next.js &amp; Supabase PostgreSQL · Seeded with Top 20 Composers
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
