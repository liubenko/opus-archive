import { supabase } from "@/lib/supabase";
import type { WorkWithComposer } from "@/types/database";
import { WorksDirectory } from "@/components/WorksDirectory";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function WorksIndexPage() {
  const { data, count } = await supabase
    .from("works")
    .select("*, composers(id, name, slug, era, nationality, avatar_url)", {
      count: "exact",
    })
    .order("is_popular", { ascending: false })
    .order("year_composed", { ascending: true })
    .order("id", { ascending: true })
    .range(0, PAGE_SIZE - 1);

  const initialWorks = (data ?? []) as WorkWithComposer[];
  const initialTotal = count ?? initialWorks.length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a7432] dark:text-[#d4af6a]">
          Master Catalog
        </span>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#1a1816] dark:text-[#f3efe6]">
          Classical Works &amp; Opus Index
        </h1>
        <p className="text-sm text-stone-600 dark:text-stone-400 max-w-2xl">
          Search and filter across all{" "}
          <strong className="text-stone-900 dark:text-stone-200">
            {initialTotal.toLocaleString()}
          </strong>{" "}
          cataloged compositions by opus or thematic number (Op., BWV, K., Hob.,
          RV, D., S., WWV, L.), genre, era, instrument, or IMSLP score
          availability.
        </p>
      </div>

      <WorksDirectory
        initialWorks={initialWorks}
        initialTotal={initialTotal}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
