"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, Loader2, ArrowUpRight, Music, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { SearchCatalogResult } from "@/types/database";
import { ComposerAvatar } from "./ComposerAvatar";
import { getEraStyle } from "@/lib/constants";

const EXAMPLE_QUERIES = [
  "BWV 1007",
  "Moonlight",
  "K. 525",
  "Op. 27",
  "Chaikovsky",
  "Requiem",
];

export function CatalogSearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchCatalogResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_catalog", {
        query_text: trimmed,
        max_results: 12,
      });

      if (!cancelled) {
        if (!error && data) {
          setResults(data);
        } else {
          setResults([]);
        }
        setIsLoading(false);
        setIsOpen(true);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const composerHits = results.filter((r) => r.result_type === "composer");
  const workHits = results.filter((r) => r.result_type === "work");

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl">
      <div className="relative">
        <Search className="w-5 h-5 text-stone-400 dark:text-stone-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          placeholder="Search composers, works, nicknames, or opus numbers (e.g. BWV 1007, Op. 27, Moonlight)..."
          className="w-full pl-12 pr-11 py-3.5 rounded-xl bg-white dark:bg-[#141210] border border-stone-300/90 dark:border-stone-700/80 text-sm sm:text-base text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#9a7432]/30 dark:focus:ring-[#d4af6a]/30 focus:border-[#9a7432] dark:focus:border-[#d4af6a] transition-all"
        />
        {isLoading ? (
          <Loader2 className="w-4 h-4 text-stone-400 animate-spin absolute right-4 top-1/2 -translate-y-1/2" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              setIsOpen(false);
            }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {/* Quick search pills */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
        <span className="mr-1">Try:</span>
        {EXAMPLE_QUERIES.map((sample) => (
          <button
            key={sample}
            type="button"
            onClick={() => {
              setQuery(sample);
              setIsOpen(true);
            }}
            className="px-2.5 py-0.5 rounded-full bg-white/80 dark:bg-[#1f1c18] border border-stone-200 dark:border-stone-700/80 hover:border-[#9a7432]/60 dark:hover:border-[#d4af6a]/60 hover:text-stone-900 dark:hover:text-stone-100 transition-colors cursor-pointer"
          >
            {sample}
          </button>
        ))}
      </div>

      {/* Results Dropdown */}
      {isOpen && query.trim().length > 0 && (
        <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#191714] rounded-xl border border-stone-200 dark:border-stone-700/80 shadow-xl overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
          {isLoading && results.length === 0 ? (
            <div className="p-6 text-center text-sm text-stone-500 dark:text-stone-400">
              Searching the archive...
            </div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center text-sm text-stone-500 dark:text-stone-400">
              No matches found for &ldquo;{query}&rdquo;. Try a composer name,
              catalog number (Op., BWV, K., RV, D.), or genre.
            </div>
          ) : (
            <div className="divide-y divide-stone-100 dark:divide-stone-800">
              {composerHits.length > 0 && (
                <div className="p-2">
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Composers ({composerHits.length})
                  </div>
                  <div className="space-y-0.5">
                    {composerHits.map((hit) => {
                      const eraStyle = getEraStyle(hit.era);
                      return (
                        <Link
                          key={`composer-${hit.id}`}
                          href={`/composers/${hit.composer_slug}`}
                          onClick={() => setIsOpen(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-stone-50 dark:hover:bg-[#23201c] transition-colors group"
                        >
                          <ComposerAvatar
                            name={hit.title}
                            avatarUrl={hit.avatar_url}
                            era={hit.era}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-serif font-semibold text-stone-900 dark:text-stone-100 group-hover:text-[#9a7432] dark:group-hover:text-[#d4af6a] transition-colors truncate">
                                {hit.title}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full border ${eraStyle.bg} ${eraStyle.border} ${eraStyle.text}`}
                              >
                                {hit.era}
                              </span>
                            </div>
                            {hit.subtitle && (
                              <p className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
                                {hit.subtitle}
                              </p>
                            )}
                          </div>
                          <ArrowUpRight className="w-4 h-4 text-stone-300 dark:text-stone-600 group-hover:text-stone-700 dark:group-hover:text-stone-200 shrink-0" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {workHits.length > 0 && (
                <div className="p-2">
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5" />
                    Works &amp; Catalog Entries ({workHits.length})
                  </div>
                  <div className="space-y-0.5">
                    {workHits.map((hit) => (
                      <Link
                        key={`work-${hit.id}`}
                        href={`/composers/${hit.composer_slug}#work-${hit.id}`}
                        onClick={() => setIsOpen(false)}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-stone-50 dark:hover:bg-[#23201c] transition-colors group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {hit.catalog_display && (
                              <span className="font-mono text-[11px] font-medium px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 border border-stone-200/80 dark:border-stone-700 shrink-0">
                                {hit.catalog_display}
                              </span>
                            )}
                            <span className="font-medium text-sm text-stone-900 dark:text-stone-100 group-hover:text-[#9a7432] dark:group-hover:text-[#d4af6a] transition-colors truncate">
                              {hit.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                            <span className="font-medium text-stone-700 dark:text-stone-300">
                              {hit.composer_name}
                            </span>
                            {hit.subtitle && (
                              <>
                                <span>·</span>
                                <span className="truncate">{hit.subtitle}</span>
                              </>
                            )}
                            {hit.year_value && (
                              <>
                                <span>·</span>
                                <span>{hit.year_value}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-stone-300 dark:text-stone-600 group-hover:text-stone-700 dark:group-hover:text-stone-200 shrink-0" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
