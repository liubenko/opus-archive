"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Sparkles,
  Clock,
  X,
  FileMusic,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Wand2,
  Shuffle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { WorkWithComposer } from "@/types/database";
import { ERA_ORDER, getEraStyle } from "@/lib/constants";
import { SelectMenu } from "./SelectMenu";
import { openSuggestCatalogModal } from "./SuggestCatalogModal";

const GENRE_OPTIONS = [
  "Symphony",
  "Concerto",
  "Piano Solo",
  "Chamber",
  "Opera",
  "Choral & Vocal",
  "Orchestral",
  "Ballet",
  "Solo Instrumental",
  "Sacred",
  "Stage & Incidental",
];

const CATALOG_OPTIONS = [
  "Op.",
  "BWV",
  "K.",
  "Hob.",
  "RV",
  "D.",
  "S.",
  "WWV",
  "WoO",
  "HWV",
  "L.",
  "M.",
  "Sz.",
  "TWV",
];

const INSTRUMENT_PRESETS = [
  { label: "All Instruments", value: "All" },
  { label: "Cello", value: "cello" },
  { label: "Violin", value: "violin" },
  { label: "Piano", value: "piano" },
  { label: "String Quartet", value: "string quartet" },
  { label: "Orchestra", value: "orchestra" },
  { label: "Voice / Choir", value: "voice" },
];

const DURATION_PRESETS = [
  { label: "Any Duration", value: "All" },
  { label: "Short (< 10 min)", value: "short" },
  { label: "Recital (10–25 min)", value: "recital" },
  { label: "Major Work (25–45 min)", value: "major" },
  { label: "Epic (45+ min)", value: "epic" },
];

const KEY_OPTIONS = [
  "C major",
  "G major",
  "D major",
  "A major",
  "E major",
  "F major",
  "B-flat major",
  "E-flat major",
  "A minor",
  "E minor",
  "D minor",
  "G minor",
  "C minor",
  "F minor",
  "C-sharp minor",
  "B minor",
  "F-sharp minor",
];

const PERIOD_PRESETS = [
  { label: "Any Period", value: "All" },
  { label: "Before 1750", value: "pre1750" },
  { label: "1750–1799", value: "1750_1799" },
  { label: "1800–1849", value: "1800_1849" },
  { label: "1850–1899", value: "1850_1899" },
  { label: "1900–1949", value: "1900_1949" },
  { label: "1950+", value: "1950plus" },
];

interface WorksDirectoryProps {
  initialWorks: WorkWithComposer[];
  initialTotal: number;
  pageSize?: number;
}

export function WorksDirectory({
  initialWorks,
  initialTotal,
  pageSize = 50,
}: WorksDirectoryProps) {
  const router = useRouter();
  const [works, setWorks] = useState<WorkWithComposer[]>(initialWorks);
  const [total, setTotal] = useState<number>(initialTotal);
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [eraFilter, setEraFilter] = useState("All");
  const [genreFilter, setGenreFilter] = useState("All");
  const [catalogFilter, setCatalogFilter] = useState("All");
  const [instrumentFilter, setInstrumentFilter] = useState("All");
  const [durationFilter, setDurationFilter] = useState("All");
  const [keyFilter, setKeyFilter] = useState("All");
  const [periodFilter, setPeriodFilter] = useState("All");
  const [popularOnly, setPopularOnly] = useState(false);
  const [imslpOnly, setImslpOnly] = useState(false);
  const [page, setPage] = useState(1);

  const isFirstRender = useRef(true);

  const hasActiveFilters =
    query.trim() !== "" ||
    eraFilter !== "All" ||
    genreFilter !== "All" ||
    catalogFilter !== "All" ||
    instrumentFilter !== "All" ||
    durationFilter !== "All" ||
    keyFilter !== "All" ||
    periodFilter !== "All" ||
    popularOnly ||
    imslpOnly;

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [
    query,
    eraFilter,
    genreFilter,
    catalogFilter,
    instrumentFilter,
    durationFilter,
    keyFilter,
    periodFilter,
    popularOnly,
    imslpOnly,
  ]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        let composerIds: number[] | null = null;
        if (eraFilter !== "All") {
          const { data: eraComposers } = await supabase
            .from("composers")
            .select("id")
            .eq("era", eraFilter);
          composerIds = (eraComposers ?? []).map((c) => c.id);
          if (composerIds.length === 0) {
            if (!cancelled) {
              setWorks([]);
              setTotal(0);
              setLoading(false);
            }
            return;
          }
        }

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let req = supabase
          .from("works")
          .select("*, composers(id, name, slug, era, nationality, avatar_url)", {
            count: "exact",
          });

        if (composerIds) req = req.in("composer_id", composerIds);
        if (genreFilter !== "All") req = req.eq("genre", genreFilter);
        if (catalogFilter !== "All")
          req = req.eq("catalog_system", catalogFilter);
        if (instrumentFilter !== "All") {
          req = req.or(
            `instrumentation.ilike.%${instrumentFilter}%,title.ilike.%${instrumentFilter}%`
          );
        }
        if (durationFilter === "short") {
          req = req.gt("duration_minutes", 0).lt("duration_minutes", 10);
        } else if (durationFilter === "recital") {
          req = req.gte("duration_minutes", 10).lte("duration_minutes", 25);
        } else if (durationFilter === "major") {
          req = req.gt("duration_minutes", 25).lte("duration_minutes", 45);
        } else if (durationFilter === "epic") {
          req = req.gt("duration_minutes", 45);
        }
        if (keyFilter !== "All") {
          req = req.ilike("key_signature", `%${keyFilter}%`);
        }
        if (periodFilter === "pre1750") {
          req = req.lt("year_composed", 1750);
        } else if (periodFilter === "1750_1799") {
          req = req.gte("year_composed", 1750).lte("year_composed", 1799);
        } else if (periodFilter === "1800_1849") {
          req = req.gte("year_composed", 1800).lte("year_composed", 1849);
        } else if (periodFilter === "1850_1899") {
          req = req.gte("year_composed", 1850).lte("year_composed", 1899);
        } else if (periodFilter === "1900_1949") {
          req = req.gte("year_composed", 1900).lte("year_composed", 1949);
        } else if (periodFilter === "1950plus") {
          req = req.gte("year_composed", 1950);
        }
        if (popularOnly) req = req.eq("is_popular", true);
        if (imslpOnly) req = req.not("imslp_url", "is", null);

        const q = query.trim();
        if (q) {
          req = req.or(
            `title.ilike.%${q}%,nickname.ilike.%${q}%,catalog_display.ilike.%${q}%,instrumentation.ilike.%${q}%,key_signature.ilike.%${q}%`
          );
        }

        const { data, count } = await req
          .order("is_popular", { ascending: false })
          .order("year_composed", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);

        if (!cancelled) {
          setWorks((data ?? []) as WorkWithComposer[]);
          setTotal(count ?? 0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    query,
    eraFilter,
    genreFilter,
    catalogFilter,
    instrumentFilter,
    durationFilter,
    keyFilter,
    periodFilter,
    popularOnly,
    imslpOnly,
    page,
    pageSize,
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  function handleSurpriseMe() {
    if (works.length === 0) return;
    const pick = works[Math.floor(Math.random() * works.length)];
    if (pick) {
      router.push(`/works/${pick.slug || pick.id}`);
    }
  }

  return (
    <div className="space-y-5">
      {/* Smart Repertoire Finder Banner */}
      <div className="bg-gradient-to-r from-[#f8f3e8] via-white to-[#f6efe0] dark:from-[#1f1b16] dark:via-[#191714] dark:to-[#211c15] rounded-2xl border border-amber-200/70 dark:border-amber-900/50 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-stone-700 dark:text-stone-200">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#8a6526] dark:text-[#d4af6a]">
            <Wand2 className="w-4 h-4" />
            Smart Repertoire Finder:
          </span>
          <span>Find me a</span>
          <SelectMenu
            variant="inline"
            value={durationFilter}
            onChange={setDurationFilter}
            ariaLabel="Smart finder duration"
            options={DURATION_PRESETS.map((d) => ({
              value: d.value,
              label: d.value === "All" ? "any-length" : d.label.toLowerCase(),
            }))}
          />
          <SelectMenu
            variant="inline"
            value={eraFilter}
            onChange={setEraFilter}
            ariaLabel="Smart finder era"
            options={[
              { value: "All", label: "any-era" },
              ...ERA_ORDER.map((e) => ({ value: e, label: e })),
            ]}
          />
          <span>piece for</span>
          <SelectMenu
            variant="inline"
            value={instrumentFilter}
            onChange={setInstrumentFilter}
            ariaLabel="Smart finder instrument"
            options={INSTRUMENT_PRESETS.map((i) => ({
              value: i.value,
              label: i.value === "All" ? "any instrument" : i.label,
            }))}
          />
        </div>

        <button
          type="button"
          disabled={works.length === 0}
          onClick={handleSurpriseMe}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shrink-0 disabled:opacity-40"
        >
          <Shuffle className="w-3.5 h-3.5" />
          Surprise Me from {total.toLocaleString()}
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all 23,500+ works by title, nickname, opus (BWV, Op., K.), key, or scoring..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-[#141210] focus:border-[#9a7432] dark:focus:border-[#d4af6a]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SelectMenu
              value={eraFilter}
              onChange={setEraFilter}
              ariaLabel="Filter by era"
              options={[
                { value: "All", label: "All Eras" },
                ...ERA_ORDER.map((e) => ({ value: e, label: e })),
              ]}
            />

            <SelectMenu
              value={genreFilter}
              onChange={setGenreFilter}
              ariaLabel="Filter by genre"
              options={[
                { value: "All", label: "All Genres" },
                ...GENRE_OPTIONS.map((g) => ({ value: g, label: g })),
              ]}
            />

            <SelectMenu
              value={catalogFilter}
              onChange={setCatalogFilter}
              ariaLabel="Filter by catalog system"
              options={[
                { value: "All", label: "All Catalogs" },
                ...CATALOG_OPTIONS.map((c) => ({ value: c, label: c })),
              ]}
            />

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
              Essential
            </button>

            <button
              type="button"
              onClick={() => setImslpOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                imslpOnly
                  ? "bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200"
                  : "bg-[#faf8f4] dark:bg-[#141210] border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-200 hover:border-stone-400 dark:hover:border-stone-600"
              }`}
            >
              <FileMusic className="w-3.5 h-3.5" />
              Has IMSLP
            </button>
          </div>
        </div>

        {/* Instrument quick chips + Duration / Key / Period discovery row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {INSTRUMENT_PRESETS.map((inst) => (
              <button
                key={inst.value}
                type="button"
                onClick={() => setInstrumentFilter(inst.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  instrumentFilter === inst.value
                    ? "bg-[#1a1816] dark:bg-[#f3efe6] text-white dark:text-[#11100e]"
                    : "bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:border-stone-400 dark:hover:border-stone-600"
                }`}
              >
                {inst.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SelectMenu
              value={durationFilter}
              onChange={setDurationFilter}
              ariaLabel="Filter by duration"
              options={DURATION_PRESETS}
            />

            <SelectMenu
              value={keyFilter}
              onChange={setKeyFilter}
              ariaLabel="Filter by key signature"
              options={[
                { value: "All", label: "Any Key" },
                ...KEY_OPTIONS.map((k) => ({ value: k, label: k })),
              ]}
            />

            <SelectMenu
              value={periodFilter}
              onChange={setPeriodFilter}
              ariaLabel="Filter by composition period"
              align="right"
              options={PERIOD_PRESETS}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 pt-1">
          <span className="inline-flex items-center gap-2">
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Showing{" "}
            <strong className="text-stone-900 dark:text-stone-100">
              {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}
            </strong>{" "}
            of{" "}
            <strong className="text-stone-900 dark:text-stone-100">
              {total.toLocaleString()}
            </strong>{" "}
            matching works
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setEraFilter("All");
                setGenreFilter("All");
                setCatalogFilter("All");
                setInstrumentFilter("All");
                setDurationFilter("All");
                setKeyFilter("All");
                setPeriodFilter("All");
                setPopularOnly(false);
                setImslpOnly(false);
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
              {works.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 px-4 text-center text-stone-500 dark:text-stone-400"
                  >
                    {loading ? (
                      "Searching catalog..."
                    ) : (
                      <div className="space-y-3">
                        <p>
                          No works match{" "}
                          {query.trim() ? `"${query}"` : "your current filters"}.
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            openSuggestCatalogModal({
                              mode: "work",
                              query,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Propose Missing Work from Open Libraries
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                works.map((work) => {
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
                          href={`/works/${work.slug || work.id}`}
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
                        {work.imslp_url && (
                          <a
                            href={work.imslp_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-[#9a7432] dark:text-[#d4af6a] hover:underline"
                          >
                            <FileMusic className="w-3 h-3" />
                            IMSLP Score
                            <ExternalLink className="w-2.5 h-2.5 opacity-75" />
                          </a>
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

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-stone-200 dark:border-stone-800 bg-[#faf8f4]/60 dark:bg-[#141210] text-xs">
            <span className="text-stone-500 dark:text-stone-400">
              Page{" "}
              <strong className="text-stone-900 dark:text-stone-100">
                {page}
              </strong>{" "}
              of{" "}
              <strong className="text-stone-900 dark:text-stone-100">
                {totalPages.toLocaleString()}
              </strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#191714] text-stone-700 dark:text-stone-200 disabled:opacity-40 hover:border-stone-400 dark:hover:border-stone-500 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#191714] text-stone-700 dark:text-stone-200 disabled:opacity-40 hover:border-stone-400 dark:hover:border-stone-500 cursor-pointer disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
