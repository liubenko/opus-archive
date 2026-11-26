import Link from "next/link";
import {
  Network,
  Library,
  Sparkles,
  FileMusic,
  Clock,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ComposerWithWorkCount, WorkWithComposer } from "@/types/database";
import { CatalogSearchBar } from "@/components/CatalogSearchBar";
import { ComposerDirectory } from "@/components/ComposerDirectory";
import { ComposerAvatar } from "@/components/ComposerAvatar";
import { formatLifespan } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [
    composersRes,
    worksCountRes,
    relationsCountRes,
    settingsRes,
    spotlightWorksRes,
  ] = await Promise.all([
    supabase
      .from("composers")
      .select("*, works(count)")
      .order("birth_year", { ascending: true }),
    supabase.from("works").select("*", { count: "exact", head: true }),
    supabase
      .from("composer_relations")
      .select("*", { count: "exact", head: true }),
    supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
    supabase
      .from("works")
      .select("*, composers(id, name, slug, era, nationality, avatar_url)")
      .eq("is_popular", true)
      .not("imslp_url", "is", null)
      .not("description", "is", null)
      .order("id", { ascending: true })
      .limit(60),
  ]);

  const composers = (composersRes.data ?? []) as ComposerWithWorkCount[];
  const totalWorks = worksCountRes.count ?? 0;
  const totalRelations = relationsCountRes.count ?? 0;
  const settings = settingsRes.data;

  // Deterministic daily rotation for Masterwork of the Day
  const spotlightPool = (spotlightWorksRes.data ?? []) as WorkWithComposer[];
  const daySeed = Math.floor(Date.now() / 86_400_000);
  const featuredWork =
    spotlightPool.length > 0
      ? spotlightPool[daySeed % spotlightPool.length]
      : null;

  // Milestone composer anniversaries this year (multiples of 25 years from birth or death)
  const currentYear = new Date().getUTCFullYear();
  const anniversaryComposers = composers
    .map((c) => {
      const birthDiff = currentYear - c.birth_year;
      const deathDiff = c.death_year ? currentYear - c.death_year : null;
      if (birthDiff > 0 && birthDiff % 25 === 0) {
        return { composer: c, label: `${birthDiff}th Birth Anniversary` };
      }
      if (deathDiff && deathDiff > 0 && deathDiff % 25 === 0) {
        return { composer: c, label: `${deathDiff}th Memorial Year` };
      }
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .slice(0, 3);

  const heroBadge =
    settings?.hero_badge ||
    "Curated Classical Music Reference & OpenOpus Catalog";
  const heroTitle =
    settings?.hero_title ||
    "Explore Centuries of Classical Composers & Works";
  const heroSubtitle =
    settings?.hero_subtitle ||
    "Browse biographies, opus & thematic catalog numbers (BWV, K., Op., Hob., RV, D., S., WWV), verified IMSLP scores, and musical lineages from Medieval polyphony to Contemporary repertoire.";

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
                {totalWorks.toLocaleString()}
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

      {/* Daily Spotlight & Historical Anniversaries */}
      {(featuredWork || anniversaryComposers.length > 0) && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {featuredWork && (
            <div className="lg:col-span-2 bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-6 flex flex-col justify-between gap-4 shadow-xs">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-[#8a6526] dark:text-[#e3c27d] border border-amber-200/80 dark:border-amber-800/70">
                    <Sparkles className="w-2.5 h-2.5" />
                    Masterwork of the Day
                  </span>
                  {featuredWork.catalog_display && (
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                      {featuredWork.catalog_display}
                    </span>
                  )}
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    {featuredWork.genre}
                    {featuredWork.year_composed
                      ? ` · ${featuredWork.year_composed}`
                      : ""}
                  </span>
                </div>

                <div>
                  <Link
                    href={`/works/${featuredWork.slug || featuredWork.id}`}
                    className="font-serif text-xl sm:text-2xl font-bold text-stone-900 dark:text-[#f3efe6] hover:text-[#9a7432] dark:hover:text-[#d4af6a] transition-colors"
                  >
                    {featuredWork.title}
                  </Link>
                  {featuredWork.composers && (
                    <p className="text-xs font-medium text-[#9a7432] dark:text-[#d4af6a] mt-0.5">
                      {featuredWork.composers.name} ·{" "}
                      {featuredWork.composers.era}
                    </p>
                  )}
                </div>

                {featuredWork.description && (
                  <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed line-clamp-2">
                    {featuredWork.description}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-stone-100 dark:border-stone-800">
                <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400">
                  {featuredWork.duration_minutes && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />~
                      {featuredWork.duration_minutes} min
                    </span>
                  )}
                  {featuredWork.imslp_url && (
                    <span className="inline-flex items-center gap-1 text-[#8a6526] dark:text-[#e3c27d]">
                      <FileMusic className="w-3.5 h-3.5" />
                      IMSLP Score Available
                    </span>
                  )}
                </div>

                <Link
                  href={`/works/${featuredWork.slug || featuredWork.id}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-stone-900 dark:text-[#f3efe6] hover:text-[#9a7432] dark:hover:text-[#d4af6a]"
                >
                  Open Work &amp; Score
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}

          {anniversaryComposers.length > 0 && (
            <div className="bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-6 space-y-3.5 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#9a7432] dark:text-[#d4af6a]">
                <Calendar className="w-3.5 h-3.5" />
                {currentYear} Milestone Anniversaries
              </div>
              <div className="space-y-3">
                {anniversaryComposers.map(({ composer, label }) => (
                  <Link
                    key={composer.id}
                    href={`/composers/${composer.slug}`}
                    className="flex items-center gap-3 group"
                  >
                    <ComposerAvatar
                      name={composer.name}
                      avatarUrl={composer.avatar_url}
                      era={composer.era}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-sm font-semibold text-stone-900 dark:text-[#f3efe6] group-hover:text-[#9a7432] dark:group-hover:text-[#d4af6a] truncate">
                        {composer.name}
                      </p>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400">
                        {label} ·{" "}
                        {formatLifespan(
                          composer.birth_year,
                          composer.death_year
                        )}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Composers Directory */}
      <ComposerDirectory composers={composers} />
    </div>
  );
}
