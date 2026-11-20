import { supabase } from "@/lib/supabase";
import type { Composer, ComposerRelation, Work } from "@/types/database";
import { InfluenceGraph } from "@/components/InfluenceGraph";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const [composersRes, worksRes, relationsRes] = await Promise.all([
    supabase
      .from("composers")
      .select("*")
      .order("birth_year", { ascending: true }),
    supabase.from("works").select("*"),
    supabase.from("composer_relations").select("*"),
  ]);

  const composers = (composersRes.data ?? []) as Composer[];
  const works = (worksRes.data ?? []) as Work[];
  const relations = (relationsRes.data ?? []) as ComposerRelation[];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12">
      {/* Header */}
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a7432]">
          Visual Atlas &amp; Dashboard
        </span>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#1a1816]">
          Influence Graph &amp; Historical Analytics
        </h1>
        <p className="text-sm text-stone-600 max-w-2xl">
          Explore teacher–student lineages, artistic influences, rivalries, and
          historical lifespan overlaps across the database.
        </p>
      </div>

      {/* Influence Graph Map */}
      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-2xl font-bold text-stone-900">
            Composer Influence &amp; Lineage Map
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            {composers.length} composers connected by {relations.length}{" "}
            documented historical relationships
          </p>
        </div>

        <InfluenceGraph composers={composers} relations={relations} />
      </section>

      {/* Timeline & Charts */}
      <section>
        <AnalyticsDashboard composers={composers} works={works} />
      </section>
    </div>
  );
}
