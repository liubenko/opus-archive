import { supabase } from "@/lib/supabase";
import type { WorkWithComposer } from "@/types/database";
import { WorksDirectory } from "@/components/WorksDirectory";

export const revalidate = 60;

export default async function WorksIndexPage() {
  const { data } = await supabase
    .from("works")
    .select(
      "*, composers(id, name, slug, era, nationality, avatar_url)"
    )
    .order("year_composed", { ascending: true });

  const works = (data ?? []) as WorkWithComposer[];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a7432]">
          Master Catalog
        </span>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#1a1816]">
          Classical Works &amp; Opus Index
        </h1>
        <p className="text-sm text-stone-600 max-w-2xl">
          Search and filter across every cataloged composition by opus or
          thematic number (Op., BWV, K., Hob., RV, D., S., WWV, L.), genre, era,
          key signature, or instrumentation.
        </p>
      </div>

      <WorksDirectory works={works} />
    </div>
  );
}
