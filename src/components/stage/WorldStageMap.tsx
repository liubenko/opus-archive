"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Compass, Globe2, RotateCcw } from "lucide-react";
import type { Venue } from "@/types/database";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapVenueItem extends Venue {
  activeEventCount: number;
  totalEventCount: number;
}

interface WorldStageMapProps {
  venues: MapVenueItem[];
  selectedVenueSlug: string;
  onSelectVenue: (slug: string) => void;
  /** Ordered coordinates [lng, lat][] when an artist/orchestra tour is active */
  tourRouteCoords?: [number, number][];
  activeFilterLabel?: string | null;
}

const REGION_PRESETS = [
  { id: "world", label: "World", center: [8, 34] as [number, number], zoom: 1.55 },
  { id: "europe", label: "Europe", center: [9.5, 49.5] as [number, number], zoom: 3.9 },
  { id: "americas", label: "North America", center: [-96, 38.5] as [number, number], zoom: 3.1 },
  { id: "ny", label: "New York", center: [-73.9817, 40.769] as [number, number], zoom: 13.2 },
  { id: "asia", label: "East Asia", center: [139.74, 35.67] as [number, number], zoom: 4.5 },
] as const;

const DARK_MATTER_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export function WorldStageMap({
  venues,
  selectedVenueSlug,
  onSelectVenue,
  tourRouteCoords,
  activeFilterLabel,
}: WorldStageMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markersRef = useRef<import("maplibre-gl").Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const venuesByKey = useMemo(
    () => new Map(venues.map((v) => [v.slug, v])),
    [venues]
  );

  // Initialize MapLibre GL instance client-side only
  useEffect(() => {
    let cancelled = false;
    let instance: import("maplibre-gl").Map | null = null;

    (async () => {
      if (!containerRef.current) return;
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: DARK_MATTER_STYLE,
        center: [8, 34],
        zoom: 1.55,
        minZoom: 1.1,
        maxZoom: 16,
        attributionControl: false,
      });
      instance = map;

      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "bottom-right"
      );

      map.on("load", () => {
        if (cancelled) return;
        map.addSource("tour-route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [],
            },
          },
        });

        map.addLayer({
          id: "tour-route-glow",
          type: "line",
          source: "tour-route",
          paint: {
            "line-color": "#d4af6a",
            "line-width": 5,
            "line-opacity": 0.25,
            "line-blur": 3,
          },
        });

        map.addLayer({
          id: "tour-route-line",
          type: "line",
          source: "tour-route",
          paint: {
            "line-color": "#e3c27d",
            "line-width": 2,
            "line-dasharray": [2, 2],
            "line-opacity": 0.88,
          },
        });

        setMapReady(true);
      });

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      if (instance) instance.remove();
      mapRef.current = null;
    };
  }, []);

  // Render interactive gold Concert Hall DOM markers whenever venues or selection change
  useEffect(() => {
    let disposed = false;
    (async () => {
      if (!mapReady || !mapRef.current) return;
      const maplibregl = await import("maplibre-gl");
      if (disposed || !mapRef.current) return;

      for (const m of markersRef.current) m.remove();
      markersRef.current = [];

      for (const venue of venues) {
        const isSelected = selectedVenueSlug === venue.slug;
        const hasActive = venue.activeEventCount > 0;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = `${venue.short_name || venue.name} (${venue.city}) — ${venue.activeEventCount} concerts`;
        btn.style.cursor = "pointer";
        btn.style.background = "transparent";
        btn.style.border = "none";
        btn.style.padding = "0";

        const pillBg = isSelected
          ? "#d4af6a"
          : hasActive
            ? "#181512"
            : "#141210";
        const pillText = isSelected
          ? "#11100e"
          : hasActive
            ? "#f3efe6"
            : "#78716c";
        const borderCol = isSelected
          ? "#fff8eb"
          : hasActive
            ? "#d4af6a"
            : "#3f3a34";
        const opacity = !hasActive && selectedVenueSlug === "all" ? "0.42" : "1";

        btn.innerHTML = `
          <div style="
            display:inline-flex;
            align-items:center;
            gap:6px;
            padding:4px 9px;
            border-radius:999px;
            background:${pillBg};
            color:${pillText};
            border:1.5px solid ${borderCol};
            box-shadow:0 4px 14px rgba(0,0,0,0.65);
            font-family:Inter,system-ui,sans-serif;
            font-size:11px;
            font-weight:600;
            white-space:nowrap;
            opacity:${opacity};
            transform:${isSelected ? "scale(1.12)" : "scale(1)"};
            transition:transform 0.15s ease;
          ">
            <span style="
              width:7px;
              height:7px;
              border-radius:999px;
              background:${isSelected ? "#11100e" : hasActive ? "#d4af6a" : "#57534e"};
              display:inline-block;
            "></span>
            <span>${venue.short_name || venue.city}</span>
            <span style="
              font-family:monospace;
              font-size:10px;
              padding:0 5px;
              border-radius:999px;
              background:${isSelected ? "rgba(17,16,14,0.16)" : "rgba(212,175,106,0.16)"};
              color:${isSelected ? "#11100e" : "#e3c27d"};
            ">${venue.activeEventCount}</span>
          </div>
        `;

        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelectVenue(
            selectedVenueSlug === venue.slug ? "all" : venue.slug
          );
        });

        const marker = new maplibregl.Marker({
          element: btn,
          anchor: "center",
        })
          .setLngLat([venue.longitude, venue.latitude])
          .addTo(mapRef.current!);

        markersRef.current.push(marker);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [mapReady, venues, selectedVenueSlug, onSelectVenue]);

  // Update tour-route GeoJSON line when an orchestra or soloist is selected
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const src = mapRef.current.getSource("tour-route") as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    if (!src) return;

    src.setData({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates:
          tourRouteCoords && tourRouteCoords.length >= 2 ? tourRouteCoords : [],
      },
    });
  }, [mapReady, tourRouteCoords]);

  // Fly smoothly when user selects a specific venue
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (selectedVenueSlug === "all") return;
    const target = venuesByKey.get(selectedVenueSlug);
    if (!target) return;
    mapRef.current.flyTo({
      center: [target.longitude, target.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 11.5),
      duration: 1100,
    });
  }, [mapReady, selectedVenueSlug, venuesByKey]);

  function flyPreset(center: [number, number], zoom: number) {
    mapRef.current?.flyTo({ center, zoom, duration: 950 });
  }

  return (
    <div className="rounded-3xl bg-[#0e0d0b] border border-stone-800 shadow-xl overflow-hidden relative">
      {/* Top Map HUD */}
      <div className="px-4 py-2.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-300">
        <div className="flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-[#d4af6a]" />
          <span className="font-medium">
            {activeFilterLabel ? (
              <>
                Showing tour &amp; halls for{" "}
                <strong className="text-[#e3c27d]">{activeFilterLabel}</strong>
              </>
            ) : (
              "Click any concert hall pin to inspect its 2026/27 season or zoom to street level"
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {REGION_PRESETS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => flyPreset(r.center, r.zoom)}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-[11px] font-medium text-stone-300 cursor-pointer"
            >
              {r.label}
            </button>
          ))}
          {selectedVenueSlug !== "all" && (
            <button
              type="button"
              onClick={() => {
                onSelectVenue("all");
                flyPreset([8, 34], 1.55);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#d4af6a] text-[#11100e] text-[11px] font-semibold cursor-pointer ml-1"
            >
              <RotateCcw className="w-3 h-3" />
              All Halls
            </button>
          )}
        </div>
      </div>

      {/* MapLibre Canvas */}
      <div className="relative w-full h-[430px] sm:h-[490px] bg-[#0b0a09]">
        <div ref={containerRef} className="w-full h-full" />
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-stone-400 gap-2 pointer-events-none">
            <Compass className="w-4 h-4 animate-spin text-[#d4af6a]" />
            Loading interactive vector atlas...
          </div>
        )}
      </div>

      {/* Bottom Attribution & Legend */}
      <div className="px-4 py-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-400">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#d4af6a]" />
            Active Concert Hall (number = matching concerts)
          </span>
          {tourRouteCoords && tourRouteCoords.length >= 2 && (
            <span className="inline-flex items-center gap-1.5 text-[#e3c27d]">
              <span className="w-4 border-t border-dashed border-[#e3c27d]" />
              Chronological Season Tour Path
            </span>
          )}
        </div>
        <span className="text-[10px] text-stone-500">
          MapLibre GL · © OpenStreetMap · © CARTO
        </span>
      </div>
    </div>
  );
}
