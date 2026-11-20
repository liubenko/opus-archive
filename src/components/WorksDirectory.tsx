"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Sparkles, Clock, X } from "lucide-react";
import type { WorkWithComposer } from "@/types/database";
import { ERA_ORDER, getEraStyle } from "@/lib/constants";

interface WorksDirectoryProps {
  works: WorkWithComposer[];
}

export function WorksDirectory({ works }: WorksDirectoryProps) {
  const [query, setQuery] = useState("");
  const [eraFilter, setEraFilter] = useState("All");
  const [genreFilter, setGenreFilter] = useState("All");
  const [catalogFilter, setCatalogFilter] = useState("All");
  const [popularOnly, setPopularOnly] = useState(false);

  const genres = useMemo(
    () => Array.from(new Set(works.map((w) => w.genre))).sort(),
    [works]
  );

  const catalogSystems = useMemo(
    () =>
      Array.from(
        new Set(
          works.map((w) => w.catalog_system).filter((s): s is string => Boolean(s))
        )
      ).sort(),
    [works]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return works.filter((w) => {
      if (eraFilter !== "All" && w.composers?.era !== eraFilter) return false;
      if (genreFilter !== "All" && w.genre !== genreFilter) return false;
      if (catalogFilter !== "All" && w.catalog_system !== catalogFilter)
        return false;
      if (popularOnly && !w.is_popular) return false;
      if (q) {
        const hay = [
          w.title,
          w.nickname,
          w.catalog_display,
          w.composers?.name,
          w.genre,
          w.key_signature,
          w.instrumentation,
          w.year_composed?.toString(),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [works, query, eraFilter, genreFilter, catalogFilter, popularOnly]);

  const hasActiveFilters =
    query.trim() !== "" ||
    eraFilter !== "All" ||
    genreFilter !== "All" ||
    catalogFilter !== "All" ||
    popularOnly;

  return (
    <div className="space-y-5">
      {/* Filter Bar */}
      <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title, nickname, composer, catalog number (Op., BWV, K., RV, D., S.)..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-[#141210] focus:border-[#9a7432] dark:focus:border-[#d4af6a]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={eraFilter}
              onChange={(e) => setEraFilter(e.target.value)}
              aria-label="Filter by era"
              className="px-3 py-2.5 text-xs font-medium bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 rounded-xl text-stone-700 dark:text-stone-200 focus:outline-none focus:border-[#9a7432] dark:focus:border-[#d4af6a] cursor-pointer"
            >
              <option value="All" className="dark:bg-[#191714]">
                All Eras
              </option>
              {ERA_ORDER.map((e) => (
                <option key={e} value={e} className="dark:bg-[#191714]">
                  {e}
                </option>
              ))}
            </select>

            <select
              value={genreFilter}
              onChange={(e) => setGenreFilter(e.target.value)}
              aria-label="Filter by genre"
              className="px-3 py-2.5 text-xs font-medium bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 rounded-xl text-stone-700 dark:text-stone-200 focus:outline-none focus:border-[#9a7432] dark:focus:border-[#d4af6a] cursor-pointer"
            >
              <option value="All" className="dark:bg-[#191714]">
                All Genres
              </option>
              {genres.map((g) => (
                <option key={g} value={g} className="dark:bg-[#191714]">
                  {g}
                </option>
              ))}
            </select>

            <select
              value={catalogFilter}
              onChange={(e) => setCatalogFilter(e.target.value)}
              aria-label="Filter by catalog system"
              className="px-3 py-2.5 text-xs font-medium bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 rounded-xl text-stone-700 dark:text-stone-200 focus:outline-none focus:border-[#9a7432] dark:focus:border-[#d4af6a] cursor-pointer"
            >
              <option value="All" className="dark:bg-[#191714]">
                All Catalogs
              </option>
              {catalogSystems.map((c) => (
                <option key={c} value={c} className="dark:bg-[#191714]">
                  {c}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setPopularOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                popularOnly
                  ? "bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200"
                  : "bg-[#faf8f4] dark:bg-[#141210] border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-200 hover:border-stone-400 dark:hover:border-stone-600"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Essential Only
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 pt-1">
          <span>
            Showing{" "}
            <strong className="text-stone-900 dark:text-stone-100">
              {filtered.length}
            </strong>{" "}
            of {works.length} cataloged works
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setEraFilter("All");
                setGenreFilter("All");
                setCatalogFilter("All");
                setPopularOnly(false);
              }}
              className="inline-flex items-center gap-1 text-[#9a7432] dark:text-[#d4af6a] hover:underline font-medium cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Responsive Table */}
      <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 bg-[#faf8f4]/80 dark:bg-[#141210] text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                <th className="py-3.5 px-4">Catalog</th>
                <th className="py-3.5 px-4">Work &amp; Nickname</th>
                <th className="py-3.5 px-4">Composer</th>
                <th className="py-3.5 px-4">Genre</th>
                <th className="py-3.5 px-4">Key</th>
                <th className="py-3.5 px-4 text-right">Year</th>
                <th className="py-3.5 px-4 text-right">Dur.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 px-4 text-center text-stone-500 dark:text-stone-400"
                  >
                    No works match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((work) => {
                  const composer = work.composers;
                  const eraStyle = getEraStyle(composer?.era ?? "");

                  return (
                    <tr
                      key={work.id}
                      className="hover:bg-[#faf8f4]/70 dark:hover:bg-[#221f1b]/80 transition-colors"
                    >
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        {work.catalog_display ? (
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200/80 dark:border-stone-700">
                            {work.catalog_display}
                          </span>
                        ) : (
                          <span className="text-xs text-stone-400 dark:text-stone-600">
                            —
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 align-top max-w-md">
                        <Link
                          href={
                            composer
                              ? `/composers/${composer.slug}#work-${work.id}`
                              : "#"
                          }
                          className="font-serif font-semibold text-stone-900 dark:text-[#f3efe6] hover:text-[#9a7432] dark:hover:text-[#d4af6a] transition-colors block leading-snug"
                        >
                          {work.title}
                        </Link>
                        {work.nickname && (
                          <span className="text-xs text-[#9a7432] dark:text-[#d4af6a] block mt-0.5">
                            &ldquo;{work.nickname}&rdquo;
                          </span>
                        )}
                        {work.instrumentation && (
                          <span className="text-[11px] text-stone-400 dark:text-stone-500 block mt-0.5">
                            {work.instrumentation}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        {composer ? (
                          <div>
                            <Link
                              href={`/composers/${composer.slug}`}
                              className="font-medium text-stone-800 dark:text-stone-200 hover:text-[#9a7432] dark:hover:text-[#d4af6a] transition-colors block"
                            >
                              {composer.name}
                            </Link>
                            <span
                              className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full border ${eraStyle.bg} ${eraStyle.border} ${eraStyle.text}`}
                            >
                              {composer.era}
                            </span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <span className="text-xs px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium">
                          {work.genre}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 align-top whitespace-nowrap text-xs text-stone-600 dark:text-stone-400">
                        {work.key_signature ?? "—"}
                      </td>
                      <td className="py-3.5 px-4 align-top whitespace-nowrap text-right font-mono text-xs text-stone-600 dark:text-stone-400">
                        {work.year_composed ?? "—"}
                      </td>
                      <td className="py-3.5 px-4 align-top whitespace-nowrap text-right text-xs text-stone-500 dark:text-stone-400">
                        {work.duration_minutes ? (
                          <span className="inline-flex items-center justify-end gap-1">
                            <Clock className="w-3 h-3 text-stone-400 dark:text-stone-500" />
                            {work.duration_minutes}m
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
