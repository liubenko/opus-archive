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

  const era = searchParams.get("era")?.trim();
  const nationality = searchParams.get("nationality")?.trim();
  const q = searchParams.get("q")?.trim();
  const sort = searchParams.get("sort")?.trim() || "birth_year";

  let query = supabase
    .from("composers")
    .select(
      "id, slug, name, full_name, sort_name, era, nationality, birth_year, death_year, birth_place, avatar_url, short_bio, notable_for, rank_order, works(count)",
      { count: "exact" }
    );

  if (era) query = query.eq("era", era);
  if (nationality) query = query.ilike("nationality", `%${nationality}%`);
  if (q) query = query.or(`name.ilike.%${q}%,full_name.ilike.%${q}%`);

  if (sort === "name") {
    query = query.order("sort_name", { ascending: true });
  } else if (sort === "rank") {
    query = query
      .order("rank_order", { ascending: true, nullsFirst: false })
      .order("birth_year", { ascending: true });
  } else {
    query = query.order("birth_year", { ascending: true });
  }

  const { data, count, error } = await query.range(offset, offset + limit - 1);

  if (error) {
    return apiError(error.message, 500);
  }

  const formatted = (data ?? []).map((row) => {
    const { works, ...rest } = row as typeof row & {
      works?: { count: number }[];
    };
    return {
      ...rest,
      works_count: works?.[0]?.count ?? 0,
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
