"use client";

import { useMemo, useState } from "react";
import { Layers, RotateCcw } from "lucide-react";
import { ERA_ORDER, getEraStyle } from "@/lib/constants";

export interface EraNatGenreRow {
  era: string;
  nationality: string;
  genre: string;
  count: number;
}

interface AlluvialFlowChartProps {
  flows: EraNatGenreRow[];
  totalWorks: number;
}

const SVG_W = 1080;
const SVG_H = 620;
const COL_X = [165, 520, 895] as const;
const NODE_W = 14;
const TOP_PAD = 44;
const BOT_PAD = 28;
const NODE_GAP = 8;

interface FlowNode {
  id: string;
  col: 0 | 1 | 2;
  label: string;
  total: number;
  x: number;
  y: number;
  h: number;
  color: string;
}

interface FlowRibbon {
  key: string;
  sourceId: string;
  targetId: string;
  x0: number;
  y0: number;
  h0: number;
  x1: number;
  y1: number;
  h1: number;
  color: string;
  value: number;
}

const GENRE_COLORS: Record<string, string> = {
  Chamber: "#d4af6a",
  "Orchestral": "#e07a5f",
  "Piano Solo": "#81b29a",
  "Choral & Vocal": "#c084fc",
  Opera: "#f472b6",
  Concerto: "#f59e0b",
  Symphony: "#fb7185",
  "Solo Instrumental": "#38bdf8",
  Sacred: "#a78bfa",
  "Stage & Incidental": "#fb923c",
  Ballet: "#34d399",
};

export function AlluvialFlowChart({
  flows,
  totalWorks,
}: AlluvialFlowChartProps) {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [hoveredRibbon, setHoveredRibbon] = useState<FlowRibbon | null>(null);

  const { nodes, ribbons } = useMemo(() => {
    // Keep top 12 nationalities & top 10 genres so ribbons stay crisp and legible
    const natTotals = new Map<string, number>();
    const genreTotals = new Map<string, number>();

    for (const r of flows) {
      const nat = r.nationality.trim() || "Other";
      natTotals.set(nat, (natTotals.get(nat) ?? 0) + r.count);
      genreTotals.set(r.genre, (genreTotals.get(r.genre) ?? 0) + r.count);
    }

    const topNats = new Set(
      Array.from(natTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([k]) => k)
    );
    const topGenres = new Set(
      Array.from(genreTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([k]) => k)
    );

    const normalized = flows.map((r) => {
      const natRaw = r.nationality.trim() || "Other";
      return {
        era: r.era,
        nat: topNats.has(natRaw) ? natRaw : "Other Schools",
        genre: topGenres.has(r.genre) ? r.genre : "Other Genres",
        count: r.count,
      };
    });

    const col0Map = new Map<string, number>();
    const col1Map = new Map<string, number>();
    const col2Map = new Map<string, number>();
    const link01 = new Map<string, { s: string; t: string; v: number; era: string }>();
    const link12 = new Map<
      string,
      { s: string; t: string; v: number; dominantEra: string; eraWeights: Map<string, number> }
    >();

    for (const row of normalized) {
      col0Map.set(row.era, (col0Map.get(row.era) ?? 0) + row.count);
      col1Map.set(row.nat, (col1Map.get(row.nat) ?? 0) + row.count);
      col2Map.set(row.genre, (col2Map.get(row.genre) ?? 0) + row.count);

      const k01 = `${row.era}||${row.nat}`;
      const prev01 = link01.get(k01);
      if (prev01) prev01.v += row.count;
      else link01.set(k01, { s: row.era, t: row.nat, v: row.count, era: row.era });

      const k12 = `${row.nat}||${row.genre}`;
      const prev12 = link12.get(k12);
      if (prev12) {
        prev12.v += row.count;
        prev12.eraWeights.set(
          row.era,
          (prev12.eraWeights.get(row.era) ?? 0) + row.count
        );
      } else {
        const ew = new Map<string, number>([[row.era, row.count]]);
        link12.set(k12, {
          s: row.nat,
          t: row.genre,
          v: row.count,
          dominantEra: row.era,
          eraWeights: ew,
        });
      }
    }

    for (const l of link12.values()) {
      let bestEra = l.dominantEra;
      let bestW = 0;
      for (const [e, w] of l.eraWeights.entries()) {
        if (w > bestW) {
          bestW = w;
          bestEra = e;
        }
      }
      l.dominantEra = bestEra;
    }

    const col0Entries = ERA_ORDER.filter((e) => (col0Map.get(e) ?? 0) > 0).map(
      (e) => [e, col0Map.get(e)!] as [string, number]
    );
    const col1Entries = Array.from(col1Map.entries()).sort((a, b) => b[1] - a[1]);
    const col2Entries = Array.from(col2Map.entries()).sort((a, b) => b[1] - a[1]);

    function layoutColumn(
      entries: [string, number][],
      col: 0 | 1 | 2,
      colorFn: (label: string) => string
    ): FlowNode[] {
      const sum = entries.reduce((acc, [, v]) => acc + v, 0) || 1;
      const availH =
        SVG_H - TOP_PAD - BOT_PAD - Math.max(0, entries.length - 1) * NODE_GAP;
      let y = TOP_PAD;
      return entries.map(([label, total]) => {
        const h = Math.max(6, (total / sum) * availH);
        const node: FlowNode = {
          id: `${col}:${label}`,
          col,
          label,
          total,
          x: COL_X[col],
          y,
          h,
          color: colorFn(label),
        };
        y += h + NODE_GAP;
        return node;
      });
    }

    const n0 = layoutColumn(col0Entries, 0, (era) => getEraStyle(era).hex);
    const n1 = layoutColumn(col1Entries, 1, () => "#d4af6a");
    const n2 = layoutColumn(
      col2Entries,
      2,
      (g) => GENRE_COLORS[g] ?? "#a8a29e"
    );

    const allNodes = [...n0, ...n1, ...n2];
    const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

    // Track vertical offsets inside each node bar
    const outOffset = new Map<string, number>();
    const inOffset = new Map<string, number>();

    const allRibbons: FlowRibbon[] = [];

    const sorted01 = Array.from(link01.values()).sort((a, b) => b.v - a.v);
    for (const l of sorted01) {
      const sNode = nodeMap.get(`0:${l.s}`);
      const tNode = nodeMap.get(`1:${l.t}`);
      if (!sNode || !tNode) continue;

      const h0 = (l.v / sNode.total) * sNode.h;
      const h1 = (l.v / tNode.total) * tNode.h;
      const y0 = sNode.y + (outOffset.get(sNode.id) ?? 0);
      const y1 = tNode.y + (inOffset.get(tNode.id) ?? 0);
      outOffset.set(sNode.id, (outOffset.get(sNode.id) ?? 0) + h0);
      inOffset.set(tNode.id, (inOffset.get(tNode.id) ?? 0) + h1);

      allRibbons.push({
        key: `01:${l.s}->${l.t}`,
        sourceId: sNode.id,
        targetId: tNode.id,
        x0: sNode.x + NODE_W,
        y0,
        h0,
        x1: tNode.x,
        y1,
        h1,
        color: getEraStyle(l.era).hex,
        value: l.v,
      });
    }

    const sorted12 = Array.from(link12.values()).sort((a, b) => b.v - a.v);
    for (const l of sorted12) {
      const sNode = nodeMap.get(`1:${l.s}`);
      const tNode = nodeMap.get(`2:${l.t}`);
      if (!sNode || !tNode) continue;

      const h0 = (l.v / sNode.total) * sNode.h;
      const h1 = (l.v / tNode.total) * tNode.h;
      const y0 = sNode.y + (outOffset.get(sNode.id) ?? 0);
      const y1 = tNode.y + (inOffset.get(tNode.id) ?? 0);
      outOffset.set(sNode.id, (outOffset.get(sNode.id) ?? 0) + h0);
      inOffset.set(tNode.id, (inOffset.get(tNode.id) ?? 0) + h1);

      allRibbons.push({
        key: `12:${l.s}->${l.t}`,
        sourceId: sNode.id,
        targetId: tNode.id,
        x0: sNode.x + NODE_W,
        y0,
        h0,
        x1: tNode.x,
        y1,
        h1,
        color: getEraStyle(l.dominantEra).hex,
        value: l.v,
      });
    }

    return { nodes: allNodes, ribbons: allRibbons };
  }, [flows]);

  // Transitive highlight across all 3 columns when any node is selected
  const highlightedRibbons = useMemo(() => {
    if (!activeNodeId) return null;
    const direct = new Set<string>();
    const middleTouches = new Set<string>();

    for (const r of ribbons) {
      if (r.sourceId === activeNodeId || r.targetId === activeNodeId) {
        direct.add(r.key);
        if (activeNodeId.startsWith("0:")) middleTouches.add(r.targetId);
        if (activeNodeId.startsWith("2:")) middleTouches.add(r.sourceId);
      }
    }
    // Also light up secondary hop lightly if Era or Genre selected
    for (const r of ribbons) {
      if (middleTouches.has(r.sourceId) || middleTouches.has(r.targetId)) {
        direct.add(r.key);
      }
    }
    return direct;
  }, [activeNodeId, ribbons]);

  function ribbonPath(r: FlowRibbon) {
    const cx = (r.x0 + r.x1) / 2;
    const top0 = r.y0;
    const bot0 = r.y0 + Math.max(1.2, r.h0);
    const top1 = r.y1;
    const bot1 = r.y1 + Math.max(1.2, r.h1);
    return `M ${r.x0} ${top0} C ${cx} ${top0}, ${cx} ${top1}, ${r.x1} ${top1} L ${r.x1} ${bot1} C ${cx} ${bot1}, ${cx} ${bot0}, ${r.x0} ${bot0} Z`;
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h2 className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6] flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#9a7432] dark:text-[#d4af6a]" />
            Repertoire Stream: Era → Musical School → Genre
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Click any Era, National School, or Genre pillar to trace how{" "}
            {totalWorks.toLocaleString()} cataloged works flow across history
          </p>
        </div>

        {activeNodeId && (
          <button
            type="button"
            onClick={() => setActiveNodeId(null)}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#9a7432] dark:text-[#d4af6a] hover:underline cursor-pointer self-start"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset stream focus
          </button>
        )}
      </div>

      <div className="rounded-3xl bg-[#12100e] border border-stone-800/90 shadow-lg overflow-hidden relative">
        {/* Top HUD readout */}
        <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
          <div className="flex items-center gap-6 font-mono text-[11px] uppercase tracking-wider text-stone-300">
            <span>① Historical Era</span>
            <span>→</span>
            <span>② National School</span>
            <span>→</span>
            <span>③ Repertoire Genre</span>
          </div>
          {hoveredRibbon ? (
            <span className="font-mono text-xs text-[#e3c27d]">
              {hoveredRibbon.sourceId.slice(2)} →{" "}
              {hoveredRibbon.targetId.slice(2)}:{" "}
              <strong>{hoveredRibbon.value.toLocaleString()} works</strong>
            </span>
          ) : (
            <span className="text-[11px] text-stone-500">
              Hover any ribbon or click a pillar to isolate streams
            </span>
          )}
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="w-full min-w-[780px] h-auto select-none"
            role="img"
            aria-label="Alluvial flow diagram from historical era to nationality to musical genre"
          >
            {/* Column Headers */}
            {[
              { x: COL_X[0], title: "① ERA", align: "end" as const, dx: -8 },
              {
                x: COL_X[1] + NODE_W / 2,
                title: "② SCHOOL / ORIGIN",
                align: "middle" as const,
                dx: 0,
              },
              {
                x: COL_X[2] + NODE_W,
                title: "③ GENRE",
                align: "start" as const,
                dx: 8,
              },
            ].map((h) => (
              <text
                key={h.title}
                x={h.x + h.dx}
                y={24}
                textAnchor={h.align}
                fontSize="10"
                fontWeight="700"
                letterSpacing="0.14em"
                fill="#a69e92"
              >
                {h.title}
              </text>
            ))}

            {/* Ribbons */}
            {ribbons.map((r) => {
              const isHighlighted =
                !highlightedRibbons || highlightedRibbons.has(r.key);
              const isHovered = hoveredRibbon?.key === r.key;
              const opacity = isHovered
                ? 0.88
                : !highlightedRibbons
                  ? 0.34
                  : isHighlighted
                    ? 0.68
                    : 0.04;

              return (
                <path
                  key={r.key}
                  d={ribbonPath(r)}
                  fill={r.color}
                  fillOpacity={opacity}
                  onMouseEnter={() => setHoveredRibbon(r)}
                  onMouseLeave={() => setHoveredRibbon(null)}
                  onClick={() =>
                    setActiveNodeId((prev) =>
                      prev === r.sourceId ? null : r.sourceId
                    )
                  }
                  className="cursor-pointer transition-opacity duration-200"
                />
              );
            })}

            {/* Node Pillars & Labels */}
            {nodes.map((n) => {
              const isSelected = activeNodeId === n.id;
              const labelLeft = n.col === 0;
              const labelX = labelLeft ? n.x - 10 : n.x + NODE_W + 10;
              const anchor = labelLeft ? "end" : "start";

              return (
                <g
                  key={n.id}
                  onClick={() =>
                    setActiveNodeId((prev) => (prev === n.id ? null : n.id))
                  }
                  className="cursor-pointer group"
                >
                  <rect
                    x={n.x}
                    y={n.y}
                    width={NODE_W}
                    height={n.h}
                    rx={3}
                    fill={n.color}
                    stroke={isSelected ? "#ffffff" : "#11100e"}
                    strokeWidth={isSelected ? 2 : 0.8}
                  />
                  {n.h >= 12 && (
                    <text
                      x={labelX}
                      y={n.y + n.h / 2}
                      dy="0.34em"
                      textAnchor={anchor}
                      fontSize="11"
                      fontWeight={isSelected ? "700" : "500"}
                      fill={isSelected ? "#f3efe6" : "#d6d3d1"}
                    >
                      {n.label}{" "}
                      <tspan fill="#78716c" fontSize="9.5">
                        ({n.total})
                      </tspan>
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}
