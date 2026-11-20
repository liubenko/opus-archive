"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Composer, Work } from "@/types/database";
import { ERA_ORDER, formatLifespan, getEraStyle } from "@/lib/constants";

interface AnalyticsDashboardProps {
  composers: Composer[];
  works: Work[];
}

export function AnalyticsDashboard({
  composers,
  works,
}: AnalyticsDashboardProps) {
  const timeline = useMemo(() => {
    const sorted = [...composers].sort((a, b) => a.birth_year - b.birth_year);
    const minYear = 1670;
    const maxYear = 1980;
    const span = maxYear - minYear;
    return { sorted, minYear, maxYear, span };
  }, [composers]);

  const genreStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of works) {
      counts.set(w.genre, (counts.get(w.genre) ?? 0) + 1);
    }
    const list = Array.from(counts.entries())
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count);
    const max = list[0]?.count ?? 1;
    return { list, max };
  }, [works]);

  const eraStats = useMemo(() => {
    const composerById = new Map(composers.map((c) => [c.id, c]));
    const counts = new Map<string, { composers: number; works: number }>();
    for (const era of ERA_ORDER) {
      counts.set(era, { composers: 0, works: 0 });
    }
    for (const c of composers) {
      const entry = counts.get(c.era) ?? { composers: 0, works: 0 };
      entry.composers += 1;
      counts.set(c.era, entry);
    }
    for (const w of works) {
      const era = composerById.get(w.composer_id)?.era;
      if (era) {
        const entry = counts.get(era) ?? { composers: 0, works: 0 };
        entry.works += 1;
        counts.set(era, entry);
      }
    }
    return ERA_ORDER.map((era) => ({
      era,
      ...(counts.get(era) ?? { composers: 0, works: 0 }),
    })).filter((e) => e.composers > 0);
  }, [composers, works]);

  const ticks = [1700, 1750, 1800, 1850, 1900, 1950];

  return (
    <div className="space-y-8">
      {/* Lifespan Overlap Timeline */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-5">
          <div>
            <h2 className="font-serif text-xl font-semibold text-stone-900">
              Composer Lifespan Timeline (1678–1971)
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              See which composers lived as contemporaries across three centuries
            </p>
          </div>
          <span className="text-xs font-mono text-stone-400">
            Click any bar to open composer
          </span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            {/* Year header */}
            <div className="grid grid-cols-[190px_1fr] items-center pb-2 border-b border-stone-200 text-[11px] font-mono text-stone-400">
              <span>Composer</span>
              <div className="relative h-5">
                {ticks.map((year) => {
                  const pct =
                    ((year - timeline.minYear) / timeline.span) * 100;
                  return (
                    <span
                      key={year}
                      style={{ left: `${pct}%` }}
                      className="absolute -translate-x-1/2"
                    >
                      {year}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-stone-100">
              {timeline.sorted.map((composer) => {
                const startPct =
                  ((composer.birth_year - timeline.minYear) / timeline.span) *
                  100;
                const endYear = composer.death_year ?? 2026;
                const widthPct = Math.max(
                  1.5,
                  ((endYear - composer.birth_year) / timeline.span) * 100
                );
                const eraStyle = getEraStyle(composer.era);
                const age = composer.death_year
                  ? composer.death_year - composer.birth_year
                  : null;

                return (
                  <Link
                    key={composer.id}
                    href={`/composers/${composer.slug}`}
                    className="grid grid-cols-[190px_1fr] items-center py-2 hover:bg-[#faf8f4] transition-colors group"
                  >
                    <div className="pr-3 truncate">
                      <span className="text-xs font-medium text-stone-800 group-hover:text-[#9a7432] transition-colors">
                        {composer.name}
                      </span>
                    </div>
                    <div className="relative h-6 flex items-center">
                      {/* Gridlines */}
                      {ticks.map((year) => {
                        const pct =
                          ((year - timeline.minYear) / timeline.span) * 100;
                        return (
                          <span
                            key={year}
                            style={{ left: `${pct}%` }}
                            className="absolute top-0 bottom-0 w-px bg-stone-100"
                          />
                        );
                      })}

                      {/* Lifespan bar */}
                      <div
                        style={{
                          left: `${startPct}%`,
                          width: `${widthPct}%`,
                          backgroundColor: eraStyle.hex,
                        }}
                        className="absolute h-4 rounded-full opacity-85 group-hover:opacity-100 transition-opacity flex items-center justify-end pr-2 shadow-2xs"
                        title={`${composer.name} (${formatLifespan(
                          composer.birth_year,
                          composer.death_year
                        )}${age ? `, age ${age}` : ""})`}
                      >
                        <span className="text-[10px] font-mono text-white/95 truncate hidden sm:inline">
                          {formatLifespan(
                            composer.birth_year,
                            composer.death_year
                          )}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Distribution Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Works by Genre */}
        <div className="bg-white rounded-2xl border border-stone-200/90 p-5 sm:p-6 shadow-xs">
          <h3 className="font-serif text-lg font-semibold text-stone-900">
            Cataloged Works by Genre
          </h3>
          <p className="text-xs text-stone-500 mt-0.5 mb-4">
            Distribution across {works.length} works in the database
          </p>
          <div className="space-y-3">
            {genreStats.list.map(({ genre, count }) => {
              const width = (count / genreStats.max) * 100;
              return (
                <div key={genre} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-stone-800">{genre}</span>
                    <span className="font-mono text-stone-500">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#9a7432]"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Composers & Works by Era */}
        <div className="bg-white rounded-2xl border border-stone-200/90 p-5 sm:p-6 shadow-xs">
          <h3 className="font-serif text-lg font-semibold text-stone-900">
            Coverage by Historical Era
          </h3>
          <p className="text-xs text-stone-500 mt-0.5 mb-4">
            Composers and works represented per musical period
          </p>
          <div className="space-y-3">
            {eraStats.map(({ era, composers: cCount, works: wCount }) => {
              const eraStyle = getEraStyle(era);
              const pct = Math.round((wCount / Math.max(1, works.length)) * 100);
              return (
                <div
                  key={era}
                  className="p-3 rounded-xl bg-[#faf8f4] border border-stone-200/70"
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="inline-flex items-center gap-2 font-semibold text-stone-900">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: eraStyle.hex }}
                      />
                      {era}
                    </span>
                    <span className="text-stone-500">
                      <strong className="text-stone-800">{cCount}</strong>{" "}
                      {cCount === 1 ? "composer" : "composers"} ·{" "}
                      <strong className="text-stone-800">{wCount}</strong> works
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-stone-200/80 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: eraStyle.hex,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
