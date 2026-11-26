"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RotateCcw, Sparkles, Search } from "lucide-react";
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
  const [eraFilter, setEraFilter] = useState<string>("All");
  const [nationalityFilter, setNationalityFilter] = useState<string>("All");
  const [focusSearch, setFocusSearch] = useState<string>("");
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    () => new Set(Object.keys(RELATION_META))
  );

  const activeId = hoveredId ?? selectedId;

  const composerById = useMemo(() => {
    const map = new Map<number, Composer>();
    for (const c of composers) map.set(c.id, c);
    return map;
  }, [composers]);

  const nationalities = useMemo(() => {
    const involvedIds = new Set<number>();
    for (const r of relations) {
      involvedIds.add(r.source_composer_id);
      involvedIds.add(r.target_composer_id);
    }
    return Array.from(
      new Set(
        composers
          .filter((c) => involvedIds.has(c.id))
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

  // Plot composers that participate in at least one visible relation
  const graphComposers = useMemo(() => {
    const involvedIds = new Set<number>();
    for (const r of visibleRelations) {
      involvedIds.add(r.source_composer_id);
      involvedIds.add(r.target_composer_id);
    }
    const list = composers.filter((c) => involvedIds.has(c.id));
    return list.length > 0 ? list : composers.slice(0, 20);
  }, [composers, visibleRelations]);

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

  const nodes = useMemo(() => {
    const sorted = [...graphComposers].sort(
      (a, b) => a.birth_year - b.birth_year
    );
    const minYear = Math.min(...sorted.map((c) => c.birth_year));
    const maxYear = Math.max(...sorted.map((c) => c.birth_year));
    const yearSpan = Math.max(1, maxYear - minYear);

    const ySlots = [0.14, 0.38, 0.64, 0.88, 0.26, 0.52, 0.78];

    return sorted.map((composer, index) => {
      const normalizedX = (composer.birth_year - minYear) / yearSpan;
      const rankX = sorted.length > 1 ? index / (sorted.length - 1) : 0.5;
      const blendedX = normalizedX * 0.6 + rankX * 0.4;

      const x = PAD_X + blendedX * (SVG_WIDTH - PAD_X * 2);
      const yRatio = ySlots[index % ySlots.length];
      const y = PAD_Y + yRatio * (SVG_HEIGHT - PAD_Y * 2);

      return { composer, x, y };
    });
  }, [graphComposers]);

  const nodeById = useMemo(() => {
    const map = new Map<number, { composer: Composer; x: number; y: number }>();
    for (const n of nodes) map.set(n.composer.id, n);
    return map;
  }, [nodes]);

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
      <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 px-4 py-3.5 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-2.5 md:items-center justify-between">
          {/* Focus Composer Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={focusSearch}
              onChange={(e) => setFocusSearch(e.target.value)}
              placeholder="Focus on a composer's lineage (e.g. Bach, Chopin)..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#9a7432] dark:focus:border-[#d4af6a]"
            />
            {focusMatches.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-[#1f1c18] border border-stone-200 dark:border-stone-700 rounded-xl shadow-lg z-30 overflow-hidden">
                {focusMatches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(c.id);
                      setFocusSearch("");
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="font-medium text-stone-900 dark:text-stone-100">
                      {c.name}
                    </span>
                    <span className="text-[10px] text-stone-400">{c.era}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={eraFilter}
              onChange={(e) => {
                setEraFilter(e.target.value);
                setSelectedId(null);
              }}
              aria-label="Filter graph by era"
              className="px-2.5 py-1.5 text-xs font-medium bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 rounded-xl text-stone-700 dark:text-stone-200 cursor-pointer"
            >
              <option value="All" className="dark:bg-[#191714]">
                All Eras
              </option>
              {ERA_ORDER.map((e) => (
                <option key={e} value={e} className="dark:bg-[#191714]">
                  {e}
                </option>
              ))}
            </select>

            <select
              value={nationalityFilter}
              onChange={(e) => {
                setNationalityFilter(e.target.value);
                setSelectedId(null);
              }}
              aria-label="Filter graph by nationality"
              className="px-2.5 py-1.5 text-xs font-medium bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-800 rounded-xl text-stone-700 dark:text-stone-200 cursor-pointer"
            >
              <option value="All" className="dark:bg-[#191714]">
                All Nationalities
              </option>
              {nationalities.map((nat) => (
                <option key={nat} value={nat} className="dark:bg-[#191714]">
                  {nat}
                </option>
              ))}
            </select>

            {(selectedId !== null ||
              eraFilter !== "All" ||
              nationalityFilter !== "All") && (
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setEraFilter("All");
                  setNationalityFilter("All");
                  setFocusSearch("");
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#9a7432] dark:text-[#d4af6a] hover:underline cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 dark:border-stone-800/80">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 mr-1">
              Connections:
            </span>
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
                      : "bg-stone-50 dark:bg-stone-900 text-stone-400 dark:text-stone-600 border-stone-200 dark:border-stone-800 opacity-60"
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

          <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500">
            {graphComposers.length} composers · {visibleRelations.length} links
          </span>
        </div>
      </div>

      {/* Main Graph + Inspector Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
            <span>
              Click any composer node to inspect influences &amp; lineages
            </span>
            <span className="font-mono text-[11px] text-stone-400 dark:text-stone-500">
              Baroque → Classical → Romantic → 20th Century
            </span>
          </div>

          <div className="w-full overflow-x-auto bg-gradient-to-br from-[#fdfcf9] via-[#faf7f0] to-[#f6f1e6] dark:from-[#151311] dark:via-[#12110f] dark:to-[#181511]">
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

              {/* Subtle vertical era dividers */}
              {[0.18, 0.42, 0.72].map((ratio, idx) => (
                <line
                  key={idx}
                  x1={SVG_WIDTH * ratio}
                  y1={24}
                  x2={SVG_WIDTH * ratio}
                  y2={SVG_HEIGHT - 24}
                  stroke="currentColor"
                  className="text-stone-200 dark:text-stone-800"
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
                      activeId === null ? 0.36 : isHighlighted ? 0.92 : 0.08
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
                    opacity={isDimmed ? 0.2 : 1}
                  >
                    {isSelected && (
                      <circle
                        r={26}
                        fill="none"
                        stroke={eraStyle.hex}
                        strokeWidth={2.5}
                        strokeOpacity={0.6}
                      />
                    )}

                    <circle
                      r={isSelected ? 20 : 17}
                      className="fill-white dark:fill-[#1c1916]"
                      stroke={eraStyle.hex}
                      strokeWidth={isSelected ? 3.5 : 2.5}
                    />

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

                    <g transform="translate(0, 31)">
                      <rect
                        x={-44}
                        y={-10}
                        width={88}
                        height={19}
                        rx={9.5}
                        className={
                          isSelected
                            ? "fill-[#1a1816] dark:fill-[#f3efe6] stroke-[#1a1816] dark:stroke-[#f3efe6]"
                            : "fill-white/95 dark:fill-[#1d1a17]/95 stroke-stone-200 dark:stroke-stone-700"
                        }
                        strokeWidth={1}
                      />
                      <text
                        textAnchor="middle"
                        dy="0.28em"
                        fontSize="10.5"
                        fontWeight={isSelected ? "600" : "500"}
                        className={
                          isSelected
                            ? "fill-[#faf8f4] dark:fill-[#11100e]"
                            : "fill-[#1a1816] dark:fill-[#f3efe6]"
                        }
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
          <div className="px-4 py-2.5 border-t border-stone-100 dark:border-stone-800 flex flex-wrap items-center gap-3 text-[11px] text-stone-500 dark:text-stone-400">
            <span className="font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider">
              Eras:
            </span>
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
        </div>

        {/* Right Side Inspector */}
        <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-5 shadow-xs space-y-4">
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
                  <h3 className="font-serif text-lg font-semibold text-stone-900 dark:text-[#f3efe6] leading-snug">
                    {selectedComposer.name}
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
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
                className="inline-flex items-center justify-center gap-1.5 w-full px-3.5 py-2 rounded-xl bg-[#1a1816] dark:bg-[#f3efe6] text-white dark:text-[#11100e] text-xs font-medium hover:opacity-90 transition-opacity"
              >
                Open Composer Profile &amp; Works
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>

              {selectedEdges.outgoing.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                    Outgoing Connections ({selectedEdges.outgoing.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedEdges.outgoing.map(({ relation, other }) => {
                      const meta = RELATION_META[relation.relation_type];
                      return (
                        <div
                          key={relation.id}
                          className="p-2.5 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedId(other.id)}
                              className="font-serif font-semibold text-sm text-stone-900 dark:text-[#f3efe6] hover:text-[#9a7432] dark:hover:text-[#d4af6a] cursor-pointer text-left"
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
                            <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
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
                <div className="space-y-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                    Incoming Roots ({selectedEdges.incoming.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedEdges.incoming.map(({ relation, other }) => {
                      const meta = RELATION_META[relation.relation_type];
                      return (
                        <div
                          key={relation.id}
                          className="p-2.5 rounded-xl bg-[#faf8f4] dark:bg-[#141210] border border-stone-200/70 dark:border-stone-800 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedId(other.id)}
                              className="font-serif font-semibold text-sm text-stone-900 dark:text-[#f3efe6] hover:text-[#9a7432] dark:hover:text-[#d4af6a] cursor-pointer text-left"
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
                            <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
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
              <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-[#d4af6a] border border-amber-200 dark:border-amber-800/70 flex items-center justify-center mx-auto">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-base font-semibold text-stone-900 dark:text-[#f3efe6]">
                Musical Lineage Inspector
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                Select any composer on the map to spotlight their teachers,
                influences, contemporaries, and historical lineage across
                centuries of classical music.
              </p>
              <div className="pt-2 flex flex-wrap justify-center gap-1.5">
                {["Bach", "Beethoven", "Chopin", "Wagner", "Debussy"].map(
                  (shortName) => {
                    const match = graphComposers.find((c) =>
                      c.name.includes(shortName)
                    );
                    if (!match) return null;
                    return (
                      <button
                        key={match.id}
                        type="button"
                        onClick={() => setSelectedId(match.id)}
                        className="px-2.5 py-1 rounded-full text-xs bg-[#faf8f4] dark:bg-[#141210] border border-stone-200 dark:border-stone-700 hover:border-[#9a7432] dark:hover:border-[#d4af6a] text-stone-700 dark:text-stone-200 cursor-pointer"
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
