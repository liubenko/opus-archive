import { supabase } from "@/lib/supabase";
import { apiError, apiJson, apiOptions } from "@/lib/api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const relationType = searchParams.get("relation_type")?.trim();
  const connectedOnly = searchParams.get("connected_only") !== "false";

  let relQuery = supabase
    .from("composer_relations")
    .select(
      "id, source_composer_id, target_composer_id, relation_type, strength, description"
    );

  if (relationType) {
    relQuery = relQuery.eq("relation_type", relationType);
  }

  const [composersRes, relationsRes] = await Promise.all([
    supabase
      .from("composers")
      .select("id, slug, name, era, nationality, birth_year, death_year, avatar_url")
      .order("birth_year", { ascending: true }),
    relQuery,
  ]);

  if (composersRes.error) return apiError(composersRes.error.message, 500);
  if (relationsRes.error) return apiError(relationsRes.error.message, 500);

  const edges = (relationsRes.data ?? []).map((r) => ({
    id: r.id,
    source: r.source_composer_id,
    target: r.target_composer_id,
    relation_type: r.relation_type,
    strength: r.strength,
    description: r.description,
  }));

  let nodes = composersRes.data ?? [];
  if (connectedOnly) {
    const connectedIds = new Set<number>();
    for (const e of edges) {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    }
    nodes = nodes.filter((n) => connectedIds.has(n.id));
  }

  return apiJson(
    {
      nodes,
      edges,
      meta: {
        node_count: nodes.length,
        edge_count: edges.length,
      },
    },
    { cacheSeconds: 120 }
  );
}
