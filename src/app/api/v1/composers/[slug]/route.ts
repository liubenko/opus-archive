import { supabase } from "@/lib/supabase";
import { apiError, apiJson, apiOptions, parsePagination } from "@/lib/api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiOptions();
}

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const { searchParams } = new URL(request.url);
  const { limit, offset } = parsePagination(searchParams, {
    limit: 100,
    maxLimit: 500,
  });

  const genre = searchParams.get("genre")?.trim();
  const popular = searchParams.get("popular")?.trim();

  const { data: composer, error: compErr } = await supabase
    .from("composers")
    .select(
      "id, slug, name, full_name, sort_name, era, nationality, birth_year, death_year, birth_place, avatar_url, short_bio, notable_for, rank_order"
    )
    .eq("slug", slug)
    .single();

  if (compErr || !composer) {
    return apiError(`Composer '${slug}' not found`, 404);
  }

  let worksQuery = supabase
    .from("works")
    .select(
      "id, title, nickname, catalog_system, catalog_number, catalog_display, genre, key_signature, year_composed, instrumentation, movements_count, duration_minutes, is_popular, description",
      { count: "exact" }
    )
    .eq("composer_id", composer.id);

  if (genre) worksQuery = worksQuery.eq("genre", genre);
  if (popular === "true") worksQuery = worksQuery.eq("is_popular", true);

  const [worksRes, relationsRes] = await Promise.all([
    worksQuery
      .order("is_popular", { ascending: false })
      .order("year_composed", { ascending: true })
      .range(offset, offset + limit - 1),
    supabase
      .from("composer_relations")
      .select(
        "id, source_composer_id, target_composer_id, relation_type, strength, description"
      )
      .or(
        `source_composer_id.eq.${composer.id},target_composer_id.eq.${composer.id}`
      ),
  ]);

  if (worksRes.error) {
    return apiError(worksRes.error.message, 500);
  }

  const relations = relationsRes.data ?? [];
  const relatedIds = Array.from(
    new Set(
      relations.map((r) =>
        r.source_composer_id === composer.id
          ? r.target_composer_id
          : r.source_composer_id
      )
    )
  );

  let relatedMap = new Map<
    number,
    { id: number; slug: string; name: string; era: string }
  >();
  if (relatedIds.length > 0) {
    const { data: relComposers } = await supabase
      .from("composers")
      .select("id, slug, name, era")
      .in("id", relatedIds);
    relatedMap = new Map((relComposers ?? []).map((c) => [c.id, c]));
  }

  const connections = relations
    .map((r) => {
      const direction =
        r.source_composer_id === composer.id ? "outgoing" : "incoming";
      const otherId =
        direction === "outgoing" ? r.target_composer_id : r.source_composer_id;
      const other = relatedMap.get(otherId);
      if (!other) return null;
      return {
        id: r.id,
        direction,
        relation_type: r.relation_type,
        strength: r.strength,
        description: r.description,
        composer: other,
      };
    })
    .filter(Boolean);

  return apiJson({
    composer,
    works: worksRes.data ?? [],
    connections,
    meta: {
      works_total: worksRes.count ?? (worksRes.data ?? []).length,
      limit,
      offset,
    },
  });
}
