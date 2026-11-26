import { supabase } from "@/lib/supabase";
import { apiJson, apiOptions } from "@/lib/api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  const [composersRes, worksRes, movementsRes, relationsRes] =
    await Promise.all([
      supabase.from("composers").select("*", { count: "exact", head: true }),
      supabase.from("works").select("*", { count: "exact", head: true }),
      supabase
        .from("work_movements")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("composer_relations")
        .select("*", { count: "exact", head: true }),
    ]);

  return apiJson({
    name: "Opus Archive API",
    version: "v1",
    docs: `${origin}/docs/api`,
    stats: {
      composers: composersRes.count ?? 0,
      works: worksRes.count ?? 0,
      movements: movementsRes.count ?? 0,
      relations: relationsRes.count ?? 0,
    },
    endpoints: {
      composers: `${origin}/api/v1/composers?era=Romantic&nationality=Ukraine&limit=50&offset=0`,
      composer_detail: `${origin}/api/v1/composers/johann-sebastian-bach`,
      works: `${origin}/api/v1/works?composer=beethoven&genre=Concerto&popular=true&limit=50&offset=0`,
      work_detail: `${origin}/api/v1/works/das-lied-von-der-glocke-op-45-15576`,
      search: `${origin}/api/v1/search?q=BWV+1007`,
      graph: `${origin}/api/v1/graph?connected_only=true`,
      imslp_editions: `${origin}/api/v1/imslp/editions?url=https://imslp.org/wiki/Cello_Suite_No.1_in_G_major,_BWV_1007_(Bach,_Johann_Sebastian)`,
      me_repertoire: `${origin}/api/v1/me/repertoire (Bearer JWT required)`,
      me_programs: `${origin}/api/v1/me/programs (Bearer JWT required)`,
    },
  });
}
