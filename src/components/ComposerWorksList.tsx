"use client";

import { useMemo, useState } from "react";
import { Clock, Layers, Search, Sparkles, Music } from "lucide-react";
import type { Work } from "@/types/database";

interface ComposerWorksListProps {
  works: Work[];
}

export function ComposerWorksList({ works }: ComposerWorksListProps) {
  const [genreFilter, setGenreFilter] = useState<string>("All");
  const [popularOnly, setPopularOnly] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");

  const genres = useMemo(() => {
    return Array.from(new Set(works.map((w) => w.genre))).sort();
  }, [works]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return works.filter((w) => {
      if (genreFilter !== "All" && w.genre !== genreFilter) return false;
      if (popularOnly && !w.is_popular) return false;
      if (q) {
        const hay = [
          w.title,
          w.nickname,
          w.catalog_display,
          w.key_signature,
          w.instrumentation,
          w.year_composed?.toString(),
          w.description,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [works, genreFilter, popularOnly, query]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setGenreFilter("All")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              genreFilter === "All"
                ? "bg-[#1a1816] text-white"
                : "bg-white border border-stone-200 text-stone-600 hover:border-stone-400"
            }`}
          >
            All Genres ({works.length})
          </button>
          {genres.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGenreFilter(g)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                genreFilter === g
                  ? "bg-[#1a1816] text-white"
                  : "bg-white border border-stone-200 text-stone-600 hover:border-stone-400"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter opus, key, title..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-[#9a7432]"
            />
          </div>
          <button
            type="button"
            onClick={() => setPopularOnly((v) => !v)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer shrink-0 ${
              popularOnly
                ? "bg-amber-50 border-amber-300 text-amber-900"
                : "bg-white border-stone-200 text-stone-600 hover:border-stone-400"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Essential
          </button>
        </div>
      </div>

      {/* Works List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-sm text-stone-500">
          No works match your current filter.
        </div>
      ) : (
        <div className="divide-y divide-stone-200/70 bg-white rounded-2xl border border-stone-200/90 overflow-hidden shadow-xs">
          {filtered.map((work) => (
            <div
              key={work.id}
              id={`work-${work.id}`}
              className="p-4 sm:p-5 hover:bg-[#faf8f4]/70 transition-colors scroll-mt-24"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {work.catalog_display && (
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-stone-100 text-stone-800 border border-stone-200">
                        {work.catalog_display}
                      </span>
                    )}
                    <h3 className="font-serif text-base sm:text-lg font-semibold text-stone-900">
                      {work.title}
                    </h3>
                    {work.is_popular && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200/80">
                        <Sparkles className="w-2.5 h-2.5" />
                        Essential
                      </span>
                    )}
                  </div>

                  {work.nickname && (
                    <p className="text-xs font-medium text-[#9a7432]">
                      &ldquo;{work.nickname}&rdquo;
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 text-xs text-stone-500">
                  <span className="px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 font-medium">
                    {work.genre}
                  </span>
                  {work.year_composed && (
                    <span className="font-mono text-stone-600">
                      {work.year_composed}
                    </span>
                  )}
                </div>
              </div>

              {work.description && (
                <p className="mt-2.5 text-sm text-stone-600 leading-relaxed">
                  {work.description}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-stone-500">
                {work.key_signature && (
                  <span className="inline-flex items-center gap-1">
                    <Music className="w-3.5 h-3.5 text-stone-400" />
                    Key: <strong className="text-stone-700 font-medium">{work.key_signature}</strong>
                  </span>
                )}
                {work.instrumentation && (
                  <span>
                    Scoring: <strong className="text-stone-700 font-medium">{work.instrumentation}</strong>
                  </span>
                )}
                {work.movements_count && (
                  <span className="inline-flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-stone-400" />
                    {work.movements_count}{" "}
                    {work.movements_count === 1 ? "movement" : "movements"}
                  </span>
                )}
                {work.duration_minutes && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-stone-400" />
                    ~{work.duration_minutes} min
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
