import { NextResponse } from "next/server";

export const API_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function apiJson<T>(
  data: T,
  options?: { status?: number; cacheSeconds?: number }
) {
  const status = options?.status ?? 200;
  const cacheSeconds = options?.cacheSeconds ?? 60;

  return NextResponse.json(data, {
    status,
    headers: {
      ...API_CORS_HEADERS,
      "Cache-Control":
        status === 200
          ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 5}`
          : "no-store",
    },
  });
}

export function apiError(message: string, status = 400) {
  return apiJson({ error: message }, { status });
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

  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), defaults.maxLimit)
    : defaults.limit;

  const offset = Number.isFinite(rawOffset) && rawOffset >= 0
    ? Math.floor(rawOffset)
    : 0;

  return { limit, offset };
}
