import type { Metadata } from "next";
import Link from "next/link";
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

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var saved = localStorage.getItem('opus-theme');
    if (saved === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${playfair.variable} ${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen flex flex-col bg-[#faf8f4] dark:bg-[#11100e] text-[#1a1816] dark:text-[#f3efe6] transition-colors">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-stone-200/80 dark:border-stone-800/80 bg-white/70 dark:bg-[#161412]/80 mt-16 print:hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500 dark:text-stone-400">
            <div className="flex items-center gap-2">
              <span className="font-serif text-sm font-semibold text-stone-800 dark:text-stone-200">
                Opus Archive
              </span>
              <span>·</span>
              <span>Classical Music Reference &amp; Influence Atlas</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/docs/api"
                className="hover:text-stone-900 dark:hover:text-stone-100 font-medium transition-colors"
              >
                REST API Docs
              </Link>
              <span>·</span>
              <Link
                href="/studio"
                className="hover:text-stone-900 dark:hover:text-stone-100 font-medium transition-colors"
              >
                My Studio
              </Link>
              <span>·</span>
              <span>Next.js · Cloudflare Workers · Supabase</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
