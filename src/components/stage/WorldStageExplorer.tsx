"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  Calendar,
  Filter,
  RotateCcw,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import type { Performer, Venue } from "@/types/database";
import { SelectMenu } from "@/components/SelectMenu";
import { ComposerAvatar } from "@/components/ComposerAvatar";
import {
  ConcertEventCard,
  type HydratedConcertEvent,
} from "./ConcertEventCard";
import { WorldStageMap, type MapVenueItem } from "./WorldStageMap";

interface WorldStageExplorerProps {
  venues: Venue[];
  performers: Performer[];
  events: HydratedConcertEvent[];
}

export function WorldStageExplorer({
  venues,
  performers,
  events,
}: WorldStageExplorerProps) {
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [orchestraFilter, setOrchestraFilter] = useState<string>("all");
  const [artistFilter, setArtistFilter] = useState<string>("all");
  const [instrumentTab, setInstrumentTab] = useState<
    "all" | "orchestra" | "Cello" | "Piano" | "Violin"
  >("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const orchestras = useMemo(
    () =>
      performers
        .filter((p) => p.performer_type === "orchestra")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [performers]
  );

  const soloistsAndConductors = useMemo(
    () =>
      performers
        .filter((p) => p.performer_type !== "orchestra" && p.is_featured)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [performers]
  );

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) {
      set.add(ev.starts_at.slice(0, 7));
    }
    return Array.from(set).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter((ev) => {
      if (venueFilter !== "all" && ev.venue_slug !== venueFilter) return false;
      if (
        orchestraFilter !== "all" &&
        !ev.performers.some((p) => p.slug === orchestraFilter)
      ) {
        return false;
      }
      if (
        artistFilter !== "all" &&
        !ev.performers.some((p) => p.slug === artistFilter)
      ) {
        return false;
      }
      if (instrumentTab === "orchestra") {
        if (!ev.performers.some((p) => p.billing_role === "orchestra")) {
          return false;
        }
      } else if (instrumentTab !== "all") {
        if (
          !ev.performers.some((p) =>
            (p.instrument_label || "")
              .toLowerCase()
              .includes(instrumentTab.toLowerCase())
          )
        ) {
          return false;
        }
      }
      if (monthFilter !== "all" && !ev.starts_at.startsWith(monthFilter)) {
        return false;
      }
      if (q) {
        const hay = [
          ev.title,
          ev.venue_name,
          ev.venue_city,
          ...ev.performers.map((p) => p.name),
          ...ev.works.map((w) => `${w.raw_composer_name} ${w.raw_work_title}`),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    events,
    venueFilter,
    orchestraFilter,
    artistFilter,
    instrumentTab,
    monthFilter,
    searchQuery,
  ]);

  // Compute per-venue active & total event counts for MapLibre pins
  const mapVenues: MapVenueItem[] = useMemo(() => {
    const totalMap = new Map<number, number>();
    const activeMap = new Map<number, number>();
    for (const e of events) {
      totalMap.set(e.venue_id, (totalMap.get(e.venue_id) ?? 0) + 1);
    }
    for (const e of filteredEvents) {
      activeMap.set(e.venue_id, (activeMap.get(e.venue_id) ?? 0) + 1);
    }
    return venues.map((v) => ({
      ...v,
      activeEventCount: activeMap.get(v.id) ?? 0,
      totalEventCount: totalMap.get(v.id) ?? 0,
    }));
  }, [venues, events, filteredEvents]);

  // When a specific orchestra or soloist is selected, draw their chronological tour path on the map!
  const tourRouteCoords = useMemo(() => {
    if (orchestraFilter === "all" && artistFilter === "all") return undefined;
    const coords: [number, number][] = [];
    for (const ev of filteredEvents) {
      const prev = coords[coords.length - 1];
      if (!prev || prev[0] !== ev.longitude || prev[1] !== ev.latitude) {
        coords.push([ev.longitude, ev.latitude]);
      }
    }
    return coords.length >= 2 ? coords : undefined;
  }, [orchestraFilter, artistFilter, filteredEvents]);

  const activeFilterLabel = useMemo(() => {
    const parts: string[] = [];
    if (orchestraFilter !== "all") {
      const o = performers.find((p) => p.slug === orchestraFilter);
      if (o) parts.push(o.name);
    }
    if (artistFilter !== "all") {
      const a = performers.find((p) => p.slug === artistFilter);
      if (a) parts.push(a.name);
    }
    if (venueFilter !== "all") {
      const v = venues.find((x) => x.slug === venueFilter);
      if (v) parts.push(v.short_name || v.name);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [orchestraFilter, artistFilter, venueFilter, performers, venues]);

  // Roster cards filtered by instrumentTab
  const featuredRoster = useMemo(() => {
    const featured = performers.filter((p) => p.is_featured);
    if (instrumentTab === "all") return featured;
    if (instrumentTab === "orchestra") {
      return featured.filter((p) => p.performer_type === "orchestra");
    }
    return featured.filter((p) =>
      (p.instrument_or_role || "")
        .toLowerCase()
        .includes(instrumentTab.toLowerCase())
    );
  }, [performers, instrumentTab]);

  const eventCountByPerformer = useMemo(() => {
    const m = new Map<string, number>();
    for (const ev of events) {
      for (const p of ev.performers) {
        m.set(p.slug, (m.get(p.slug) ?? 0) + 1);
      }
    }
    return m;
  }, [events]);

  function handleQuickPerformerClick(slug: string) {
    const perf = performers.find((p) => p.slug === slug);
    if (!perf) return;
    if (perf.performer_type === "orchestra") {
      setOrchestraFilter((prev) => (prev === slug ? "all" : slug));
    } else {
      setArtistFilter((prev) => (prev === slug ? "all" : slug));
    }
  }

  const hasAnyFilter =
    venueFilter !== "all" ||
    orchestraFilter !== "all" ||
    artistFilter !== "all" ||
    instrumentTab !== "all" ||
    monthFilter !== "all" ||
    Boolean(searchQuery.trim());

  function resetAllFilters() {
    setVenueFilter("all");
    setOrchestraFilter("all");
    setArtistFilter("all");
    setInstrumentTab("all");
    setMonthFilter("all");
    setSearchQuery("");
  }

  return (
    <div className="space-y-8">
      {/* 1. Interactive World Stage Map */}
      <WorldStageMap
        venues={mapVenues}
        selectedVenueSlug={venueFilter}
        onSelectVenue={setVenueFilter}
        tourRouteCoords={tourRouteCoords}
        activeFilterLabel={activeFilterLabel}
      />

      {/* 2. 4-Way Season Filter Deck */}
      <div className="bg-white dark:bg-[#191714] rounded-3xl border border-stone-200/90 dark:border-stone-800/90 p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Instrument & Ensemble Quick Tabs */}
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#f3efe8] dark:bg-[#12100e] border border-stone-200 dark:border-stone-800 self-start">
            {(
              [
                { id: "all", label: "All Stage" },
                { id: "orchestra", label: "Orchestras" },
                { id: "Cello", label: "Cello Soloists" },
                { id: "Piano", label: "Pianists" },
                { id: "Violin", label: "Violinists" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setInstrumentTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  instrumentTab === tab.id
                    ? "bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e]"
                    : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Keyword Search + Reset */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search hall, soloist, Mahler, Op. 104..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#d4af6a]"
              />
            </div>
            {hasAnyFilter && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium text-[#9a7432] dark:text-[#d4af6a] hover:border-[#d4af6a] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* 4 Dropdown Cross-Filters (Venue x Orchestra x Soloist x Month) */}
        <div className="pt-3 border-t border-stone-100 dark:border-stone-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              Concert Venue
            </span>
            <SelectMenu
              value={venueFilter}
              onChange={setVenueFilter}
              ariaLabel="Filter by concert venue"
              className="w-full"
              buttonClassName="w-full justify-between"
              options={[
                { value: "all", label: `All Venues (${venues.length})` },
                ...venues.map((v) => ({
                  value: v.slug,
                  label: `${v.short_name || v.name} — ${v.city}`,
                })),
              ]}
            />
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1">
              <Users className="w-3 h-3" />
              Orchestra / Institution
            </span>
            <SelectMenu
              value={orchestraFilter}
              onChange={setOrchestraFilter}
              ariaLabel="Filter by orchestra"
              className="w-full"
              buttonClassName="w-full justify-between"
              options={[
                {
                  value: "all",
                  label: `All Orchestras (${orchestras.length})`,
                },
                ...orchestras.map((o) => ({
                  value: o.slug,
                  label: o.name,
                })),
              ]}
            />
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Soloist / Conductor
            </span>
            <SelectMenu
              value={artistFilter}
              onChange={setArtistFilter}
              ariaLabel="Filter by soloist or conductor"
              className="w-full"
              buttonClassName="w-full justify-between"
              options={[
                {
                  value: "all",
                  label: `All Featured Artists (${soloistsAndConductors.length})`,
                },
                ...soloistsAndConductors.map((a) => ({
                  value: a.slug,
                  label: `${a.name} (${a.instrument_or_role || a.performer_type})`,
                })),
              ]}
            />
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Season Month
            </span>
            <SelectMenu
              value={monthFilter}
              onChange={setMonthFilter}
              ariaLabel="Filter by month"
              align="right"
              className="w-full"
              buttonClassName="w-full justify-between"
              options={[
                { value: "all", label: "Full 2026/27 Season" },
                ...months.map((m) => {
                  const [yr, mo] = m.split("-");
                  const d = new Date(Date.UTC(Number(yr), Number(mo) - 1, 2));
                  return {
                    value: m,
                    label: d.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    }),
                  };
                }),
              ]}
            />
          </div>
        </div>
      </div>

      {/* 3. Interactive Orchestras & Soloists Roster Strip */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6]">
              Orchestras, Soloists &amp; Conductors on Tour
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Click any artist or orchestra to isolate their map tour route &amp;
              bookings, or open their dedicated calendar
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {featuredRoster.map((p) => {
            const isActive =
              orchestraFilter === p.slug || artistFilter === p.slug;
            const cCount = eventCountByPerformer.get(p.slug) ?? 0;

            return (
              <div
                key={p.id}
                onClick={() => handleQuickPerformerClick(p.slug)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isActive
                    ? "bg-[#1a1816] dark:bg-[#262017] border-[#d4af6a] text-white shadow-sm"
                    : "bg-white dark:bg-[#191714] border-stone-200/90 dark:border-stone-800/90 hover:border-[#d4af6a]/60"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ComposerAvatar
                    name={p.name}
                    avatarUrl={p.avatar_url}
                    era={
                      p.performer_type === "orchestra"
                        ? "Classical"
                        : p.instrument_or_role === "Cello"
                          ? "Romantic"
                          : p.instrument_or_role === "Piano"
                            ? "Late Romantic"
                            : "20th Century"
                    }
                    size="md"
                  />
                  <div className="min-w-0">
                    <p
                      className={`text-xs font-bold truncate ${
                        isActive
                          ? "text-[#f3efe6]"
                          : "text-stone-900 dark:text-[#f3efe6]"
                      }`}
                    >
                      {p.name}
                    </p>
                    <p
                      className={`text-[11px] truncate ${
                        isActive
                          ? "text-[#e3c27d]"
                          : "text-stone-500 dark:text-stone-400"
                      }`}
                    >
                      {p.instrument_or_role} · {cCount} dates
                    </p>
                  </div>
                </div>

                <Link
                  href={`/stage/artists/${p.slug}`}
                  onClick={(e) => e.stopPropagation()}
                  title={`Open ${p.name}'s full season calendar`}
                  className="p-1.5 rounded-lg bg-stone-100 dark:bg-[#12100e] text-stone-600 dark:text-stone-300 hover:text-[#d4af6a] shrink-0"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Chronological Concert Calendar */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#9a7432] dark:text-[#d4af6a]" />
            <h2 className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6]">
              2026/27 Season Schedule ({filteredEvents.length})
            </h2>
          </div>
          {activeFilterLabel && (
            <span className="text-xs font-medium px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[#9a7432] dark:text-[#e3c27d]">
              Filtered: {activeFilterLabel}
            </span>
          )}
        </div>

        {filteredEvents.length === 0 ? (
          <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200 dark:border-stone-800 p-12 text-center space-y-3">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              No scheduled concerts match the current combination of filters.
            </p>
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold cursor-pointer"
            >
              Show Full World Season
            </button>
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredEvents.map((ev) => (
              <ConcertEventCard
                key={ev.id}
                event={ev}
                onSelectPerformer={handleQuickPerformerClick}
                onSelectVenue={setVenueFilter}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
