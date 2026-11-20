"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RotateCcw, Sparkles } from "lucide-react";
import type { Composer, ComposerRelation } from "@/types/database";
import {
  ERA_ORDER,
  RELATION_META,
  formatLifespan,
  getEraStyle,
  getInitials,
} from "@/lib/constants";
import { ComposerAvatar } from "./ComposerAvatar";

interface InfluenceGraphProps {
  composers: Composer[];
  relations: ComposerRelation[];
}

const SVG_WIDTH = 1040;
const SVG_HEIGHT = 600;
const PAD_X = 86;
const PAD_Y = 72;

export function InfluenceGraph({ composers, relations }: InfluenceGraphProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    () => new Set(Object.keys(RELATION_META))
  );

  const activeId = hoveredId ?? selectedId;

  // Deterministic chronological-layered layout (X = birth year / era flow, Y = nicely staggered rows)
  const nodes = useMemo(() => {
    const sorted = [...composers].sort((a, b) => a.birth_year - b.birth_year);
    const minYear = Math.min(...sorted.map((c) => c.birth_year));
    const maxYear = Math.max(...sorted.map((c) => c.birth_year));
    const yearSpan = Math.max(1, maxYear - minYear);

    // Group into columns by era/proximity to avoid overlapping labels
    const ySlots = [0.16, 0.42, 0.68, 0.88, 0.28, 0.56, 0.8];

    return sorted.map((composer, index) => {
      const normalizedX = (composer.birth_year - minYear) / yearSpan;
      // Blend chronological X (75%) with even rank spacing (25%) to avoid crowded romantic clusters
      const rankX = sorted.length > 1 ? index / (sorted.length - 1) : 0.5;
      const blendedX = normalizedX * 0.62 + rankX * 0.38;

      const x = PAD_X + blendedX * (SVG_WIDTH - PAD_X * 2);
      const yRatio = ySlots[index % ySlots.length];
      const y = PAD_Y + yRatio * (SVG_HEIGHT - PAD_Y * 2);

      return { composer, x, y };
    });
  }, [composers]);

  const nodeById = useMemo(() => {
    const map = new Map<number, { composer: Composer; x: number; y: number }>();
    for (const n of nodes) map.set(n.composer.id, n);
    return map;
  }, [nodes]);

  const visibleRelations = useMemo(
    () => relations.filter((r) => activeTypes.has(r.relation_type)),
    [relations, activeTypes]
  );

  const connectedNodeIds = useMemo(() => {
    if (activeId === null) return null;
    const set = new Set<number>([activeId]);
    for (const r of visibleRelations) {
      if (r.source_composer_id === activeId) set.add(r.target_composer_id);
      if (r.target_composer_id === activeId) set.add(r.source_composer_id);
    }
    return set;
  }, [activeId, visibleRelations]);

  const selectedComposer = selectedId ? nodeById.get(selectedId)?.composer : null;

  const selectedEdges = useMemo(() => {
    if (!selectedId) return { outgoing: [], incoming: [] };
    const outgoing = visibleRelations
      .filter((r) => r.source_composer_id === selectedId)
      .map((r) => ({
        relation: r,
        other: nodeById.get(r.target_composer_id)?.composer,
      }))
      .filter((item): item is { relation: ComposerRelation; other: Composer } =>
        Boolean(item.other)
      );

    const incoming = visibleRelations
      .filter((r) => r.target_composer_id === selectedId)
      .map((r) => ({
        relation: r,
        other: nodeById.get(r.source_composer_id)?.composer,
      }))
      .filter((item): item is { relation: ComposerRelation; other: Composer } =>
        Boolean(item.other)
      );

    return { outgoing, incoming };
  }, [selectedId, visibleRelations, nodeById]);

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
      {/* Legend & Filter Chips */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-stone-200/90 px-4 py-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-400 mr-1">
            Connections:
          </span>
          {Object.entries(RELATION_META).map(([key, meta]) => {
            const count = relations.filter((r) => r.relation_type === key).length;
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
                    : "bg-stone-50 text-stone-400 border-stone-200 opacity-60"
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

        {selectedId !== null && (
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-900 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset selection
          </button>
        )}
      </div>

      {/* Main Graph + Inspector Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200/90 shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 border-b border-stone-100 flex items-center justify-between text-xs text-stone-500">
            <span>
              Click any composer node to inspect influences &amp; lineages
            </span>
            <span className="font-mono text-[11px] text-stone-400">
              1678 Baroque → 1971 20th Century
            </span>
          </div>

          <div className="w-full overflow-x-auto bg-gradient-to-br from-[#fdfcf9] via-[#faf7f0] to-[#f6f1e6]">
            <svg
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              className="w-full min-w-[740px] h-auto select-none"
              role="img"
              aria-label="Classical composer influence and lineage network graph"
            >
              <defs>
                {Object.entries(RELATION_META).map(([key, meta]) => (
                  <marker
                    key={key}
                    id={`arrow-${key}`}
                    viewBox="0 0 10 10"
                    refX="23"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill={meta.hex} />
                  </marker>
                ))}
              </defs>

              {/* Subtle vertical era bands */}
              {[0.18, 0.42, 0.72].map((ratio, idx) => (
                <line
                  key={idx}
                  x1={SVG_WIDTH * ratio}
                  y1={24}
                  x2={SVG_WIDTH * ratio}
                  y2={SVG_HEIGHT - 24}
                  stroke="#e7e2d8"
                  strokeDasharray="4 4"
                />
              ))}

              {/* Edges */}
              {visibleRelations.map((rel) => {
                const source = nodeById.get(rel.source_composer_id);
                const target = nodeById.get(rel.target_composer_id);
                if (!source || !target) return null;

                const meta = RELATION_META[rel.relation_type];
                const isHighlighted =
                  activeId === null ||
                  rel.source_composer_id === activeId ||
                  rel.target_composer_id === activeId;

                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const curveOffset = Math.min(48, Math.hypot(dx, dy) * 0.16);
                const mx = (source.x + target.x) / 2;
                const my = (source.y + target.y) / 2 - curveOffset;

                const isDirected =
                  rel.relation_type === "teacher_of" ||
                  rel.relation_type === "influenced" ||
                  rel.relation_type === "admired";

                return (
                  <path
                    key={rel.id}
                    d={`M ${source.x} ${source.y} Q ${mx} ${my} ${target.x} ${target.y}`}
                    fill="none"
                    stroke={meta?.hex ?? "#78716c"}
                    strokeWidth={
                      activeId !== null && isHighlighted
                        ? 2.4
                        : Math.max(1.1, rel.strength * 0.35)
                    }
                    strokeOpacity={
                      activeId === null ? 0.32 : isHighlighted ? 0.88 : 0.06
                    }
                    strokeDasharray={
                      rel.relation_type === "contemporary_of"
                        ? "4 4"
                        : rel.relation_type === "rival_of"
                        ? "6 3"
                        : undefined
                    }
                    markerEnd={
                      isDirected ? `url(#arrow-${rel.relation_type})` : undefined
                    }
                    className="transition-opacity duration-200"
                  />
                );
              })}

              {/* Nodes */}
              {nodes.map(({ composer, x, y }) => {
                const eraStyle = getEraStyle(composer.era);
                const isSelected = selectedId === composer.id;
                const isDimmed =
                  connectedNodeIds !== null && !connectedNodeIds.has(composer.id);
                const lastName = composer.sort_name.split(",")[0];

                return (
                  <g
                    key={composer.id}
                    transform={`translate(${x}, ${y})`}
                    onClick={() =>
                      setSelectedId((prev) =>
                        prev === composer.id ? null : composer.id
                      )
                    }
                    onMouseEnter={() => setHoveredId(composer.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="cursor-pointer transition-opacity duration-200"
                    opacity={isDimmed ? 0.22 : 1}
                  >
                    {/* Outer halo when selected */}
                    {isSelected && (
                      <circle
                        r={26}
                        fill="none"
                        stroke={eraStyle.hex}
                        strokeWidth={2.5}
                        strokeOpacity={0.5}
                      />
                    )}

                    {/* Node circle */}
                    <circle
                      r={isSelected ? 20 : 17}
                      fill="#ffffff"
                      stroke={eraStyle.hex}
                      strokeWidth={isSelected ? 3.5 : 2.5}
                    />

                    {/* Monogram */}
                    <text
                      textAnchor="middle"
                      dy="0.35em"
                      fontSize="11"
                      fontWeight="700"
                      fill={eraStyle.hex}
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {getInitials(composer.name)}
                    </text>

                    {/* Label pill */}
                    <g transform="translate(0, 31)">
                      <rect
                        x={-44}
                        y={-10}
                        width={88}
                        height={19}
                        rx={9.5}
                        fill={isSelected ? "#1a1816" : "#ffffff"}
                        fillOpacity={isSelected ? 0.95 : 0.9}
                        stroke={isSelected ? "#1a1816" : "#e7e2d8"}
                        strokeWidth={1}
                      />
                      <text
                        textAnchor="middle"
                        dy="0.28em"
                        fontSize="10.5"
                        fontWeight={isSelected ? "600" : "500"}
                        fill={isSelected ? "#faf8f4" : "#1a1816"}
                      >
                        {lastName}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Era Color Key */}
          <div className="px-4 py-2.5 border-t border-stone-100 flex flex-wrap items-center gap-3 text-[11px] text-stone-500">
            <span className="font-semibold text-stone-400 uppercase tracking-wider">
              Eras:
            </span>
            {ERA_ORDER.map((era) => {
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
        </div>

        {/* Right Side Inspector */}
        <div className="bg-white rounded-2xl border border-stone-200/90 p-5 shadow-xs space-y-4">
          {selectedComposer ? (
            <>
              <div className="flex items-start gap-3">
                <ComposerAvatar
                  name={selectedComposer.name}
                  avatarUrl={selectedComposer.avatar_url}
                  era={selectedComposer.era}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif text-lg font-semibold text-stone-900 leading-snug">
                    {selectedComposer.name}
                  </h3>
                  <p className="text-xs text-stone-500">
                    {formatLifespan(
                      selectedComposer.birth_year,
                      selectedComposer.death_year
                    )}{" "}
                    · {selectedComposer.era}
                  </p>
                </div>
              </div>

              <Link
                href={`/composers/${selectedComposer.slug}`}
                className="inline-flex items-center justify-center gap-1.5 w-full px-3.5 py-2 rounded-xl bg-[#1a1816] text-white text-xs font-medium hover:bg-stone-800 transition-colors"
              >
                Open Composer Profile &amp; Works
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>

              {selectedEdges.outgoing.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-stone-100">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                    Outgoing Connections ({selectedEdges.outgoing.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedEdges.outgoing.map(({ relation, other }) => {
                      const meta = RELATION_META[relation.relation_type];
                      return (
                        <div
                          key={relation.id}
                          className="p-2.5 rounded-xl bg-[#faf8f4] border border-stone-200/70 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedId(other.id)}
                              className="font-serif font-semibold text-sm text-stone-900 hover:text-[#9a7432] cursor-pointer text-left"
                            >
                              {other.name}
                            </button>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${meta?.badgeClass}`}
                            >
                              {meta?.label}
                            </span>
                          </div>
                          {relation.description && (
                            <p className="text-xs text-stone-600 leading-relaxed">
                              {relation.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedEdges.incoming.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-stone-100">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                    Incoming Roots ({selectedEdges.incoming.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedEdges.incoming.map(({ relation, other }) => {
                      const meta = RELATION_META[relation.relation_type];
                      return (
                        <div
                          key={relation.id}
                          className="p-2.5 rounded-xl bg-[#faf8f4] border border-stone-200/70 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedId(other.id)}
                              className="font-serif font-semibold text-sm text-stone-900 hover:text-[#9a7432] cursor-pointer text-left"
                            >
                              {other.name}
                            </button>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${meta?.badgeClass}`}
                            >
                              {meta?.reverseLabel}
                            </span>
                          </div>
                          {relation.description && (
                            <p className="text-xs text-stone-600 leading-relaxed">
                              {relation.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-6 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center mx-auto">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-base font-semibold text-stone-900">
                Musical Lineage Inspector
              </h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Select any composer on the map to spotlight their teachers,
                influences, contemporaries, and historical lineage across 300
                years of classical music.
              </p>
              <div className="pt-2 flex flex-wrap justify-center gap-1.5">
                {["Bach", "Beethoven", "Chopin", "Wagner", "Debussy"].map(
                  (shortName) => {
                    const match = composers.find((c) =>
                      c.name.includes(shortName)
                    );
                    if (!match) return null;
                    return (
                      <button
                        key={match.id}
                        type="button"
                        onClick={() => setSelectedId(match.id)}
                        className="px-2.5 py-1 rounded-full text-xs bg-[#faf8f4] border border-stone-200 hover:border-[#9a7432] text-stone-700 cursor-pointer"
                      >
                        Focus {shortName}
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
