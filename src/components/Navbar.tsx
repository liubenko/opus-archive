"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Music2, Library, Network, Users, Shield } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/", label: "Composers", icon: Users },
  { href: "/works", label: "Works Index", icon: Library },
  { href: "/explore", label: "Graph & Analytics", icon: Network },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 dark:border-stone-800/80 bg-[#faf8f4]/90 dark:bg-[#11100e]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-lg bg-[#1a1816] dark:bg-[#d4af6a] text-[#e8d5b0] dark:text-[#11100e] flex items-center justify-center shadow-sm group-hover:opacity-90 transition-opacity">
            <Music2 className="w-4 h-4" />
          </div>
          <div className="leading-tight">
            <span className="font-serif text-lg font-semibold tracking-tight text-[#1a1816] dark:text-[#f3efe6] block">
              Opus Archive
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400 block">
              Classical Music DB
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1 sm:gap-1.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive =
                href === "/"
                  ? pathname === "/" || pathname.startsWith("/composers")
                  : pathname.startsWith(href);

              return (
                <Link
                  key={href}
                  href={href}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#1a1816] dark:bg-[#f3efe6] text-[#faf8f4] dark:text-[#11100e] shadow-xs"
                      : "text-stone-600 dark:text-stone-300 hover:text-stone-950 dark:hover:text-white hover:bg-stone-200/60 dark:hover:bg-stone-800/70"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
          <Link
            href="/admin"
            title="Admin Panel"
            aria-label="Admin Panel"
            className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ${
              pathname.startsWith("/admin")
                ? "bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] border-transparent"
                : "border-stone-200 dark:border-stone-800 bg-white dark:bg-[#191714] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#24201b]"
            }`}
          >
            <Shield className="w-4 h-4" />
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
