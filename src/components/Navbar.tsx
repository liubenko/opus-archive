"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Music2, Library, Network, Users, Bookmark, Search, Globe2 } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/", label: "Composers", icon: Users },
  { href: "/works", label: "Works Index", icon: Library },
  { href: "/stage", label: "World Stage", icon: Globe2 },
  { href: "/explore", label: "Graph & Analytics", icon: Network },
  { href: "/studio", label: "My Studio", icon: Bookmark },
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
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new Event("opus:open-command-palette"))
            }
            title="Quick Search (Cmd+K)"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#191714] text-xs text-stone-500 dark:text-stone-400 hover:border-[#9a7432] dark:hover:border-[#d4af6a] hover:text-stone-900 dark:hover:text-stone-100 transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden md:inline font-mono text-[11px]">⌘K</span>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
