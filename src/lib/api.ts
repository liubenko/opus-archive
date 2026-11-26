import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const API_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function apiJson<T>(
  data: T,
  options?: { status?: number; cacheSeconds?: number; privateNoStore?: boolean }
) {
  const status = options?.status ?? 200;
  const cacheSeconds = options?.cacheSeconds ?? 60;
  const cacheHeader =
    options?.privateNoStore || status !== 200
      ? "private, no-store"
      : `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 5}`;

  return NextResponse.json(data, {
    status,
    headers: {
      ...API_CORS_HEADERS,
      "Cache-Control": cacheHeader,
    },
  });
}

export function apiError(message: string, status = 400) {
  return apiJson({ error: message }, { status, privateNoStore: true });
}

export function apiOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: API_CORS_HEADERS,
  });
}

export function parsePagination(
  searchParams: URLSearchParams,
  defaults = { limit: 50, maxLimit: 200 }
) {
  const rawLimit = Number(searchParams.get("limit"));
  const rawOffset = Number(searchParams.get("offset"));

  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), defaults.maxLimit)
      : defaults.limit;

  const offset =
    Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

  return { limit, offset };
}

/**
 * Authenticates a Bearer JWT from `Authorization: Bearer <token>` and returns
 * a per-request Supabase client scoped to that user so Postgres RLS applies.
 */
export async function createUserScopedSupabase(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  if (!token) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePublishableKey) return null;

  const client = createClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;

  return { client, user: data.user };
}
