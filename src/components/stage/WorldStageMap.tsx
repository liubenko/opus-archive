"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Compass, Globe2, Minus, Plus, RotateCcw } from "lucide-react";
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

interface GeoFeature {
  type: "Feature";
  properties: { name?: string };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

function projectMercator(lng: number, lat: number, w = 1000, h = 500): [number, number] {
  const x = ((lng + 180) / 360) * w;
  const clampedLat = Math.max(-72, Math.min(78, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = h * 0.56 - (w * mercN) / (2 * Math.PI) * 0.78;
  return [x, y];
}

function ringToSvgPath(ring: number[][]): string {
  if (ring.length === 0) return "";
  let d = "";
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = projectMercator(ring[i][0], ring[i][1]);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d}Z`;
}

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
  const readyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [useSvgFallback, setUseSvgFallback] = useState(false);
  const [svgFeatures, setSvgFeatures] = useState<GeoFeature[]>([]);
  const [svgZoom, setSvgZoom] = useState(1);
  const [svgCenter, setSvgCenter] = useState<[number, number]>([500, 235]);

  const venuesByKey = useMemo(
    () => new Map(venues.map((v) => [v.slug, v])),
    [venues]
  );

  // Initialize MapLibre GL with explicit same-origin worker URL + inline hybrid style
  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    let instance: import("maplibre-gl").Map | null = null;
    const watchdog = setTimeout(() => {
      if (!cancelled && !readyRef.current) {
        setUseSvgFallback(true);
      }
    }, 3500);

    (async () => {
      try {
        if (!containerRef.current) return;
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        // Point MapLibre to the un-mangled same-origin ES module worker in /public
        maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: "https://tiles.openfreemap.org/styles/dark",
          center: [8, 34],
          zoom: 1.55,
          minZoom: 1.1,
          maxZoom: 17,
          attributionControl: false,
        });
        instance = map;
        mapRef.current = map;

        map.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "bottom-right"
        );

        const markReady = () => {
          if (cancelled || readyRef.current) return;
          readyRef.current = true;
          clearTimeout(watchdog);

          if (!map.getSource("tour-route")) {
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
                "line-opacity": 0.28,
                "line-blur": 3,
              },
            });
            map.addLayer({
              id: "tour-route-line",
              type: "line",
              source: "tour-route",
              paint: {
                "line-color": "#e3c27d",
                "line-width": 2.2,
                "line-dasharray": [2, 2],
                "line-opacity": 0.9,
              },
            });
          }

          setMapReady(true);
        };

        map.once("style.load", markReady);
        map.once("load", markReady);
        map.on("error", (ev) => {
          if (
            String(ev?.error?.message || "").toLowerCase().includes("worker") ||
            String(ev?.error?.message || "").toLowerCase().includes("webgl")
          ) {
            clearTimeout(watchdog);
            if (!cancelled) setUseSvgFallback(true);
          }
        });
      } catch {
        clearTimeout(watchdog);
        if (!cancelled) setUseSvgFallback(true);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      if (instance) instance.remove();
      mapRef.current = null;
    };
  }, []);

  // Load same-origin world-countries.geojson if SVG fallback activates
  useEffect(() => {
    if (!useSvgFallback) return;
    fetch("/world-countries.geojson")
      .then((r) => r.json() as Promise<{ features?: GeoFeature[] }>)
      .then((gj) => setSvgFeatures(gj.features || []))
      .catch(() => {});
  }, [useSvgFallback]);

  // Render interactive gold Concert Hall DOM markers whenever venues or selection change
  useEffect(() => {
    let disposed = false;
    (async () => {
      if (useSvgFallback || !mapReady || !mapRef.current) return;
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
  }, [useSvgFallback, mapReady, venues, selectedVenueSlug, onSelectVenue]);

  // Update tour-route GeoJSON line when an orchestra or soloist is selected
  useEffect(() => {
    if (useSvgFallback || !mapReady || !mapRef.current) return;
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
  }, [useSvgFallback, mapReady, tourRouteCoords]);

  // Fly smoothly when user selects a specific venue
  useEffect(() => {
    if (selectedVenueSlug === "all") return;
    const target = venuesByKey.get(selectedVenueSlug);
    if (!target) return;

    if (useSvgFallback) {
      const [px, py] = projectMercator(target.longitude, target.latitude);
      setSvgCenter([px, py]);
      setSvgZoom(3.2);
      return;
    }

    if (!mapReady || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [target.longitude, target.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 11.5),
      duration: 1100,
    });
  }, [useSvgFallback, mapReady, selectedVenueSlug, venuesByKey]);

  function flyPreset(center: [number, number], zoom: number) {
    if (useSvgFallback) {
      if (zoom <= 2) {
        setSvgCenter([500, 235]);
        setSvgZoom(1);
      } else {
        const [px, py] = projectMercator(center[0], center[1]);
        setSvgCenter([px, py]);
        setSvgZoom(Math.min(4.2, zoom * 0.72));
      }
      return;
    }
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

      {/* MapLibre WebGL Stage OR Interactive SVG Vector Fallback */}
      <div className="relative w-full h-[430px] sm:h-[490px] bg-[#0b0a09] overflow-hidden">
        {!useSvgFallback && <div ref={containerRef} className="w-full h-full" />}

        {useSvgFallback && (
          <div className="w-full h-full relative">
            <svg
              viewBox="0 0 1000 500"
              className="w-full h-full select-none"
              role="img"
              aria-label="Interactive World Concert Venues Map"
            >
              <g
                transform={`translate(500, 250) scale(${svgZoom}) translate(${-svgCenter[0]}, ${-svgCenter[1]})`}
              >
                {svgFeatures.map((f, idx) => {
                  const paths =
                    f.geometry.type === "Polygon"
                      ? (f.geometry.coordinates as number[][][]).map(ringToSvgPath)
                      : (f.geometry.coordinates as number[][][][]).flatMap((poly) =>
                          poly.map(ringToSvgPath)
                        );
                  return (
                    <path
                      key={idx}
                      d={paths.join(" ")}
                      fill="#1c1814"
                      stroke="#352e25"
                      strokeWidth={0.6 / svgZoom}
                    />
                  );
                })}

                {tourRouteCoords && tourRouteCoords.length >= 2 && (
                  <polyline
                    fill="none"
                    stroke="#e3c27d"
                    strokeWidth={2 / svgZoom}
                    strokeDasharray={`${4 / svgZoom} ${4 / svgZoom}`}
                    points={tourRouteCoords
                      .map(([lng, lat]) => projectMercator(lng, lat).join(","))
                      .join(" ")}
                  />
                )}

                {venues.map((v) => {
                  const [vx, vy] = projectMercator(v.longitude, v.latitude);
                  const isSel = selectedVenueSlug === v.slug;
                  const active = v.activeEventCount > 0;
                  return (
                    <g
                      key={v.id}
                      transform={`translate(${vx}, ${vy}) scale(${1 / svgZoom})`}
                      onClick={() =>
                        onSelectVenue(isSel ? "all" : v.slug)
                      }
                      className="cursor-pointer"
                    >
                      <circle
                        r={isSel ? 8 : 5.5}
                        fill={isSel ? "#fff8eb" : active ? "#d4af6a" : "#57534e"}
                        stroke="#11100e"
                        strokeWidth={1.5}
                      />
                      <text
                        y={-10}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight="600"
                        fill={isSel ? "#e3c27d" : active ? "#f3efe6" : "#78716c"}
                      >
                        {v.short_name || v.city} ({v.activeEventCount})
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>

            <div className="absolute bottom-3 right-3 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setSvgZoom((z) => Math.min(5, +(z + 0.5).toFixed(2)))}
                className="p-2 rounded-lg bg-[#191714] border border-stone-700 text-stone-200 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setSvgZoom((z) => Math.max(1, +(z - 0.5).toFixed(2)))}
                className="p-2 rounded-lg bg-[#191714] border border-stone-700 text-stone-200 cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {!mapReady && !useSvgFallback && (
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
          MapLibre GL · OpenFreeMap · © OpenStreetMap
        </span>
      </div>
    </div>
  );
}
