import { supabase } from "@/lib/supabase";
import type { ComposerRelation, ComposerWithWorkCount } from "@/types/database";
import { KnowledgeGraphAtlas } from "@/components/KnowledgeGraphAtlas";
import {
  AlluvialFlowChart,
  type EraNatGenreRow,
} from "@/components/AlluvialFlowChart";
import {
  AnalyticsDashboard,
  type GenreAggregate,
  type QuarterCenturyBucket,
} from "@/components/AnalyticsDashboard";

export const dynamic = "force-dynamic";

interface ExploreAggregatesPayload {
  total_works?: number;
  imslp_works?: number;
  essential_works?: number;
  by_genre?: GenreAggregate[];
  era_nat_genre?: EraNatGenreRow[];
  by_quarter_century?: QuarterCenturyBucket[];
}

export default async function ExplorePage() {
  const [composersRes, relationsRes, aggRes] = await Promise.all([
    supabase
      .from("composers")
      .select("*, works(count)")
      .order("birth_year", { ascending: true }),
    supabase.from("composer_relations").select("*"),
    supabase.rpc("get_explore_aggregates"),
  ]);

  const composers = (composersRes.data ?? []) as ComposerWithWorkCount[];
  const relations = (relationsRes.data ?? []) as ComposerRelation[];
  const agg = (aggRes.data ?? {}) as ExploreAggregatesPayload;

  const totalWorks = agg.total_works ?? 0;
  const imslpWorks = agg.imslp_works ?? 0;
  const essentialWorks = agg.essential_works ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12">
      {/* Header + Live Atlas KPIs */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7432] dark:text-[#d4af6a]">
            Interactive Knowledge Graph &amp; Historical Atlas
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#1a1816] dark:text-[#f3efe6]">
            Musical Lineages, Streams &amp; Timelines
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 max-w-2xl">
            Explore dynamic portrait constellations, multi-generation teacher–student
            trees, 360° chronological chord rings, and historical repertoire flows.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
          {[
            { label: "Composers", val: composers.length.toLocaleString() },
            { label: "Lineage Links", val: relations.length.toLocaleString() },
            { label: "Works Mapped", val: totalWorks.toLocaleString() },
            { label: "IMSLP Scores", val: imslpWorks.toLocaleString() },
          ].map((stat) => (
            <div
              key={stat.label}
              className="px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#191714] border border-stone-200/90 dark:border-stone-800/90"
            >
              <span className="font-serif text-lg font-bold text-stone-900 dark:text-[#f3efe6] block">
                {stat.val}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-stone-400">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 1. Interactive Dynamic Knowledge Graph (Force / Lineage Fan / Orbital Ring) */}
      <section>
        <KnowledgeGraphAtlas composers={composers} relations={relations} />
      </section>

      {/* 2. 3-Stage Alluvial Stream (Era -> National School -> Genre) */}
      {agg.era_nat_genre && agg.era_nat_genre.length > 0 && (
        <AlluvialFlowChart
          flows={agg.era_nat_genre}
          totalWorks={totalWorks || essentialWorks}
        />
      )}

      {/* 3. Interactive Lifespan Crosshair Timeline & Century Velocity */}
      <section>
        <AnalyticsDashboard
          composers={composers}
          totalWorks={totalWorks}
          genreCounts={agg.by_genre ?? []}
          quarterCenturyCounts={agg.by_quarter_century ?? []}
        />
      </section>
    </div>
  );
}
