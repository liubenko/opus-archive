"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Activity, Calendar } from "lucide-react";
import type { ComposerWithWorkCount } from "@/types/database";
import { ERA_ORDER, formatLifespan, getEraStyle } from "@/lib/constants";
import { ComposerAvatar } from "./ComposerAvatar";
import { SelectMenu } from "./SelectMenu";

export interface GenreAggregate {
  genre: string;
  count: number;
}

export interface QuarterCenturyBucket {
  bucket: number;
  count: number;
}

interface AnalyticsDashboardProps {
  composers: ComposerWithWorkCount[];
  totalWorks: number;
  genreCounts: GenreAggregate[];
  quarterCenturyCounts: QuarterCenturyBucket[];
}

export function AnalyticsDashboard({
  composers,
  totalWorks,
  genreCounts,
  quarterCenturyCounts,
}: AnalyticsDashboardProps) {
  const [eraFilter, setEraFilter] = useState<string>("All");
  const [search, setSearch] = useState<string>("");
  const [probeYear, setProbeYear] = useState<number>(1830);

  const timeline = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = composers.filter((c) => {
      if (eraFilter !== "All" && c.era !== eraFilter) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => a.birth_year - b.birth_year);
    const minBirth = sorted[0]?.birth_year ?? 1600;
    const minYear = Math.floor(minBirth / 50) * 50;
    const maxYear = 2025;
    const span = Math.max(100, maxYear - minYear);
    const ticks: number[] = [];
    const step = span > 500 ? 100 : 50;
    for (let y = minYear + step; y < maxYear; y += step) {
      ticks.push(y);
    }
    return { sorted, minYear, maxYear, span, ticks };
  }, [composers, eraFilter, search]);

  const aliveInProbeYear = useMemo(() => {
    return composers.filter(
      (c) => c.birth_year <= probeYear && (c.death_year ?? 2026) >= probeYear
    );
  }, [composers, probeYear]);

  const maxGenre = genreCounts[0]?.count ?? 1;
  const maxBucket = Math.max(
    1,
    ...quarterCenturyCounts.map((b) => b.count)
  );

  const eraStats = useMemo(() => {
    return ERA_ORDER.map((era) => {
      const list = composers.filter((c) => c.era === era);
      const worksSum = list.reduce(
        (acc, c) => acc + (c.works?.[0]?.count ?? 0),
        0
      );
      return { era, composers: list.length, works: worksSum };
    }).filter((e) => e.composers > 0);
  }, [composers]);

  const probePct = Math.max(
    0,
    Math.min(100, ((probeYear - timeline.minYear) / timeline.span) * 100)
  );

  return (
    <div className="space-y-8">
      {/* Interactive Year-Crosshair Lifespan Timeline */}
      <div className="bg-white dark:bg-[#191714] rounded-3xl border border-stone-200/90 dark:border-stone-800/90 p-5 sm:p-7 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#9a7432] dark:text-[#d4af6a]" />
              Interactive Lifespan &amp; Historical Crosshair
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Slide the year probe to discover which composers lived and worked
              simultaneously
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter timeline..."
                className="pl-8 pr-3 py-2 text-xs rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 w-40"
              />
            </div>
            <SelectMenu
              value={eraFilter}
              onChange={setEraFilter}
              ariaLabel="Filter timeline by era"
              align="right"
              options={[
                { value: "All", label: "All Eras" },
                ...ERA_ORDER.map((e) => ({ value: e, label: e })),
              ]}
            />
          </div>
        </div>

        {/* Year Crosshair Scrubber + Active Snapshot */}
        <div className="p-4 rounded-2xl bg-[#faf8f4] dark:bg-[#13110e] border border-stone-200/80 dark:border-stone-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg font-bold text-[#9a7432] dark:text-[#d4af6a]">
                Year {probeYear}
              </span>
              <span className="text-xs text-stone-500 dark:text-stone-400">
                <strong>{aliveInProbeYear.length}</strong> composers alive in
                the archive
              </span>
            </div>

            <input
              type="range"
              min={1600}
              max={2020}
              value={probeYear}
              onChange={(e) => setProbeYear(Number(e.target.value))}
              aria-label="Timeline year crosshair"
              className="w-full sm:w-64 accent-[#d4af6a] cursor-pointer"
            />
          </div>

          {aliveInProbeYear.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {aliveInProbeYear.slice(0, 12).map((c) => {
                const age = probeYear - c.birth_year;
                return (
                  <Link
                    key={c.id}
                    href={`/composers/${c.slug}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-[#1d1a16] border border-stone-200 dark:border-stone-800 hover:border-[#d4af6a] text-[11px] text-stone-700 dark:text-stone-200 transition-colors"
                  >
                    <ComposerAvatar
                      name={c.name}
                      avatarUrl={c.avatar_url}
                      era={c.era}
                      size="sm"
                    />
                    <span className="font-medium">
                      {c.sort_name.split(",")[0]}
                    </span>
                    <span className="font-mono text-[10px] text-stone-400">
                      ({age}y)
                    </span>
                  </Link>
                );
              })}
              {aliveInProbeYear.length > 12 && (
                <span className="text-[11px] text-stone-400 px-2">
                  +{aliveInProbeYear.length - 12} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Scrollable Gantt Chart with Live Vertical Crosshair Line */}
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto rounded-xl border border-stone-100 dark:border-stone-800/80">
          <div className="min-w-[680px]">
            <div className="sticky top-0 z-10 bg-white dark:bg-[#191714] grid grid-cols-[200px_1fr] items-center px-3 py-2 border-b border-stone-200 dark:border-stone-800 text-[11px] font-mono text-stone-400">
              <span>Composer ({timeline.sorted.length})</span>
              <div className="relative h-5">
                {timeline.ticks.map((year) => {
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

            <div className="divide-y divide-stone-100 dark:divide-stone-800/60">
              {timeline.sorted.map((composer) => {
                const startPct = Math.max(
                  0,
                  ((composer.birth_year - timeline.minYear) / timeline.span) *
                    100
                );
                const endYear = composer.death_year ?? 2025;
                const widthPct = Math.max(
                  1.2,
                  ((endYear - composer.birth_year) / timeline.span) * 100
                );
                const eraStyle = getEraStyle(composer.era);
                const isAliveAtProbe =
                  composer.birth_year <= probeYear && endYear >= probeYear;

                return (
                  <Link
                    key={composer.id}
                    href={`/composers/${composer.slug}`}
                    className={`grid grid-cols-[200px_1fr] items-center px-3 py-1.5 transition-colors group ${
                      isAliveAtProbe
                        ? "bg-amber-50/40 dark:bg-amber-950/20"
                        : "hover:bg-[#faf8f4] dark:hover:bg-[#221f1b]"
                    }`}
                  >
                    <div className="pr-3 flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: eraStyle.hex }}
                      />
                      <span className="text-xs font-medium text-stone-800 dark:text-stone-200 group-hover:text-[#9a7432] dark:group-hover:text-[#d4af6a] truncate">
                        {composer.name}
                      </span>
                    </div>

                    <div className="relative h-5 flex items-center">
                      {/* Crosshair vertical line */}
                      <span
                        style={{ left: `${probePct}%` }}
                        className="absolute top-0 bottom-0 w-px bg-[#d4af6a]/60 z-10 pointer-events-none"
                      />

                      <div
                        style={{
                          left: `${startPct}%`,
                          width: `${widthPct}%`,
                          backgroundColor: eraStyle.hex,
                        }}
                        className={`absolute h-3.5 rounded-full transition-opacity flex items-center justify-end pr-2 ${
                          isAliveAtProbe
                            ? "opacity-100 ring-1 ring-white/50"
                            : "opacity-65 group-hover:opacity-100"
                        }`}
                      >
                        <span className="text-[9.5px] font-mono text-white/95 truncate hidden sm:inline">
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

      {/* Historical Composition Velocity + Genre / Era Breakdown */}
      {quarterCenturyCounts.length > 0 && (
        <div className="bg-[#12100e] rounded-3xl border border-stone-800 p-6 sm:p-7 text-[#f3efe6] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-serif text-xl font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#d4af6a]" />
                Composition Velocity Across Centuries
              </h3>
              <p className="text-xs text-stone-400 mt-0.5">
                Dated works composed per 25-year period across classical music
                history
              </p>
            </div>
            <span className="font-mono text-xs text-[#d4af6a]">
              1500 — 2025
            </span>
          </div>

          <div className="h-40 flex items-end gap-1.5 pt-4 overflow-x-auto">
            {quarterCenturyCounts.map((b) => {
              const pct = Math.max(6, Math.round((b.count / maxBucket) * 100));
              return (
                <div
                  key={b.bucket}
                  className="flex-1 min-w-[34px] h-full flex flex-col items-center justify-end gap-1.5 group"
                >
                  <span className="font-mono text-[10px] text-stone-400 group-hover:text-[#e3c27d]">
                    {b.count}
                  </span>
                  <div className="w-full bg-white/5 rounded-t-lg h-24 flex items-end overflow-hidden">
                    <div
                      className="w-full bg-gradient-to-t from-[#8a6526] to-[#e3c27d] rounded-t-lg group-hover:brightness-110 transition-all"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-[9.5px] text-stone-500">
                    {b.bucket}s
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Genre & Era Cards across all 19,804 works */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#191714] rounded-3xl border border-stone-200/90 dark:border-stone-800/90 p-6 shadow-xs">
          <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6]">
            Master Catalog by Genre
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 mb-4">
            Exact distribution across all {totalWorks.toLocaleString()} works
          </p>
          <div className="space-y-3">
            {genreCounts.map(({ genre, count }) => {
              const width = (count / maxGenre) * 100;
              return (
                <div key={genre} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-stone-800 dark:text-stone-200">
                      {genre}
                    </span>
                    <span className="font-mono text-stone-500 dark:text-stone-400">
                      {count.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#9a7432] dark:bg-[#d4af6a]"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-[#191714] rounded-3xl border border-stone-200/90 dark:border-stone-800/90 p-6 shadow-xs">
          <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6]">
            Coverage by Historical Era
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 mb-4">
            Composers and total cataloged works per period
          </p>
          <div className="space-y-2.5">
            {eraStats.map(({ era, composers: cCount, works: wCount }) => {
              const eraStyle = getEraStyle(era);
              const pct = Math.max(
                2,
                Math.round((wCount / Math.max(1, totalWorks)) * 100)
              );
              return (
                <div
                  key={era}
                  className="p-3 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800"
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="inline-flex items-center gap-2 font-semibold text-stone-900 dark:text-stone-100">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: eraStyle.hex }}
                      />
                      {era}
                    </span>
                    <span className="text-stone-500 dark:text-stone-400 font-mono text-[11px]">
                      <strong className="text-stone-800 dark:text-stone-200">
                        {cCount}
                      </strong>{" "}
                      comp ·{" "}
                      <strong className="text-stone-800 dark:text-stone-200">
                        {wCount.toLocaleString()}
                      </strong>{" "}
                      works
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-stone-200/80 dark:bg-stone-800 overflow-hidden">
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
