import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  fetchImslpWorkInfoByUrl,
  lookupWorkCandidates,
} from "@/lib/catalog-lookup";
import { extractCatalog, extractKey } from "../../../../../scripts/lib/dedup.mjs";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing Bearer token." },
      { status: 401 }
    );
  }

  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authErr,
  } = await client.auth.getUser();

  if (authErr || !user || user.app_metadata?.role !== "admin") {
    return NextResponse.json(
      { error: "Admin privileges required." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    workId?: number;
  };
  if (!body.workId) {
    return NextResponse.json({ error: "workId is required." }, { status: 400 });
  }

  const [{ data: workRow, error: workErr }, { data: existingMovs }] =
    await Promise.all([
      client
        .from("works")
        .select("*, composers(name)")
        .eq("id", body.workId)
        .maybeSingle(),
      client
        .from("work_movements")
        .select("id")
        .eq("work_id", body.workId),
    ]);

  if (workErr || !workRow) {
    return NextResponse.json({ error: "Work not found." }, { status: 404 });
  }

  const composerName =
    (workRow as unknown as { composers?: { name?: string } | null }).composers
      ?.name || "";

  // Fetch exact IMSLP page (if linked) + multi-source lookup (IMSLP search, MusicBrainz, Multilingual Wikipedia) in parallel
  const [directImslp, candidates] = await Promise.all([
    workRow.imslp_url ? fetchImslpWorkInfoByUrl(workRow.imslp_url) : Promise.resolve(null),
    lookupWorkCandidates(workRow.title, composerName, {
      includeComposerMeta: false,
    }),
  ]);

  const top = candidates[0] ?? null;

  // If work had no direct imslp_url, try parsing the discovered IMSLP page for movements & catalog too
  const secondaryImslp =
    !directImslp && top?.imslp_url
      ? await fetchImslpWorkInfoByUrl(top.imslp_url)
      : null;

  const imslp = directImslp || secondaryImslp;

  const sources = new Set<string>();
  if (imslp) sources.add("IMSLP");
  if (top?.sources) {
    for (const s of top.sources) sources.add(s);
  }

  // Only fill MISSING fields (never overwrite existing curated metadata)
  // Note: `catalog_display` is GENERATED ALWAYS — set `catalog_system` + `catalog_number` only!
  const patch: Database["public"]["Tables"]["works"]["Update"] = {};
  const updatedFields: string[] = [];

  if (!workRow.year_composed) {
    const yr = imslp?.year_composed || top?.year_composed || null;
    if (yr) {
      patch.year_composed = yr;
      updatedFields.push("Year");
    }
  }

  if (!workRow.key_signature) {
    const key =
      imslp?.key_signature ||
      top?.key_signature ||
      extractKey(workRow.title) ||
      null;
    if (key) {
      patch.key_signature = key;
      updatedFields.push("Key");
    }
  }

  if (!workRow.duration_minutes) {
    const dur = imslp?.duration_minutes || top?.duration_minutes || null;
    if (dur) {
      patch.duration_minutes = dur;
      updatedFields.push("Duration");
    }
  }

  if (!workRow.catalog_system || !workRow.catalog_number) {
    const fromTitle = extractCatalog(workRow.title);
    const fromImslp = imslp?.catalog_raw
      ? extractCatalog(imslp.catalog_raw)
      : { catalog_system: null, catalog_number: null };
    const fromCand = top?.catalog_display
      ? extractCatalog(top.catalog_display)
      : { catalog_system: null, catalog_number: null };

    const chosen =
      fromTitle.catalog_system && fromTitle.catalog_number
        ? fromTitle
        : fromImslp.catalog_system && fromImslp.catalog_number
          ? fromImslp
          : fromCand;

    if (chosen.catalog_system && chosen.catalog_number) {
      patch.catalog_system = chosen.catalog_system;
      patch.catalog_number = chosen.catalog_number;
      updatedFields.push("Catalog");
      if (fromTitle.catalog_system) sources.add("Title Parser");
    }
  }

  if (!workRow.instrumentation) {
    const inst = imslp?.instrumentation || top?.instrumentation || null;
    if (inst) {
      patch.instrumentation = inst;
      updatedFields.push("Instrumentation");
    }
  }

  if (!workRow.description) {
    const desc = top?.description || null;
    if (desc) {
      patch.description = desc;
      updatedFields.push("Program Note");
    }
  }

  if (!workRow.imslp_url && top?.imslp_url) {
    patch.imslp_url = top.imslp_url;
    updatedFields.push("IMSLP Link");
  }

  // Insert parsed movements if none exist yet
  let insertedMovements = 0;
  const existingMovCount = existingMovs?.length ?? 0;
  if (existingMovCount === 0 && imslp?.movements && imslp.movements.length > 0) {
    const { data: insMovs } = await client
      .from("work_movements")
      .insert(
        imslp.movements.map((m) => ({
          work_id: workRow.id,
          movement_number: m.movement_number,
          title: m.title,
          tempo_marking: m.tempo_marking,
        }))
      )
      .select("id");
    insertedMovements = insMovs?.length ?? 0;
    if (insertedMovements > 0) {
      updatedFields.push(`${insertedMovements} Movements`);
    }
  }

  if (!workRow.movements_count) {
    const movCount =
      insertedMovements > 0
        ? insertedMovements
        : imslp?.movements_count || null;
    if (movCount) {
      patch.movements_count = movCount;
      if (insertedMovements === 0) {
        updatedFields.push("Movements Count");
      }
    }
  }

  if (Object.keys(patch).length > 0) {
    const { error: upErr } = await client
      .from("works")
      .update(patch)
      .eq("id", workRow.id);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 });
    }
  }

  return NextResponse.json({
    updatedFields,
    insertedMovements,
    sources: Array.from(sources),
  });
}
