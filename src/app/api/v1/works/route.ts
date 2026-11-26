import { supabase } from "@/lib/supabase";
import { apiError, apiJson, apiOptions, parsePagination } from "@/lib/api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { limit, offset } = parsePagination(searchParams, {
    limit: 50,
    maxLimit: 200,
  });

  const composerParam = searchParams.get("composer")?.trim();
  const era = searchParams.get("era")?.trim();
  const genre = searchParams.get("genre")?.trim();
  const catalog = searchParams.get("catalog")?.trim();
  const key = searchParams.get("key")?.trim();
  const instrumentation = searchParams.get("instrumentation")?.trim();
  const popular = searchParams.get("popular")?.trim();
  const q = searchParams.get("q")?.trim();

  // Optional composer filter by slug or name
  let composerIds: number[] | null = null;
  if (composerParam || era) {
    let compQuery = supabase.from("composers").select("id");
    if (composerParam) {
      compQuery = compQuery.or(
        `slug.eq.${composerParam},name.ilike.%${composerParam}%`
      );
    }
    if (era) compQuery = compQuery.eq("era", era);
    const { data: matchedComposers, error: cErr } = await compQuery;
    if (cErr) return apiError(cErr.message, 500);
    composerIds = (matchedComposers ?? []).map((c) => c.id);
    if (composerIds.length === 0) {
      return apiJson({ data: [], meta: { total: 0, limit, offset } });
    }
  }

  let query = supabase
    .from("works")
    .select(
      "id, slug, composer_id, title, nickname, catalog_system, catalog_number, catalog_display, genre, key_signature, year_composed, instrumentation, movements_count, duration_minutes, is_popular, description, imslp_url, composers(id, slug, name, era, nationality)",
      { count: "exact" }
    );

  if (composerIds) query = query.in("composer_id", composerIds);
  if (genre) query = query.eq("genre", genre);
  if (catalog) query = query.ilike("catalog_system", catalog);
  if (key) query = query.ilike("key_signature", `%${key}%`);
  if (instrumentation)
    query = query.ilike("instrumentation", `%${instrumentation}%`);
  if (popular === "true") query = query.eq("is_popular", true);
  if (q) {
    query = query.or(
      `title.ilike.%${q}%,nickname.ilike.%${q}%,catalog_display.ilike.%${q}%`
    );
  }

  const { data, count, error } = await query
    .order("is_popular", { ascending: false })
    .order("year_composed", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return apiError(error.message, 500);
  }

  const formatted = (data ?? []).map((row) => {
    const { composers, ...rest } = row;
    return {
      ...rest,
      composer: composers ?? null,
    };
  });

  return apiJson({
    data: formatted,
    meta: {
      total: count ?? formatted.length,
      limit,
      offset,
    },
  });
}
