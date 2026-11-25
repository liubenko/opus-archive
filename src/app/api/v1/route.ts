import { supabase } from "@/lib/supabase";
import { apiJson, apiOptions } from "@/lib/api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  const [composersRes, worksRes, relationsRes] = await Promise.all([
    supabase.from("composers").select("*", { count: "exact", head: true }),
    supabase.from("works").select("*", { count: "exact", head: true }),
    supabase
      .from("composer_relations")
      .select("*", { count: "exact", head: true }),
  ]);

  return apiJson({
    name: "Opus Archive API",
    version: "v1",
    stats: {
      composers: composersRes.count ?? 0,
      works: worksRes.count ?? 0,
      relations: relationsRes.count ?? 0,
    },
    endpoints: {
      composers: `${origin}/api/v1/composers?era=Romantic&nationality=Ukraine&limit=50&offset=0`,
      composer_detail: `${origin}/api/v1/composers/johann-sebastian-bach`,
      works: `${origin}/api/v1/works?composer=beethoven&genre=Concerto&popular=true&limit=50&offset=0`,
      search: `${origin}/api/v1/search?q=BWV+1007`,
      graph: `${origin}/api/v1/graph?connected_only=true`,
    },
  });
}
