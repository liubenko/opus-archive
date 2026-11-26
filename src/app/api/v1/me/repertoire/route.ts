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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim();

  let query = auth.client
    .from("user_repertoire")
    .select(
      "id, work_id, status, difficulty, last_practiced_at, notes, created_at, updated_at, works(id, slug, title, catalog_display, genre, key_signature, year_composed, duration_minutes, imslp_url, composers(id, slug, name, era))"
    )
    .order("updated_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return apiError(error.message, 500);
  }

  return apiJson(
    {
      user_id: auth.user.id,
      count: (data ?? []).length,
      data: data ?? [],
    },
    { privateNoStore: true }
  );
}

export async function POST(request: Request) {
  const auth = await createUserScopedSupabase(request);
  if (!auth) {
    return apiError(
      "Unauthorized. Provide a valid Authorization: Bearer <supabase_access_token> header.",
      401
    );
  }

  let body: {
    work_id?: number;
    status?: string;
    difficulty?: number | null;
    last_practiced_at?: string | null;
    notes?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.work_id || !Number.isFinite(Number(body.work_id))) {
    return apiError("work_id (integer) is required", 400);
  }

  const validStatuses = new Set(["wishlist", "learning", "ready", "performed"]);
  const status = body.status && validStatuses.has(body.status) ? body.status : "learning";

  const { data, error } = await auth.client
    .from("user_repertoire")
    .upsert(
      {
        user_id: auth.user.id,
        work_id: Number(body.work_id),
        status,
        difficulty: body.difficulty ?? null,
        last_practiced_at: body.last_practiced_at ?? null,
        notes: body.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,work_id" }
    )
    .select()
    .single();

  if (error) {
    return apiError(error.message, 400);
  }

  return apiJson({ data }, { status: 201, privateNoStore: true });
}
