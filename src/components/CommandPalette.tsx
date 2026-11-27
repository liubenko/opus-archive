"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Loader2,
  Music,
  User,
  Library,
  Network,
  Bookmark,
  Code2,
  CornerDownLeft,
  Globe2,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { SearchCatalogResult } from "@/types/database";
import { openSuggestCatalogModal } from "./SuggestCatalogModal";

const QUICK_LINKS = [
  { label: "Browse All Composers", href: "/", icon: User },
  { label: "Master Works & Opus Index", href: "/works", icon: Library },
  { label: "World Stage (Venues, Orchestras & Soloists)", href: "/stage", icon: Globe2 },
  { label: "Knowledge Graph & Timeline", href: "/explore", icon: Network },
  { label: "My Studio (Repertoire & Programs)", href: "/studio", icon: Bookmark },
  { label: "Public & Personal REST API Docs", href: "/docs/api", icon: Code2 },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchCatalogResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onCustomOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("opus:open-command-palette", onCustomOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("opus:open-command-palette", onCustomOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      setActiveIndex(0);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_catalog", {
        query_text: q,
        max_results: 10,
      });
      if (!cancelled) {
        setResults(data ?? []);
        setActiveIndex(0);
        setLoading(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const navItems = query.trim()
    ? results.map((r) => ({
        key: `${r.result_type}-${r.id}`,
        title: r.title,
        subtitle:
          r.result_type === "composer"
            ? `${r.era} Composer`
            : [r.catalog_display, r.composer_name, r.year_value]
                .filter(Boolean)
                .join(" · "),
        badge: r.result_type === "composer" ? "Composer" : r.catalog_display || "Work",
        href:
          r.result_type === "composer"
            ? `/composers/${r.composer_slug}`
            : `/works/${r.id}`,
        isComposer: r.result_type === "composer",
      }))
    : QUICK_LINKS.map((l) => ({
        key: l.href,
        title: l.label,
        subtitle: l.href,
        badge: "Jump",
        href: l.href,
        isComposer: false,
      }));

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (navItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % navItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + navItems.length) % navItems.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = navItems[activeIndex];
      if (target) go(target.href);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-[12vh] px-4 print:hidden"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-stone-200 dark:border-stone-800">
          {loading ? (
            <Loader2 className="w-4 h-4 text-[#d4af6a] animate-spin shrink-0" />
          ) : (
            <Search className="w-4 h-4 text-stone-400 shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search composers, works, BWV / Op. / K. numbers, or jump..."
            className="flex-1 bg-transparent text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1 rounded-md text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {navItems.length === 0 && !loading ? (
            <div className="py-8 px-4 text-center space-y-3">
              <p className="text-xs text-stone-500">
                No matches found for &ldquo;{query}&rdquo; in Opus Archive yet.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const q = query;
                    setOpen(false);
                    openSuggestCatalogModal({ mode: "work", query: q });
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Propose Missing Work
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const q = query;
                    setOpen(false);
                    openSuggestCatalogModal({ mode: "composer", query: q });
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:border-[#d4af6a] cursor-pointer"
                >
                  <User className="w-3.5 h-3.5" />
                  Propose Composer
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                {query.trim() ? "Catalog Matches" : "Quick Navigation"}
              </div>
              {navItems.map((item, idx) => {
                const active = idx === activeIndex;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => go(item.href)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      active
                        ? "bg-[#f4ede0] dark:bg-[#252019] text-stone-900 dark:text-[#f3efe6]"
                        : "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#221f1b]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.isComposer ? (
                        <User className="w-4 h-4 text-[#9a7432] dark:text-[#d4af6a] shrink-0" />
                      ) : (
                        <Music className="w-4 h-4 text-stone-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                        {item.badge}
                      </span>
                      {active && (
                        <CornerDownLeft className="w-3.5 h-3.5 text-[#9a7432] dark:text-[#d4af6a]" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-stone-200 dark:border-stone-800 bg-[#faf8f4] dark:bg-[#141210] flex items-center justify-between text-[11px] text-stone-400">
          <span>↑↓ to navigate · Enter to open · Esc to close</span>
          {query.trim() ? (
            <button
              type="button"
              onClick={() => {
                const q = query;
                setOpen(false);
                openSuggestCatalogModal({ mode: "work", query: q });
              }}
              className="text-[#9a7432] dark:text-[#d4af6a] font-semibold hover:underline cursor-pointer"
            >
              + Propose missing entry
            </button>
          ) : (
            <span className="font-mono">⌘K</span>
          )}
        </div>
      </div>
    </div>
  );
}
