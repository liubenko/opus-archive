"use client";

import { useMemo, useState } from "react";
import {
  ConcertEventCard,
  type HydratedConcertEvent,
} from "./ConcertEventCard";
import { WorldStageMap, type MapVenueItem } from "./WorldStageMap";
import type { Venue } from "@/types/database";

export function VenueSeasonFilter({
  events,
}: {
  events: HydratedConcertEvent[];
}) {
  const [selectedArtistSlug, setSelectedArtistSlug] = useState<string>("all");

  const visitingPerformers = useMemo(() => {
    const map = new Map<
      string,
      { slug: string; name: string; role: string; count: number }
    >();
    for (const ev of events) {
      for (const p of ev.performers) {
        const prev = map.get(p.slug);
        if (prev) prev.count += 1;
        else {
          map.set(p.slug, {
            slug: p.slug,
            name: p.name,
            role: p.instrument_label || p.billing_role,
            count: 1,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [events]);

  const filtered = useMemo(() => {
    if (selectedArtistSlug === "all") return events;
    return events.filter((ev) =>
      ev.performers.some((p) => p.slug === selectedArtistSlug)
    );
  }, [events, selectedArtistSlug]);

  return (
    <div className="space-y-5">
      {visitingPerformers.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 block">
            Filter Performers Appearing Here This Season
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedArtistSlug("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                selectedArtistSlug === "all"
                  ? "bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] border-transparent"
                  : "bg-white dark:bg-[#191714] border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300"
              }`}
            >
              All Performances ({events.length})
            </button>
            {visitingPerformers.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() =>
                  setSelectedArtistSlug((prev) =>
                    prev === p.slug ? "all" : p.slug
                  )
                }
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                  selectedArtistSlug === p.slug
                    ? "bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] border-transparent"
                    : "bg-white dark:bg-[#191714] border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:border-[#d4af6a]"
                }`}
              >
                {p.name}{" "}
                <span className="opacity-70 font-mono text-[10px]">
                  ({p.count})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3.5">
        {filtered.map((ev) => (
          <ConcertEventCard
            key={ev.id}
            event={ev}
            onSelectPerformer={(slug) =>
              setSelectedArtistSlug((prev) => (prev === slug ? "all" : slug))
            }
          />
        ))}
      </div>
    </div>
  );
}

export function ArtistTourClient({
  performerName,
  venues,
  events,
}: {
  performerName: string;
  venues: Venue[];
  events: HydratedConcertEvent[];
}) {
  const [venueSlug, setVenueSlug] = useState<string>("all");

  const filteredEvents = useMemo(() => {
    if (venueSlug === "all") return events;
    return events.filter((ev) => ev.venue_slug === venueSlug);
  }, [events, venueSlug]);

  const mapVenues: MapVenueItem[] = useMemo(() => {
    const countMap = new Map<number, number>();
    for (const ev of events) {
      countMap.set(ev.venue_id, (countMap.get(ev.venue_id) ?? 0) + 1);
    }
    return venues
      .filter((v) => (countMap.get(v.id) ?? 0) > 0)
      .map((v) => ({
        ...v,
        activeEventCount: countMap.get(v.id) ?? 0,
        totalEventCount: countMap.get(v.id) ?? 0,
      }));
  }, [venues, events]);

  const tourCoords = useMemo(() => {
    const coords: [number, number][] = [];
    for (const ev of events) {
      const prev = coords[coords.length - 1];
      if (!prev || prev[0] !== ev.longitude || prev[1] !== ev.latitude) {
        coords.push([ev.longitude, ev.latitude]);
      }
    }
    return coords.length >= 2 ? coords : undefined;
  }, [events]);

  return (
    <div className="space-y-8">
      <WorldStageMap
        venues={mapVenues}
        selectedVenueSlug={venueSlug}
        onSelectVenue={setVenueSlug}
        tourRouteCoords={tourCoords}
        activeFilterLabel={performerName}
      />

      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6]">
            Season Calendar ({filteredEvents.length})
          </h2>
          {venueSlug !== "all" && (
            <button
              type="button"
              onClick={() => setVenueSlug("all")}
              className="text-xs font-medium text-[#9a7432] dark:text-[#d4af6a] hover:underline cursor-pointer"
            >
              Show all tour cities
            </button>
          )}
        </div>

        {filteredEvents.map((ev) => (
          <ConcertEventCard
            key={ev.id}
            event={ev}
            onSelectVenue={(s) =>
              setVenueSlug((prev) => (prev === s ? "all" : s))
            }
          />
        ))}
      </div>
    </div>
  );
}
