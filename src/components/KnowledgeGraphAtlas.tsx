"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CircleDot,
  Compass,
  GitBranch,
  Minus,
  Network,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Route,
  Search,
  Sparkles,
} from "lucide-react";
import type { ComposerRelation, ComposerWithWorkCount } from "@/types/database";
import {
  ERA_ORDER,
  RELATION_META,
  formatLifespan,
  getEraStyle,
  getInitials,
} from "@/lib/constants";
import { ComposerAvatar } from "./ComposerAvatar";
import { SelectMenu } from "./SelectMenu";

interface KnowledgeGraphAtlasProps {
  composers: ComposerWithWorkCount[];
  relations: ComposerRelation[];
}

type LayoutMode = "constellation" | "lineage" | "radial";

const W = 1060;
const H = 760;

interface SimNode {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * BFS shortest path across composer relations (undirected so we can trace
 * teacher/student & influence chains in either direction).
 */
function findShortestPath(
  startId: number,
  endId: number,
  relations: ComposerRelation[]
): number[] | null {
  if (startId === endId) return [startId];
  const adj = new Map<number, number[]>();
  for (const r of relations) {
    if (!adj.has(r.source_composer_id)) adj.set(r.source_composer_id, []);
    if (!adj.has(r.target_composer_id)) adj.set(r.target_composer_id, []);
    adj.get(r.source_composer_id)!.push(r.target_composer_id);
    adj.get(r.target_composer_id)!.push(r.source_composer_id);
  }

  const queue: number[][] = [[startId]];
  const visited = new Set<number>([startId]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    for (const next of adj.get(last) ?? []) {
      if (next === endId) return [...path, next];
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return null;
}

export function KnowledgeGraphAtlas({
  composers,
  relations,
}: KnowledgeGraphAtlasProps) {
  const [layout, setLayout] = useState<LayoutMode>("constellation");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [eraFilter, setEraFilter] = useState<string>("All");
  const [nationalityFilter, setNationalityFilter] = useState<string>("All");
  const [focusSearch, setFocusSearch] = useState<string>("");
  const [pathTargetId, setPathTargetId] = useState<string>("");
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    () => new Set(Object.keys(RELATION_META))
  );

  // Time-machine scrubber
  const [timeYear, setTimeYear] = useState<number | null>(null);
  const [playingTime, setPlayingTime] = useState<boolean>(false);

  // Pan & Zoom state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Draggable force simulation positions
  const [simPositions, setSimPositions] = useState<
    Map<number, { x: number; y: number }>
  >(() => new Map());
  const simNodesRef = useRef<Map<number, SimNode>>(new Map());
  const draggingNodeIdRef = useRef<number | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const didDragNodeRef = useRef<boolean>(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const simAlphaRef = useRef<number>(1);

  const composerById = useMemo(() => {
    const map = new Map<number, ComposerWithWorkCount>();
    for (const c of composers) map.set(c.id, c);
    return map;
  }, [composers]);

  const workCountOf = useCallback(
    (c: ComposerWithWorkCount) => c.works?.[0]?.count ?? 0,
    []
  );

  // Degree centrality per composer
  const degreeById = useMemo(() => {
    const deg = new Map<number, number>();
    for (const r of relations) {
      deg.set(r.source_composer_id, (deg.get(r.source_composer_id) ?? 0) + 1);
      deg.set(r.target_composer_id, (deg.get(r.target_composer_id) ?? 0) + 1);
    }
    return deg;
  }, [relations]);

  // Default selected composer to highest-degree hub (usually J.S. Bach / Liszt / Beethoven) when switching to lineage mode
  useEffect(() => {
    if (layout === "lineage" && selectedId === null && composers.length > 0) {
      let bestId = composers[0].id;
      let bestDeg = -1;
      for (const c of composers) {
        const d = degreeById.get(c.id) ?? 0;
        if (d > bestDeg) {
          bestDeg = d;
          bestId = c.id;
        }
      }
      setSelectedId(bestId);
    }
  }, [layout, selectedId, composers, degreeById]);

  // Time-machine animation loop
  useEffect(() => {
    if (!playingTime) return;
    setTimeYear((y) => (y === null || y >= 2020 ? 1650 : y));
    const t = setInterval(() => {
      setTimeYear((y) => {
        if (y === null) return 1650;
        if (y >= 2020) {
          setPlayingTime(false);
          return 2020;
        }
        return y + 5;
      });
    }, 180);
    return () => clearInterval(t);
  }, [playingTime]);

  const nationalities = useMemo(() => {
    const involved = new Set<number>();
    for (const r of relations) {
      involved.add(r.source_composer_id);
      involved.add(r.target_composer_id);
    }
    return Array.from(
      new Set(
        composers
          .filter((c) => involved.has(c.id))
          .map((c) => c.nationality)
          .filter(Boolean)
      )
    ).sort();
  }, [composers, relations]);

  const visibleRelations = useMemo(() => {
    return relations.filter((r) => {
      if (!activeTypes.has(r.relation_type)) return false;
      const src = composerById.get(r.source_composer_id);
      const tgt = composerById.get(r.target_composer_id);
      if (!src || !tgt) return false;
      if (eraFilter !== "All" && src.era !== eraFilter && tgt.era !== eraFilter) {
        return false;
      }
      if (
        nationalityFilter !== "All" &&
        src.nationality !== nationalityFilter &&
        tgt.nationality !== nationalityFilter
      ) {
        return false;
      }
      return true;
    });
  }, [relations, activeTypes, composerById, eraFilter, nationalityFilter]);

  const graphComposers = useMemo(() => {
    const involvedIds = new Set<number>();
    for (const r of visibleRelations) {
      involvedIds.add(r.source_composer_id);
      involvedIds.add(r.target_composer_id);
    }
    const list = composers.filter((c) => involvedIds.has(c.id));
    return list.length > 0 ? list : composers.slice(0, 24);
  }, [composers, visibleRelations]);

  // Initialize & run force constellation physics
  useEffect(() => {
    if (layout !== "constellation") return;
    const sorted = [...graphComposers].sort(
      (a, b) => a.birth_year - b.birth_year
    );
    const minY = Math.min(...sorted.map((c) => c.birth_year), 1600);
    const maxY = Math.max(...sorted.map((c) => c.birth_year), 1960);
    const span = Math.max(1, maxY - minY);

    const map = new Map<number, SimNode>();
    sorted.forEach((c, idx) => {
      const existing = simNodesRef.current.get(c.id);
      const targetX =
        100 + ((c.birth_year - minY) / span) * (W - 200);
      const goldenAngle = idx * 2.39996;
      const targetY =
        H / 2 + Math.sin(goldenAngle) * (H * 0.34);

      map.set(c.id, {
        id: c.id,
        x: existing?.x ?? targetX,
        y: existing?.y ?? targetY,
        vx: 0,
        vy: 0,
      });
    });
    simNodesRef.current = map;
    simAlphaRef.current = 1;

    let rafId = 0;
    const targetXById = new Map<number, number>();
    sorted.forEach((c) => {
      targetXById.set(
        c.id,
        105 + ((c.birth_year - minY) / span) * (W - 210)
      );
    });

    function step() {
      const alpha = simAlphaRef.current;
      if (alpha > 0.015 || draggingNodeIdRef.current !== null) {
        const nodesArr = Array.from(simNodesRef.current.values());

        // Node-node repulsion
        for (let i = 0; i < nodesArr.length; i++) {
          for (let j = i + 1; j < nodesArr.length; j++) {
            const a = nodesArr[i];
            const b = nodesArr[j];
            const dx = b.x - a.x || 0.1;
            const dy = b.y - a.y || 0.1;
            const distSq = dx * dx + dy * dy;
            const minDist = 66;
            if (distSq < minDist * minDist * 3.2) {
              const dist = Math.max(8, Math.sqrt(distSq));
              const force = ((minDist * minDist) / (dist * dist)) * 1.35 * alpha;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              a.vx -= fx;
              a.vy -= fy;
              b.vx += fx;
              b.vy += fy;
            }
          }
        }

        // Edge spring attraction
        for (const r of visibleRelations) {
          const s = simNodesRef.current.get(r.source_composer_id);
          const t = simNodesRef.current.get(r.target_composer_id);
          if (!s || !t) continue;
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const ideal = 135;
          const k = 0.018 * alpha;
          const f = (dist - ideal) * k;
          const fx = (dx / dist) * f;
          const fy = (dy / dist) * f;
          s.vx += fx;
          s.vy += fy;
          t.vx -= fx;
          t.vy -= fy;
        }

        // Chronological X-gravity + vertical centering
        for (const n of nodesArr) {
          if (draggingNodeIdRef.current === n.id) {
            n.vx = 0;
            n.vy = 0;
            continue;
          }
          const tx = targetXById.get(n.id) ?? W / 2;
          n.vx += (tx - n.x) * 0.045 * alpha;
          n.vy += (H / 2 - n.y) * 0.012 * alpha;

          n.vx *= 0.76;
          n.vy *= 0.76;
          n.x = Math.max(62, Math.min(W - 62, n.x + n.vx));
          n.y = Math.max(62, Math.min(H - 62, n.y + n.vy));
        }

        if (draggingNodeIdRef.current === null) {
          simAlphaRef.current *= 0.965;
        }

        const nextPos = new Map<number, { x: number; y: number }>();
        for (const n of nodesArr) {
          nextPos.set(n.id, { x: n.x, y: n.y });
        }
        setSimPositions(nextPos);
      }
      rafId = requestAnimationFrame(step);
    }

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [layout, graphComposers, visibleRelations]);

  // Compute node coordinates for whichever layout mode is active
  const positionedNodes = useMemo(() => {
    if (layout === "radial") {
      const sorted = [...graphComposers].sort(
        (a, b) => a.birth_year - b.birth_year
      );
      const cx = W / 2;
      const cy = H / 2;
      const radius = 205;
      return sorted.map((composer, i) => {
        const angle =
          -Math.PI / 2 + (i / Math.max(1, sorted.length)) * Math.PI * 2;
        return {
          composer,
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          angle,
        };
      });
    }

    if (layout === "lineage") {
      const centerId = selectedId ?? graphComposers[0]?.id;
      const centerComp =
        (centerId ? composerById.get(centerId) : null) ?? graphComposers[0];
      if (!centerComp) return [];

      const incomingIds = Array.from(
        new Set(
          visibleRelations
            .filter((r) => r.target_composer_id === centerComp.id)
            .map((r) => r.source_composer_id)
        )
      );
      const outgoingIds = Array.from(
        new Set(
          visibleRelations
            .filter((r) => r.source_composer_id === centerComp.id)
            .map((r) => r.target_composer_id)
        )
      );
      // 2nd-hop heirs
      const used = new Set<number>([
        centerComp.id,
        ...incomingIds,
        ...outgoingIds,
      ]);
      const secondHopIds: number[] = [];
      for (const outId of outgoingIds) {
        for (const r of visibleRelations) {
          if (r.source_composer_id === outId && !used.has(r.target_composer_id)) {
            used.add(r.target_composer_id);
            secondHopIds.push(r.target_composer_id);
          }
        }
      }

      const result: {
        composer: ComposerWithWorkCount;
        x: number;
        y: number;
        angle?: number;
      }[] = [{ composer: centerComp, x: 430, y: H / 2 }];

      incomingIds.forEach((id, idx) => {
        const c = composerById.get(id);
        if (!c) return;
        const step = (H - 140) / Math.max(1, incomingIds.length);
        result.push({
          composer: c,
          x: 150,
          y: 70 + step * (idx + 0.5),
        });
      });

      outgoingIds.forEach((id, idx) => {
        const c = composerById.get(id);
        if (!c) return;
        const step = (H - 110) / Math.max(1, outgoingIds.length);
        result.push({
          composer: c,
          x: 720,
          y: 55 + step * (idx + 0.5),
        });
      });

      secondHopIds.slice(0, 12).forEach((id, idx, arr) => {
        const c = composerById.get(id);
        if (!c) return;
        const step = (H - 120) / Math.max(1, arr.length);
        result.push({
          composer: c,
          x: 945,
          y: 60 + step * (idx + 0.5),
        });
      });

      return result;
    }

    // Default: constellation
    return graphComposers.map((composer) => {
      const p = simPositions.get(composer.id) ?? { x: W / 2, y: H / 2 };
      return { composer, x: p.x, y: p.y, angle: undefined };
    });
  }, [
    layout,
    graphComposers,
    simPositions,
    selectedId,
    composerById,
    visibleRelations,
  ]);

  const nodeById = useMemo(() => {
    const map = new Map<
      number,
      { composer: ComposerWithWorkCount; x: number; y: number; angle?: number }
    >();
    for (const n of positionedNodes) map.set(n.composer.id, n);
    return map;
  }, [positionedNodes]);

  // Shortest path chain when pathTargetId is chosen
  const shortestPathIds = useMemo(() => {
    if (!selectedId || !pathTargetId) return null;
    return findShortestPath(selectedId, Number(pathTargetId), visibleRelations);
  }, [selectedId, pathTargetId, visibleRelations]);

  const shortestPathEdgeSet = useMemo(() => {
    if (!shortestPathIds || shortestPathIds.length < 2) return null;
    const pairs = new Set<string>();
    for (let i = 0; i < shortestPathIds.length - 1; i++) {
      const a = shortestPathIds[i];
      const b = shortestPathIds[i + 1];
      pairs.add(`${a}:${b}`);
      pairs.add(`${b}:${a}`);
    }
    return pairs;
  }, [shortestPathIds]);

  const activeId = hoveredId ?? selectedId;

  const connectedNodeIds = useMemo(() => {
    if (shortestPathIds) return new Set<number>(shortestPathIds);
    if (timeYear !== null) {
      const alive = new Set<number>();
      for (const c of graphComposers) {
        const end = c.death_year ?? 2026;
        if (c.birth_year <= timeYear && end >= timeYear) {
          alive.add(c.id);
        }
      }
      return alive;
    }
    if (activeId === null) return null;
    const set = new Set<number>([activeId]);
    for (const r of visibleRelations) {
      if (r.source_composer_id === activeId) set.add(r.target_composer_id);
      if (r.target_composer_id === activeId) set.add(r.source_composer_id);
    }
    return set;
  }, [shortestPathIds, timeYear, activeId, graphComposers, visibleRelations]);

  const selectedComposer = selectedId ? composerById.get(selectedId) ?? null : null;

  const selectedStats = useMemo(() => {
    if (!selectedComposer) {
      return { outgoing: [], incoming: [], twoHopReach: 0 };
    }
    const outgoing = visibleRelations
      .filter((r) => r.source_composer_id === selectedComposer.id)
      .map((r) => ({
        relation: r,
        other: composerById.get(r.target_composer_id),
      }))
      .filter(
        (x): x is { relation: ComposerRelation; other: ComposerWithWorkCount } =>
          Boolean(x.other)
      );

    const incoming = visibleRelations
      .filter((r) => r.target_composer_id === selectedComposer.id)
      .map((r) => ({
        relation: r,
        other: composerById.get(r.source_composer_id),
      }))
      .filter(
        (x): x is { relation: ComposerRelation; other: ComposerWithWorkCount } =>
          Boolean(x.other)
      );

    const reach = new Set<number>();
    const hop1 = [
      ...outgoing.map((o) => o.other.id),
      ...incoming.map((i) => i.other.id),
    ];
    for (const id of hop1) {
      reach.add(id);
      for (const r of visibleRelations) {
        if (r.source_composer_id === id && r.target_composer_id !== selectedComposer.id) {
          reach.add(r.target_composer_id);
        }
        if (r.target_composer_id === id && r.source_composer_id !== selectedComposer.id) {
          reach.add(r.source_composer_id);
        }
      }
    }

    return { outgoing, incoming, twoHopReach: reach.size };
  }, [selectedComposer, visibleRelations, composerById]);

  const focusMatches = useMemo(() => {
    const q = focusSearch.trim().toLowerCase();
    if (!q) return [];
    return graphComposers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.sort_name.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [focusSearch, graphComposers]);

  // Historical Time-Machine insight summary
  const timeInsight = useMemo(() => {
    if (timeYear === null) return null;
    const alive = composers.filter(
      (c) => c.birth_year <= timeYear && (c.death_year ?? 2026) >= timeYear
    );
    const topNames = alive
      .sort(
        (a, b) =>
          (degreeById.get(b.id) ?? 0) - (degreeById.get(a.id) ?? 0)
      )
      .slice(0, 4)
      .map((c) => c.sort_name.split(",")[0]);

    return {
      count: alive.length,
      names: topNames.join(", "),
    };
  }, [timeYear, composers, degreeById]);

  const maxWorkCount = useMemo(
    () => Math.max(1, ...graphComposers.map((c) => workCountOf(c))),
    [graphComposers, workCountOf]
  );

  // Pointer drag handlers for SVG nodes & canvas panning
  function clientToSvgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const rawX = (clientX - rect.left) * scaleX;
    const rawY = (clientY - rect.top) * scaleY;
    return {
      x: (rawX - W / 2 - pan.x) / zoom + W / 2,
      y: (rawY - H / 2 - pan.y) / zoom + H / 2,
    };
  }

  function handleCanvasMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (draggingNodeIdRef.current !== null) return;
    isPanningRef.current = true;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  }

  function handleCanvasMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (draggingNodeIdRef.current !== null && layout === "constellation") {
      if (
        Math.hypot(
          e.clientX - dragOriginRef.current.x,
          e.clientY - dragOriginRef.current.y
        ) > 4
      ) {
        didDragNodeRef.current = true;
      }
      const pt = clientToSvgPoint(e.clientX, e.clientY);
      const node = simNodesRef.current.get(draggingNodeIdRef.current);
      if (node) {
        node.x = Math.max(50, Math.min(W - 50, pt.x));
        node.y = Math.max(50, Math.min(H - 50, pt.y));
        simAlphaRef.current = Math.max(simAlphaRef.current, 0.35);
      }
      return;
    }

    if (isPanningRef.current) {
      const svg = svgRef.current;
      const scale = svg ? W / svg.getBoundingClientRect().width : 1;
      const dx = (e.clientX - panStartRef.current.x) * scale;
      const dy = (e.clientY - panStartRef.current.y) * scale;
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
    }
  }

  function handleCanvasWheel(e: React.WheelEvent<SVGSVGElement>) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    setZoom((z) => Math.min(2.4, Math.max(0.6, +(z + delta).toFixed(2))));
  }

  function handleCanvasMouseUp() {
    draggingNodeIdRef.current = null;
    isPanningRef.current = false;
  }

  function toggleType(type: string) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Top Control Deck */}
      <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-4 shadow-xs space-y-3">
        <div className="flex flex-col xl:flex-row gap-3 xl:items-center justify-between">
          {/* Layout Switcher Pills */}
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#f3efe8] dark:bg-[#12100e] border border-stone-200 dark:border-stone-800 self-start">
            {(
              [
                {
                  id: "constellation",
                  label: "Force Constellation",
                  icon: Network,
                },
                { id: "lineage", label: "Lineage Fan", icon: GitBranch },
                { id: "radial", label: "Orbital Chord Ring", icon: Compass },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setLayout(id);
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  layout === id
                    ? "bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] shadow-xs"
                    : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Search + Era + Nationality Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={focusSearch}
                onChange={(e) => setFocusSearch(e.target.value)}
                placeholder="Focus composer (Bach, Liszt)..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#d4af6a]"
              />
              {focusMatches.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-[#1e1b17] border border-stone-200 dark:border-stone-700 rounded-xl shadow-xl z-40 overflow-hidden">
                  {focusMatches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(c.id);
                        setPathTargetId("");
                        setFocusSearch("");
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-stone-100 dark:hover:bg-[#27231d] flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="font-medium text-stone-900 dark:text-stone-100 truncate">
                        {c.name}
                      </span>
                      <span className="text-[10px] text-stone-400">{c.era}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <SelectMenu
              value={eraFilter}
              onChange={(val) => {
                setEraFilter(val);
                setSelectedId(null);
              }}
              ariaLabel="Filter graph by era"
              options={[
                { value: "All", label: "All Eras" },
                ...ERA_ORDER.map((e) => ({ value: e, label: e })),
              ]}
            />

            <SelectMenu
              value={nationalityFilter}
              onChange={(val) => {
                setNationalityFilter(val);
                setSelectedId(null);
              }}
              ariaLabel="Filter graph by nationality"
              align="right"
              options={[
                { value: "All", label: "All Schools" },
                ...nationalities.map((nat) => ({ value: nat, label: nat })),
              ]}
            />
          </div>
        </div>

        {/* Relationship Type Toggles + Time-Machine Scrubber */}
        <div className="pt-2.5 border-t border-stone-100 dark:border-stone-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.entries(RELATION_META).map(([key, meta]) => {
              const count = relations.filter(
                (r) => r.relation_type === key
              ).length;
              if (count === 0) return null;
              const enabled = activeTypes.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleType(key)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                    enabled
                      ? meta.badgeClass
                      : "bg-stone-50 dark:bg-stone-900 text-stone-400 dark:text-stone-600 border-stone-200 dark:border-stone-800 opacity-55"
                  }`}
                >
                  <span
                    className="w-2.5 h-0.5 rounded-full"
                    style={{ backgroundColor: meta.hex }}
                  />
                  {meta.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Interactive Time-Machine Year Scrubber */}
          <div className="flex flex-wrap items-center gap-2.5 bg-[#faf8f4] dark:bg-[#12100e] border border-stone-200 dark:border-stone-800 rounded-xl px-3 py-1.5">
            <button
              type="button"
              onClick={() => setPlayingTime((p) => !p)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-[11px] font-semibold cursor-pointer"
            >
              {playingTime ? (
                <>
                  <Pause className="w-3 h-3" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  Play Timeline
                </>
              )}
            </button>
            <input
              type="range"
              min={1600}
              max={2020}
              step={5}
              value={timeYear ?? 1750}
              onChange={(e) => {
                setPlayingTime(false);
                setTimeYear(Number(e.target.value));
              }}
              aria-label="Scrub historical year"
              className="w-28 sm:w-36 accent-[#d4af6a] cursor-pointer"
            />
            <span className="font-mono text-xs font-semibold text-stone-800 dark:text-[#e3c27d] min-w-[54px]">
              {timeYear !== null ? `Yr ${timeYear}` : "All Time"}
            </span>
            {timeYear !== null && (
              <button
                type="button"
                onClick={() => {
                  setPlayingTime(false);
                  setTimeYear(null);
                }}
                className="text-[11px] text-stone-400 hover:text-stone-800 dark:hover:text-white cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Knowledge Graph Canvas + Glassmorphic Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Obsidian Graph Canvas (8 cols) */}
        <div className="lg:col-span-8 rounded-3xl bg-[#0e0d0b] border border-stone-800 shadow-xl overflow-hidden relative">
          {/* Floating HUD Bar */}
          <div className="px-4 py-2.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
            <div className="flex items-center gap-2">
              <CircleDot className="w-3.5 h-3.5 text-[#d4af6a]" />
              {timeInsight ? (
                <span className="text-[#e3c27d]">
                  <strong>{timeYear}:</strong> {timeInsight.count} composers
                  alive
                  {timeInsight.names ? ` (${timeInsight.names})` : ""}
                </span>
              ) : shortestPathIds && shortestPathIds.length > 1 ? (
                <span className="text-emerald-300">
                  <strong>{shortestPathIds.length - 1}-step lineage chain</strong>{" "}
                  highlighted across the graph
                </span>
              ) : (
                <span>
                  {layout === "constellation"
                    ? "Drag any composer portrait · Pinch or +/− to zoom · Click to inspect"
                    : layout === "lineage"
                      ? "Left: Mentors & Roots → Center: Focus → Right: 1st & 2nd-Gen Musical Heirs"
                      : "Chronological 360° Ring · Outer bars = Cataloged Works · Inner chords = Lineages"}
                </span>
              )}
            </div>

            {/* Zoom & Reset Controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(2)))}
                title="Zoom In"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-stone-300 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))}
                title="Zoom Out"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-stone-300 cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                  setSelectedId(null);
                  setPathTargetId("");
                  setTimeYear(null);
                  setPlayingTime(false);
                }}
                title="Reset View"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-[11px] text-stone-300 cursor-pointer ml-1"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>
          </div>

          {/* Interactive SVG Stage */}
          <div className="w-full overflow-hidden bg-[radial-gradient(circle_at_center,_#1b1712_0%,_#0d0c0a_72%)]">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              onWheel={handleCanvasWheel}
              className="w-full h-auto select-none cursor-grab active:cursor-grabbing"
              role="img"
              aria-label="Interactive Classical Composer Knowledge Graph"
            >
              <defs>
                {/* Avatar circular clipPaths */}
                {positionedNodes.map(({ composer }) => {
                  const deg = degreeById.get(composer.id) ?? 1;
                  const isCenter =
                    layout === "lineage" && selectedId === composer.id;
                  const r = isCenter
                    ? 34
                    : layout === "radial"
                      ? 13
                      : Math.min(25, 14 + Math.sqrt(deg) * 2.4);
                  return (
                    <clipPath
                      key={`clip-${composer.id}`}
                      id={`avatar-clip-${composer.id}`}
                    >
                      <circle cx={0} cy={0} r={r} />
                    </clipPath>
                  );
                })}

                <filter id="glow-gold" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                {Object.entries(RELATION_META).map(([key, meta]) => (
                  <marker
                    key={key}
                    id={`kg-arrow-${key}`}
                    viewBox="0 0 10 10"
                    refX="24"
                    refY="5"
                    markerWidth="5.5"
                    markerHeight="5.5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill={meta.hex} />
                  </marker>
                ))}
              </defs>

              <g
                transform={`translate(${W / 2 + pan.x}, ${H / 2 + pan.y}) scale(${zoom}) translate(${-W / 2}, ${-H / 2})`}
              >
                {/* Astronomical background guides */}
                {layout === "radial" && (
                  <g>
                    {[130, 205, 262].map((r) => (
                      <circle
                        key={r}
                        cx={W / 2}
                        cy={H / 2}
                        r={r}
                        fill="none"
                        stroke="#2d2720"
                        strokeDasharray="2 5"
                      />
                    ))}
                  </g>
                )}

                {layout === "constellation" &&
                  [
                    { x: W * 0.16, label: "EARLY / BAROQUE" },
                    { x: W * 0.38, label: "CLASSICAL" },
                    { x: W * 0.62, label: "ROMANTIC" },
                    { x: W * 0.85, label: "20TH C. / MODERN" },
                  ].map((col) => (
                    <g key={col.label}>
                      <line
                        x1={col.x}
                        y1={36}
                        x2={col.x}
                        y2={H - 28}
                        stroke="#24201a"
                        strokeDasharray="3 6"
                      />
                      <text
                        x={col.x}
                        y={26}
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="600"
                        letterSpacing="0.16em"
                        fill="#575046"
                      >
                        {col.label}
                      </text>
                    </g>
                  ))}

                {layout === "lineage" && (
                  <g>
                    {[
                      { x: 150, label: "MENTORS & ROOTS" },
                      { x: 430, label: "FOCAL COMPOSER" },
                      { x: 720, label: "STUDENTS & DIRECT HEIRS" },
                      { x: 945, label: "2ND-GEN LINEAGE" },
                    ].map((col) => (
                      <text
                        key={col.label}
                        x={col.x}
                        y={28}
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="700"
                        letterSpacing="0.14em"
                        fill="#6b6257"
                      >
                        {col.label}
                      </text>
                    ))}
                  </g>
                )}

                {/* Edges / Chords / Bezier Ribbons */}
                {visibleRelations.map((rel) => {
                  const s = nodeById.get(rel.source_composer_id);
                  const t = nodeById.get(rel.target_composer_id);
                  if (!s || !t) return null;

                  const meta = RELATION_META[rel.relation_type];
                  const inShortestPath = shortestPathEdgeSet?.has(
                    `${rel.source_composer_id}:${rel.target_composer_id}`
                  );

                  const isConnected =
                    inShortestPath ||
                    (shortestPathEdgeSet === null &&
                      (activeId === null
                        ? connectedNodeIds === null ||
                          (connectedNodeIds.has(rel.source_composer_id) &&
                            connectedNodeIds.has(rel.target_composer_id))
                        : rel.source_composer_id === activeId ||
                          rel.target_composer_id === activeId));

                  let d = "";
                  if (layout === "radial") {
                    // Sweep chord gently through center
                    d = `M ${s.x} ${s.y} Q ${W / 2} ${H / 2} ${t.x} ${t.y}`;
                  } else if (layout === "lineage") {
                    const mx = (s.x + t.x) / 2;
                    d = `M ${s.x} ${s.y} C ${mx} ${s.y}, ${mx} ${t.y}, ${t.x} ${t.y}`;
                  } else {
                    const dx = t.x - s.x;
                    const dy = t.y - s.y;
                    const offset = Math.min(42, Math.hypot(dx, dy) * 0.15);
                    const mx = (s.x + t.x) / 2;
                    const my = (s.y + t.y) / 2 - offset;
                    d = `M ${s.x} ${s.y} Q ${mx} ${my} ${t.x} ${t.y}`;
                  }

                  const strokeColor = inShortestPath
                    ? "#34d399"
                    : meta?.hex ?? "#d4af6a";

                  const opacity = inShortestPath
                    ? 0.98
                    : activeId === null && timeYear === null
                      ? layout === "radial"
                        ? 0.28
                        : 0.36
                      : isConnected
                        ? 0.9
                        : 0.05;

                  return (
                    <path
                      key={rel.id}
                      d={d}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={
                        inShortestPath
                          ? 3.2
                          : activeId !== null && isConnected
                            ? 2.2
                            : 1.25
                      }
                      strokeOpacity={opacity}
                      markerEnd={
                        layout === "constellation"
                          ? `url(#kg-arrow-${rel.relation_type})`
                          : undefined
                      }
                      filter={inShortestPath ? "url(#glow-gold)" : undefined}
                      className="transition-opacity duration-200"
                    />
                  );
                })}

                {/* Outer Radial Work-Output Bars in Orbital Mode */}
                {layout === "radial" &&
                  positionedNodes.map(({ composer, angle }) => {
                    if (angle === undefined) return null;
                    const eraStyle = getEraStyle(composer.era);
                    const wCount = workCountOf(composer);
                    const barLen =
                      6 + Math.sqrt(wCount / maxWorkCount) * 42;
                    const rInner = 222;
                    const x1 = W / 2 + Math.cos(angle) * rInner;
                    const y1 = H / 2 + Math.sin(angle) * rInner;
                    const x2 = W / 2 + Math.cos(angle) * (rInner + barLen);
                    const y2 = H / 2 + Math.sin(angle) * (rInner + barLen);
                    const dimmed =
                      connectedNodeIds !== null &&
                      !connectedNodeIds.has(composer.id);

                    return (
                      <line
                        key={`bar-${composer.id}`}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={eraStyle.hex}
                        strokeWidth={3.2}
                        strokeLinecap="round"
                        strokeOpacity={dimmed ? 0.14 : 0.82}
                      />
                    );
                  })}

                {/* Composer Portrait Nodes */}
                {positionedNodes.map(({ composer, x, y, angle }) => {
                  const eraStyle = getEraStyle(composer.era);
                  const deg = degreeById.get(composer.id) ?? 1;
                  const isSelected = selectedId === composer.id;
                  const isInPath = shortestPathIds?.includes(composer.id);
                  const isCenter =
                    layout === "lineage" && selectedId === composer.id;
                  const r = isCenter
                    ? 34
                    : layout === "radial"
                      ? 13
                      : Math.min(25, 14 + Math.sqrt(deg) * 2.4);

                  const isDimmed =
                    connectedNodeIds !== null &&
                    !connectedNodeIds.has(composer.id);
                  const lastName = composer.sort_name.split(",")[0];

                  return (
                    <g
                      key={composer.id}
                      transform={`translate(${x}, ${y})`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        didDragNodeRef.current = false;
                        dragOriginRef.current = { x: e.clientX, y: e.clientY };
                        if (layout === "constellation") {
                          draggingNodeIdRef.current = composer.id;
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (didDragNodeRef.current) {
                          setSelectedId(composer.id);
                          didDragNodeRef.current = false;
                          return;
                        }
                        setSelectedId((prev) =>
                          prev === composer.id && layout !== "lineage"
                            ? null
                            : composer.id
                        );
                      }}
                      onMouseEnter={() => setHoveredId(composer.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      opacity={isDimmed ? 0.16 : 1}
                      className="cursor-pointer transition-opacity duration-200"
                    >
                      {/* Outer Halo on Selected / Path */}
                      {(isSelected || isInPath) && (
                        <circle
                          r={r + 7}
                          fill="none"
                          stroke={isInPath ? "#34d399" : "#d4af6a"}
                          strokeWidth={2}
                          strokeOpacity={0.85}
                          filter="url(#glow-gold)"
                        />
                      )}

                      {/* Dark Backing Circle */}
                      <circle
                        r={r}
                        fill="#1c1915"
                        stroke={isInPath ? "#34d399" : eraStyle.hex}
                        strokeWidth={isSelected ? 3 : 2}
                      />

                      {/* Initials Fallback underneath image */}
                      <text
                        textAnchor="middle"
                        dy="0.35em"
                        fontSize={r * 0.56}
                        fontWeight="700"
                        fill={eraStyle.hex}
                        style={{ fontFamily: "var(--font-serif)" }}
                      >
                        {getInitials(composer.name)}
                      </text>

                      {/* Clipped Composer Avatar Portrait */}
                      {composer.avatar_url && (
                        <image
                          href={composer.avatar_url}
                          x={-r}
                          y={-r}
                          width={r * 2}
                          height={r * 2}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath={`url(#avatar-clip-${composer.id})`}
                        />
                      )}

                      {/* Crisp Ring Overlay */}
                      <circle
                        r={r}
                        fill="none"
                        stroke={
                          isSelected
                            ? "#f3efe6"
                            : isInPath
                              ? "#34d399"
                              : eraStyle.hex
                        }
                        strokeWidth={isSelected ? 2.6 : 1.8}
                      />

                      {/* Node Name Label */}
                      {layout === "radial" && angle !== undefined ? (
                        <text
                          transform={`rotate(${(angle * 180) / Math.PI}) translate(${
                            Math.cos(angle) >= -0.001 ? 66 : -66
                          }, 0) ${Math.cos(angle) < -0.001 ? "rotate(180)" : ""}`}
                          textAnchor={Math.cos(angle) >= -0.001 ? "start" : "end"}
                          dy="0.32em"
                          fontSize="9"
                          fontWeight={isSelected ? "700" : "500"}
                          fill={isSelected ? "#f3efe6" : "#a8a29e"}
                        >
                          {lastName}
                        </text>
                      ) : (
                        <g transform={`translate(0, ${r + 13})`}>
                          <rect
                            x={-42}
                            y={-8.5}
                            width={84}
                            height={16.5}
                            rx={8}
                            fill={isSelected ? "#d4af6a" : "#151310"}
                            fillOpacity={0.92}
                            stroke={isSelected ? "#f3efe6" : "#2f2a24"}
                            strokeWidth={0.8}
                          />
                          <text
                            textAnchor="middle"
                            dy="0.28em"
                            fontSize="9.5"
                            fontWeight={isSelected ? "700" : "500"}
                            fill={isSelected ? "#11100e" : "#e7e2d8"}
                          >
                            {lastName.slice(0, 13)}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Era Color Footer Legend */}
          <div className="px-4 py-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-400">
            <div className="flex flex-wrap items-center gap-3">
              {ERA_ORDER.filter((era) =>
                graphComposers.some((c) => c.era === era)
              ).map((era) => {
                const s = getEraStyle(era);
                return (
                  <span key={era} className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: s.hex }}
                    />
                    {era}
                  </span>
                );
              })}
            </div>
            <span className="font-mono text-[10px] text-stone-500">
              {positionedNodes.length} avatars · {visibleRelations.length} edges
            </span>
          </div>
        </div>

        {/* Right-Hand Glassmorphic Knowledge Inspector & Path Finder (4 cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-[#191714] rounded-3xl border border-stone-200/90 dark:border-stone-800/90 p-5 sm:p-6 shadow-sm space-y-5">
          {selectedComposer ? (
            <>
              {/* Composer Identity Header */}
              <div className="flex items-start gap-3.5">
                <ComposerAvatar
                  name={selectedComposer.name}
                  avatarUrl={selectedComposer.avatar_url}
                  era={selectedComposer.era}
                  size="lg"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9a7432] dark:text-[#d4af6a] block">
                    {selectedComposer.era} · {selectedComposer.nationality}
                  </span>
                  <h3 className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6] leading-tight">
                    {selectedComposer.name}
                  </h3>
                  <p className="text-xs font-mono text-stone-500 dark:text-stone-400">
                    {formatLifespan(
                      selectedComposer.birth_year,
                      selectedComposer.death_year
                    )}
                    {selectedComposer.birth_place
                      ? ` · ${selectedComposer.birth_place}`
                      : ""}
                  </p>
                </div>
              </div>

              {/* 4 KPI Insight Tiles (inspired by Image 6) */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800">
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 block">
                    Cataloged Works
                  </span>
                  <span className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6]">
                    {workCountOf(selectedComposer)}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800">
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 block">
                    2-Hop Reach
                  </span>
                  <span className="font-serif text-xl font-bold text-[#9a7432] dark:text-[#d4af6a]">
                    {selectedStats.twoHopReach} composers
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800">
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 block">
                    Mentors &amp; Roots
                  </span>
                  <span className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6]">
                    {selectedStats.incoming.length}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800">
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 block">
                    Students &amp; Heirs
                  </span>
                  <span className="font-serif text-xl font-bold text-stone-900 dark:text-[#f3efe6]">
                    {selectedStats.outgoing.length}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/composers/${selectedComposer.slug}`}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-white dark:text-[#11100e] text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  Explore Works
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
                {layout !== "lineage" && (
                  <button
                    type="button"
                    onClick={() => setLayout("lineage")}
                    className="px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:border-[#d4af6a] cursor-pointer"
                  >
                    Isolate Fan
                  </button>
                )}
              </div>

              {/* Six-Degrees Lineage Path Finder */}
              <div className="p-3.5 rounded-2xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/80 dark:border-stone-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                    <Route className="w-3.5 h-3.5 text-emerald-500" />
                    Trace Lineage Chain To...
                  </span>
                  {pathTargetId && (
                    <button
                      type="button"
                      onClick={() => setPathTargetId("")}
                      className="text-[11px] text-stone-400 hover:text-stone-800 dark:hover:text-white cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <SelectMenu
                  value={pathTargetId}
                  onChange={setPathTargetId}
                  ariaLabel="Select target composer for lineage path"
                  options={[
                    { value: "", label: "Choose another composer..." },
                    ...graphComposers
                      .filter((c) => c.id !== selectedComposer.id)
                      .sort((a, b) => a.sort_name.localeCompare(b.sort_name))
                      .map((c) => ({ value: String(c.id), label: c.name })),
                  ]}
                />

                {pathTargetId &&
                  (shortestPathIds ? (
                    <div className="pt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      {shortestPathIds.map((id, idx) => {
                        const c = composerById.get(id);
                        if (!c) return null;
                        return (
                          <span key={id} className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedId(c.id)}
                              className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-medium cursor-pointer"
                            >
                              {c.sort_name.split(",")[0]}
                            </button>
                            {idx < shortestPathIds.length - 1 && (
                              <span className="text-stone-400">→</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-500">
                      No connected path between these two composers under current
                      filters.
                    </p>
                  ))}
              </div>

              {/* Outgoing & Incoming Connections */}
              <div className="max-h-72 overflow-y-auto space-y-4 pr-1">
                {selectedStats.outgoing.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                      Students &amp; Influenced ({selectedStats.outgoing.length})
                    </h4>
                    {selectedStats.outgoing.map(({ relation, other }) => {
                      const meta = RELATION_META[relation.relation_type];
                      return (
                        <button
                          key={relation.id}
                          type="button"
                          onClick={() => setSelectedId(other.id)}
                          className="w-full text-left p-2.5 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800 hover:border-[#d4af6a]/60 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ComposerAvatar
                              name={other.name}
                              avatarUrl={other.avatar_url}
                              era={other.era}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                                {other.name}
                              </p>
                              <p className="text-[10px] text-stone-500">
                                {formatLifespan(other.birth_year, other.death_year)}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${meta?.badgeClass}`}
                          >
                            {meta?.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedStats.incoming.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                      Teachers &amp; Roots ({selectedStats.incoming.length})
                    </h4>
                    {selectedStats.incoming.map(({ relation, other }) => {
                      const meta = RELATION_META[relation.relation_type];
                      return (
                        <button
                          key={relation.id}
                          type="button"
                          onClick={() => setSelectedId(other.id)}
                          className="w-full text-left p-2.5 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800 hover:border-[#d4af6a]/60 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ComposerAvatar
                              name={other.name}
                              avatarUrl={other.avatar_url}
                              era={other.era}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                                {other.name}
                              </p>
                              <p className="text-[10px] text-stone-500">
                                {formatLifespan(other.birth_year, other.death_year)}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${meta?.badgeClass}`}
                          >
                            {meta?.reverseLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-6 space-y-4">
              <div className="w-11 h-11 rounded-2xl bg-[#1a1816] dark:bg-[#d4af6a]/15 text-[#d4af6a] flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6]">
                  Interactive Knowledge Inspector
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                  Click any composer portrait in the graph to inspect their
                  teachers, students, 2-hop network reach, or trace shortest
                  multi-generation lineage chains.
                </p>
              </div>

              <div className="pt-2 space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 block">
                  Most Connected Lineage Hubs
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[...graphComposers]
                    .sort(
                      (a, b) =>
                        (degreeById.get(b.id) ?? 0) -
                        (degreeById.get(a.id) ?? 0)
                    )
                    .slice(0, 8)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 hover:border-[#d4af6a] text-xs font-medium text-stone-800 dark:text-stone-200 cursor-pointer"
                      >
                        {c.name}
                        <span className="font-mono text-[10px] text-[#9a7432] dark:text-[#d4af6a]">
                          {degreeById.get(c.id) ?? 0}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
