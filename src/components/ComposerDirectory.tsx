"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Filter, Music, Globe, Search, FileMusic } from "lucide-react";
import type { ComposerWithWorkCount } from "@/types/database";
import { ERA_ORDER, formatLifespan, getEraStyle } from "@/lib/constants";
import { ComposerAvatar } from "./ComposerAvatar";
import { SelectMenu } from "./SelectMenu";

interface ComposerDirectoryProps {
  composers: ComposerWithWorkCount[];
}

type SortOption = "rank" | "chronological" | "alphabetical" | "most_works";

export function ComposerDirectory({ composers }: ComposerDirectoryProps) {
  const [selectedEra, setSelectedEra] = useState<string>("All");
  const [selectedNationality, setSelectedNationality] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortOption>("chronological");

  const availableEras = useMemo(() => {
    const present = new Set(composers.map((c) => c.era));
    return ERA_ORDER.filter((e) => present.has(e));
  }, [composers]);

  const availableNationalities = useMemo(() => {
    return Array.from(new Set(composers.map((c) => c.nationality))).sort();
  }, [composers]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = composers.filter((c) => {
      if (selectedEra !== "All" && c.era !== selectedEra) return false;
      if (
        selectedNationality !== "All" &&
        c.nationality !== selectedNationality
      ) {
        return false;
      }
      if (q) {
        const hay = `${c.name} ${c.full_name} ${c.nationality} ${c.era}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === "chronological") {
        return a.birth_year - b.birth_year;
      }
      if (sortBy === "alphabetical") {
        return a.sort_name.localeCompare(b.sort_name);
      }
      if (sortBy === "most_works") {
        return (b.works?.[0]?.count ?? 0) - (a.works?.[0]?.count ?? 0);
      }
      return (a.rank_order ?? 999) - (b.rank_order ?? 999);
    });
  }, [composers, selectedEra, selectedNationality, searchQuery, sortBy]);

  return (
    <section className="space-y-6">
      {/* Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-stone-200/80 dark:border-stone-800/80">
        {/* Era Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedEra("All")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              selectedEra === "All"
                ? "bg-[#1a1816] dark:bg-[#f3efe6] text-white dark:text-[#11100e]"
                : "bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:border-stone-400 dark:hover:border-stone-600"
            }`}
          >
            All Eras ({composers.length})
          </button>
          {availableEras.map((era) => {
            const count = composers.filter((c) => c.era === era).length;
            const style = getEraStyle(era);
            const active = selectedEra === era;
            return (
              <button
                key={era}
                type="button"
                onClick={() => setSelectedEra(era)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                  active
                    ? `${style.bg} ${style.border} ${style.text} ring-1 ring-inset ring-current/25`
                    : "bg-white dark:bg-[#191714] border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:border-stone-400 dark:hover:border-stone-600"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${style.color}`} />
                {era}
                <span className="opacity-65">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Search + Nationality + Sort */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter composers..."
              className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-800 rounded-lg text-stone-800 dark:text-stone-200 focus:outline-none focus:border-[#9a7432] dark:focus:border-[#d4af6a] w-40 sm:w-44"
            />
          </div>

          <SelectMenu
            value={selectedNationality}
            onChange={setSelectedNationality}
            ariaLabel="Filter by nationality"
            icon={<Globe className="w-3.5 h-3.5" />}
            options={[
              { value: "All", label: "All Nationalities" },
              ...availableNationalities.map((nat) => ({
                value: nat,
                label: nat,
              })),
            ]}
          />

          <SelectMenu
            value={sortBy}
            onChange={(v) => setSortBy(v as SortOption)}
            ariaLabel="Sort composers"
            align="right"
            icon={<Filter className="w-3.5 h-3.5" />}
            options={[
              { value: "chronological", label: "Chronological (Birth Year)" },
              { value: "rank", label: "Curated Order" },
              { value: "alphabetical", label: "Alphabetical (Last Name)" },
              { value: "most_works", label: "Most Works" },
            ]}
          />
        </div>
      </div>

      {/* Composer Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-12 text-center">
          <p className="text-stone-600 dark:text-stone-400 text-sm">
            No composers match your selected filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedEra("All");
              setSelectedNationality("All");
            }}
            className="mt-3 text-xs font-medium text-[#9a7432] dark:text-[#d4af6a] hover:underline cursor-pointer"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((composer) => {
            const eraStyle = getEraStyle(composer.era);
            const workCount = composer.works?.[0]?.count ?? 0;

            return (
              <Link
                key={composer.id}
                href={`/composers/${composer.slug}`}
                className="group bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-5 hover:border-[#9a7432]/60 dark:hover:border-[#d4af6a]/60 hover:shadow-md dark:hover:shadow-black/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start gap-3.5">
                    <ComposerAvatar
                      name={composer.name}
                      avatarUrl={composer.avatar_url}
                      era={composer.era}
                      size="lg"
                      className="group-hover:scale-[1.03] transition-transform"
                    />
                    <div className="min-w-0 flex-1 pt-0.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${eraStyle.bg} ${eraStyle.border} ${eraStyle.text}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${eraStyle.color}`}
                        />
                        {composer.era}
                      </span>
                      <h2 className="font-serif text-lg font-semibold text-stone-900 dark:text-[#f3efe6] group-hover:text-[#9a7432] dark:group-hover:text-[#d4af6a] transition-colors leading-snug mt-1.5">
                        {composer.name}
                      </h2>
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                        {formatLifespan(composer.birth_year, composer.death_year)}{" "}
                        · {composer.nationality}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3.5 text-xs text-stone-600 dark:text-stone-400 leading-relaxed line-clamp-3">
                    {composer.short_bio}
                  </p>
                </div>

                <div className="mt-4 pt-3.5 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-stone-500 dark:text-stone-400 font-medium">
                      <Music className="w-3.5 h-3.5 text-[#9a7432] dark:text-[#d4af6a]" />
                      {workCount} {workCount === 1 ? "work" : "works"}
                    </span>
                    {composer.imslp_url && (
                      <span
                        title="IMSLP Scores Available"
                        className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-[#8a6526] dark:text-[#e3c27d]"
                      >
                        <FileMusic className="w-2.5 h-2.5" />
                        IMSLP
                      </span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 font-medium text-stone-700 dark:text-stone-300 group-hover:text-[#9a7432] dark:group-hover:text-[#d4af6a] transition-colors">
                    Explore
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
