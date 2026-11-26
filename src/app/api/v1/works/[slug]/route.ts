import { supabase } from "@/lib/supabase";
import { apiError, apiJson, apiOptions } from "@/lib/api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiOptions();
}

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const isNumericId = /^\d+$/.test(slug);

  let workQuery = supabase
    .from("works")
    .select(
      "id, slug, composer_id, title, nickname, catalog_system, catalog_number, catalog_display, genre, key_signature, year_composed, instrumentation, movements_count, duration_minutes, is_popular, description, imslp_url, composers(id, slug, name, full_name, era, nationality, birth_year, death_year, avatar_url, imslp_url)"
    );

  workQuery = isNumericId
    ? workQuery.eq("id", Number(slug))
    : workQuery.eq("slug", slug);

  const { data: row, error } = await workQuery.maybeSingle();

  if (error) {
    return apiError(error.message, 500);
  }
  if (!row) {
    return apiError(`Work '${slug}' not found`, 404);
  }

  const { composers, ...work } = row;

  const [movementsRes, relatedRes] = await Promise.all([
    supabase
      .from("work_movements")
      .select("id, movement_number, title, tempo_marking, key_signature, duration_seconds")
      .eq("work_id", work.id)
      .order("movement_number", { ascending: true }),
    supabase
      .from("works")
      .select("id, slug, title, catalog_display, genre, year_composed, imslp_url")
      .eq("composer_id", work.composer_id)
      .neq("id", work.id)
      .order("is_popular", { ascending: false })
      .order("year_composed", { ascending: true })
      .limit(6),
  ]);

  return apiJson({
    work,
    composer: composers ?? null,
    movements: movementsRes.data ?? [],
    related_works: relatedRes.data ?? [],
  });
}
