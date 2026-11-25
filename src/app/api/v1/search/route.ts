import { supabase } from "@/lib/supabase";
import { apiError, apiJson, apiOptions } from "@/lib/api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const era = searchParams.get("era")?.trim() || undefined;
  const genre = searchParams.get("genre")?.trim() || undefined;
  const rawLimit = Number(searchParams.get("limit"));
  const maxResults =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 100)
      : 25;

  if (!q) {
    return apiError("Query parameter 'q' is required (e.g. ?q=BWV+1007)", 400);
  }

  const { data, error } = await supabase.rpc("search_catalog", {
    query_text: q,
    era_filter: era,
    genre_filter: genre,
    max_results: maxResults,
  });

  if (error) {
    return apiError(error.message, 500);
  }

  const rows = data ?? [];
  const composers = rows.filter((r) => r.result_type === "composer");
  const works = rows.filter((r) => r.result_type === "work");

  return apiJson({
    query: q,
    total: rows.length,
    results: {
      composers,
      works,
    },
  });
}
