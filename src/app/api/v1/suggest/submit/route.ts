import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

// Lightweight per-isolate sliding-window rate limiter (10 submissions / 5 min per IP)
const ipBuckets = new Map<string, number[]>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQ = 10;

export async function POST(request: Request) {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anon";

  const now = Date.now();
  const recent = (ipBuckets.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQ) {
    return NextResponse.json(
      { error: "Too many suggestions submitted recently. Please wait a few minutes." },
      { status: 429 }
    );
  }
  recent.push(now);
  ipBuckets.set(ip, recent);

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const authHeader = request.headers.get("Authorization");
  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(authHeader?.startsWith("Bearer ")
      ? { global: { headers: { Authorization: authHeader } } }
      : {}),
  });

  const { data, error } = await client.rpc("submit_catalog_suggestion", {
    payload: body as unknown as Json,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
