import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Network,
  Globe,
  Music,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Composer, ComposerRelation, Work } from "@/types/database";
import { formatLifespan, getEraStyle, RELATION_META } from "@/lib/constants";
import { ComposerAvatar } from "@/components/ComposerAvatar";
import { ComposerWorksList } from "@/components/ComposerWorksList";

export const dynamic = "force-dynamic";

interface ComposerPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ComposerDetailPage({
  params,
}: ComposerPageProps) {
  const { slug } = await params;

  const { data: composer } = await supabase
    .from("composers")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!composer) {
    notFound();
  }

  const [worksRes, relationsRes, allComposersRes] = await Promise.all([
    supabase
      .from("works")
      .select("*")
      .eq("composer_id", composer.id)
      .order("is_popular", { ascending: false })
      .order("year_composed", { ascending: true }),
    supabase
      .from("composer_relations")
      .select("*")
      .or(
        `source_composer_id.eq.${composer.id},target_composer_id.eq.${composer.id}`
      ),
    supabase
      .from("composers")
      .select(
        "id, slug, name, era, nationality, birth_year, death_year, avatar_url"
      ),
  ]);

  const works = (worksRes.data ?? []) as Work[];
  const relations = (relationsRes.data ?? []) as ComposerRelation[];
  const composerMap = new Map(
    (allComposersRes.data ?? []).map((c) => [c.id, c])
  );

  const eraStyle = getEraStyle(composer.era);
  const age = composer.death_year
    ? composer.death_year - composer.birth_year
    : null;

  const connectedItems = relations
    .map((rel) => {
      const isSource = rel.source_composer_id === composer.id;
      const otherId = isSource ? rel.target_composer_id : rel.source_composer_id;
      const other = composerMap.get(otherId);
      if (!other) return null;
      const meta = RELATION_META[rel.relation_type];
      return {
        id: rel.id,
        other: other as Pick<
          Composer,
          | "id"
          | "slug"
          | "name"
          | "era"
          | "nationality"
          | "birth_year"
          | "death_year"
          | "avatar_url"
        >,
        label: isSource ? meta?.label : meta?.reverseLabel,
        badgeClass:
          meta?.badgeClass ??
          "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700",
        description: rel.description,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-10">
      {/* Back link */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to All Composers
        </Link>
      </div>

      {/* Composer Hero */}
      <section className="bg-white dark:bg-[#191714] rounded-3xl border border-stone-200/90 dark:border-stone-800/90 p-6 sm:p-8 lg:p-10 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start gap-6 sm:gap-8">
          <ComposerAvatar
            name={composer.name}
            avatarUrl={composer.avatar_url}
            era={composer.era}
            size="xl"
          />

          <div className="flex-1 space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${eraStyle.bg} ${eraStyle.border} ${eraStyle.text}`}
                >
                  <span className={`w-2 h-2 rounded-full ${eraStyle.color}`} />
                  {composer.era}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                  <Globe className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500" />
                  {composer.nationality}
                </span>
              </div>

              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#1a1816] dark:text-[#f3efe6] mt-2">
                {composer.name}
              </h1>
              {composer.full_name !== composer.name && (
                <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
                  {composer.full_name}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-600 dark:text-stone-400">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#9a7432] dark:text-[#d4af6a]" />
                {formatLifespan(composer.birth_year, composer.death_year)}
                {age ? ` (aged ${age})` : ""}
              </span>
              {composer.birth_place && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#9a7432] dark:text-[#d4af6a]" />
                  {composer.birth_place}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-[#9a7432] dark:text-[#d4af6a]" />
                {works.length} cataloged works
              </span>
            </div>

            {composer.notable_for && (
              <p className="text-sm font-medium text-[#8a6526] dark:text-[#e3c27d] bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/60 rounded-xl px-3.5 py-2">
                {composer.notable_for}
              </p>
            )}

            <p className="text-sm sm:text-base text-stone-700 dark:text-stone-300 leading-relaxed">
              {composer.short_bio}
            </p>
          </div>
        </div>
      </section>

      {/* Cataloged Works */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6]">
              Selected Works &amp; Opus Catalog
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Filter by genre, search catalog numbers, or focus on essential
              repertoire
            </p>
          </div>
        </div>

        <ComposerWorksList works={works} />
      </section>

      {/* Musical Lineage & Connections */}
      {connectedItems.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl font-bold text-stone-900 dark:text-[#f3efe6]">
                Musical Connections &amp; Lineage
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Teachers, students, contemporaries, and historical influences
              </p>
            </div>
            <Link
              href="/explore"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9a7432] dark:text-[#d4af6a] hover:underline"
            >
              <Network className="w-3.5 h-3.5" />
              View full Influence Graph Map
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {connectedItems.map((item) => (
              <Link
                key={item.id}
                href={`/composers/${item.other.slug}`}
                className="group bg-white dark:bg-[#191714] rounded-2xl border border-stone-200/90 dark:border-stone-800/90 p-4 hover:border-[#9a7432]/60 dark:hover:border-[#d4af6a]/60 hover:shadow-sm transition-all flex items-start gap-3.5"
              >
                <ComposerAvatar
                  name={item.other.name}
                  avatarUrl={item.other.avatar_url}
                  era={item.other.era}
                  size="md"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-serif text-base font-semibold text-stone-900 dark:text-[#f3efe6] group-hover:text-[#9a7432] dark:group-hover:text-[#d4af6a] transition-colors">
                      {item.other.name}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${item.badgeClass}`}
                    >
                      {item.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 dark:text-stone-500">
                    {formatLifespan(
                      item.other.birth_year,
                      item.other.death_year
                    )}{" "}
                    · {item.other.era}
                  </p>
                  {item.description && (
                    <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
