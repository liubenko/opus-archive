import Link from "next/link";
import { Network, Library, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ComposerWithWorkCount } from "@/types/database";
import { CatalogSearchBar } from "@/components/CatalogSearchBar";
import { ComposerDirectory } from "@/components/ComposerDirectory";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [composersRes, worksCountRes, relationsCountRes, settingsRes] =
    await Promise.all([
      supabase
        .from("composers")
        .select("*, works(count)")
        .order("birth_year", { ascending: true }),
      supabase.from("works").select("*", { count: "exact", head: true }),
      supabase
        .from("composer_relations")
        .select("*", { count: "exact", head: true }),
      supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
    ]);

  const composers = (composersRes.data ?? []) as ComposerWithWorkCount[];
  const totalWorks = worksCountRes.count ?? 0;
  const totalRelations = relationsCountRes.count ?? 0;
  const settings = settingsRes.data;

  const heroBadge =
    settings?.hero_badge ||
    "Curated Classical Music Reference & OpenOpus Catalog";
  const heroTitle =
    settings?.hero_title ||
    "Explore Centuries of Classical Composers & Works";
  const heroSubtitle =
    settings?.hero_subtitle ||
    "Browse biographies, opus & thematic catalog numbers (BWV, K., Op., Hob., RV, D., S., WWV), and trace musical lineages from Medieval & Renaissance polyphony to 20th-Century modernism.";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12">
      {/* Hero & Search */}
      <section className="relative rounded-3xl bg-gradient-to-br from-white via-[#fdfbf7] to-[#f4ede0] dark:from-[#1b1815] dark:via-[#171512] dark:to-[#1f1a13] border border-stone-200/90 dark:border-stone-800/90 p-6 sm:p-10 lg:p-12 shadow-xs">
        <div className="max-w-3xl space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/70 text-xs font-medium text-amber-900 dark:text-[#d4af6a]">
            <Sparkles className="w-3.5 h-3.5" />
            {heroBadge}
          </div>

          <h1 className="font-serif text-3xl sm:text-5xl font-bold tracking-tight text-[#1a1816] dark:text-[#f3efe6] leading-[1.12]">
            {heroTitle}
          </h1>

          <p className="text-sm sm:text-base text-stone-600 dark:text-stone-400 leading-relaxed max-w-2xl">
            {heroSubtitle}
          </p>

          <div className="pt-1">
            <CatalogSearchBar />
          </div>
        </div>

        {/* Stat Strip + Quick Links */}
        <div className="mt-8 pt-6 border-t border-stone-200/80 dark:border-stone-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6 sm:gap-8">
            <div>
              <span className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6]">
                {composers.length}
              </span>
              <span className="block text-xs text-stone-500 dark:text-stone-400">
                Composers
              </span>
            </div>
            <div className="h-8 w-px bg-stone-200 dark:bg-stone-800" />
            <div>
              <span className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6]">
                {totalWorks}
              </span>
              <span className="block text-xs text-stone-500 dark:text-stone-400">
                Cataloged Works
              </span>
            </div>
            <div className="h-8 w-px bg-stone-200 dark:bg-stone-800" />
            <div>
              <span className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6]">
                {totalRelations}
              </span>
              <span className="block text-xs text-stone-500 dark:text-stone-400">
                Lineage Connections
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/works"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#191714] border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 hover:border-[#9a7432] dark:hover:border-[#d4af6a] hover:text-stone-950 dark:hover:text-white transition-colors"
            >
              <Library className="w-3.5 h-3.5 text-[#9a7432] dark:text-[#d4af6a]" />
              Full Works Index
            </Link>
            <Link
              href="/explore"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1a1816] dark:bg-[#d4af6a] text-xs font-medium text-white dark:text-[#11100e] hover:opacity-90 transition-opacity"
            >
              <Network className="w-3.5 h-3.5 text-[#e8d5b0] dark:text-[#11100e]" />
              Open Influence Map &amp; Timeline
            </Link>
          </div>
        </div>
      </section>

      {/* Composers Directory */}
      <ComposerDirectory composers={composers} />
    </div>
  );
}
