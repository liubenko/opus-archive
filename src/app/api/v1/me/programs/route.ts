import {
  apiError,
  apiJson,
  apiOptions,
  createUserScopedSupabase,
} from "@/lib/api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: Request) {
  const auth = await createUserScopedSupabase(request);
  if (!auth) {
    return apiError(
      "Unauthorized. Provide a valid Authorization: Bearer <supabase_access_token> header.",
      401
    );
  }

  const [progsRes, itemsRes] = await Promise.all([
    auth.client
      .from("recital_programs")
      .select("*")
      .order("created_at", { ascending: false }),
    auth.client
      .from("recital_program_items")
      .select(
        "id, program_id, work_id, half, position, custom_duration_minutes, program_note, works(id, slug, title, catalog_display, genre, duration_minutes, composers(id, slug, name))"
      )
      .order("half", { ascending: true })
      .order("position", { ascending: true }),
  ]);

  if (progsRes.error) return apiError(progsRes.error.message, 500);
  if (itemsRes.error) return apiError(itemsRes.error.message, 500);

  const itemsByProgram = new Map<number, typeof itemsRes.data>();
  for (const item of itemsRes.data ?? []) {
    const list = itemsByProgram.get(item.program_id) ?? [];
    list.push(item);
    itemsByProgram.set(item.program_id, list);
  }

  const formatted = (progsRes.data ?? []).map((p) => {
    const items = itemsByProgram.get(p.id) ?? [];
    const half1 = items.filter((i) => i.half === 1);
    const half2 = items.filter((i) => i.half === 2);
    const sumDur = (arr: typeof items) =>
      arr.reduce(
        (acc, i) =>
          acc + (i.custom_duration_minutes ?? i.works?.duration_minutes ?? 0),
        0
      );
    const half1Minutes = sumDur(half1);
    const half2Minutes = sumDur(half2);
    const intermission = half2.length > 0 ? p.intermission_minutes : 0;

    return {
      ...p,
      timing: {
        half1_minutes: half1Minutes,
        intermission_minutes: intermission,
        half2_minutes: half2Minutes,
        total_minutes: half1Minutes + intermission + half2Minutes,
      },
      items,
    };
  });

  return apiJson(
    {
      user_id: auth.user.id,
      count: formatted.length,
      data: formatted,
    },
    { privateNoStore: true }
  );
}
