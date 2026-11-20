"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Music2, Library, Network, Users } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Composers", icon: Users },
  { href: "/works", label: "Works Index", icon: Library },
  { href: "/explore", label: "Graph & Analytics", icon: Network },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#faf8f4]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-lg bg-[#1a1816] text-[#e8d5b0] flex items-center justify-center shadow-sm group-hover:bg-[#2c2824] transition-colors">
            <Music2 className="w-4 h-4" />
          </div>
          <div className="leading-tight">
            <span className="font-serif text-lg font-semibold tracking-tight text-[#1a1816] block">
              Opus Archive
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-stone-500 block">
              Classical Music DB
            </span>
          </div>
        </Link>

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
                    ? "bg-[#1a1816] text-[#faf8f4] shadow-xs"
                    : "text-stone-600 hover:text-stone-950 hover:bg-stone-200/60"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
