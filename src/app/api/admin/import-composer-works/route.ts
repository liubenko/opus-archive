import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  buildWorkMatcher,
  extractCatalog,
  extractKey,
  isMovementSubworkTitle,
  mapWorkGenre,
} from "../../../../../scripts/lib/dedup.mjs";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const UA =
  "OpusArchive/1.0 (https://github.com/liubenko/opus-archive; admin catalog importer)";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Bearer token." }, { status: 401 });
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

  const { composerId } = (await request.json().catch(() => ({}))) as {
    composerId?: number;
  };
  if (!composerId) {
    return NextResponse.json(
      { error: "composerId is required." },
      { status: 400 }
    );
  }

  const { data: composer } = await client
    .from("composers")
    .select("*")
    .eq("id", composerId)
    .maybeSingle();

  if (!composer) {
    return NextResponse.json({ error: "Composer not found." }, { status: 404 });
  }

  const { data: existingWorks } = await client
    .from("works")
    .select("id, title, catalog_system, catalog_number")
    .eq("composer_id", composer.id);

  const matcher = buildWorkMatcher(existingWorks || []);
  const lastName = composer.sort_name.split(",")[0].trim();

  type OpenSearchTuple = [string, string[], string[], string[]];
  type OpenOpusCompJson = {
    composers?: { id?: string; complete_name?: string; name?: string }[];
  };
  type MbArtistJson = { artists?: { id?: string }[] };

  // 1. Fetch OpenOpus + MusicBrainz + IMSLP category in parallel
  const [ooSearch, mbArtistSearch, imslpCatSearch] = await Promise.allSettled([
    fetch(
      `https://api.openopus.org/composer/list/search/${encodeURIComponent(
        lastName
      )}.json`,
      { headers: { "User-Agent": UA } }
    ).then((r) => (r.ok ? (r.json() as Promise<OpenOpusCompJson>) : null)),
    fetch(
      `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(
        `artist:"${composer.name}"`
      )}&fmt=json&limit=3`,
      { headers: { "User-Agent": UA } }
    ).then((r) => (r.ok ? (r.json() as Promise<MbArtistJson>) : null)),
    fetch(
      `https://imslp.org/api.php?action=opensearch&search=${encodeURIComponent(
        `Category:${composer.sort_name}`
      )}&namespace=14&limit=3&format=json`,
      { headers: { "User-Agent": UA } }
    ).then((r) => (r.ok ? (r.json() as Promise<OpenSearchTuple>) : null)),
  ]);

  // Resolve IMSLP category pages
  let composerImslpUrl = composer.imslp_url;
  const imslpPages: { title: string; url: string }[] = [];

  if (
    imslpCatSearch.status === "fulfilled" &&
    Array.isArray(imslpCatSearch.value?.[1]) &&
    imslpCatSearch.value[1][0]
  ) {
    const catTitle = String(imslpCatSearch.value[1][0]);
    composerImslpUrl =
      String(imslpCatSearch.value[3]?.[0] || "") || composerImslpUrl;

    try {
      const cmRes = await fetch(
        `https://imslp.org/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(
          catTitle
        )}&cmnamespace=0&cmlimit=120&format=json`,
        { headers: { "User-Agent": UA } }
      );
      if (cmRes.ok) {
        const cmJson = (await cmRes.json()) as {
          query?: { categorymembers?: { title: string }[] };
        };
        for (const m of cmJson.query?.categorymembers || []) {
          imslpPages.push({
            title: m.title,
            url: `https://imslp.org/wiki/${encodeURIComponent(
              m.title.replace(/ /g, "_")
            )}`,
          });
        }
      }
    } catch {
      // Ignore IMSLP category error
    }
  }

  if (composerImslpUrl && composerImslpUrl !== composer.imslp_url) {
    await client
      .from("composers")
      .update({
        imslp_url: composerImslpUrl,
        imslp_synced_at: new Date().toISOString(),
      })
      .eq("id", composer.id);
  }

  const candidateWorks: {
    title: string;
    genre: string;
    is_popular: boolean;
    imslp_url: string | null;
  }[] = [];

  // 2a. OpenOpus works if available
  if (
    ooSearch.status === "fulfilled" &&
    Array.isArray(ooSearch.value?.composers)
  ) {
    const ooComp = ooSearch.value.composers.find((c: { complete_name?: string; name?: string }) =>
      (c.complete_name || c.name || "")
        .toLowerCase()
        .includes(lastName.toLowerCase())
    );
    if (ooComp?.id) {
      try {
        const wRes = await fetch(
          `https://api.openopus.org/work/list/composer/${ooComp.id}/genre/all.json`,
          { headers: { "User-Agent": UA } }
        );
        if (wRes.ok) {
          const wJson = (await wRes.json()) as {
            works?: { title: string; genre?: string; popular?: string; recommended?: string }[];
          };
          for (const w of (wJson.works || []).slice(0, 45)) {
            if (!w.title || isMovementSubworkTitle(w.title)) continue;
            candidateWorks.push({
              title: w.title,
              genre: mapWorkGenre(w.genre || "", w.title),
              is_popular: w.popular === "1" || w.recommended === "1",
              imslp_url: null,
            });
          }
        }
      } catch {
        // Ignore OpenOpus work list error
      }
    }
  }

  // 2b. MusicBrainz works if OpenOpus had < 15 works
  if (
    candidateWorks.length < 15 &&
    mbArtistSearch.status === "fulfilled" &&
    Array.isArray(mbArtistSearch.value?.artists) &&
    mbArtistSearch.value.artists[0]?.id
  ) {
    const mbid = mbArtistSearch.value.artists[0].id as string;
    try {
      const mbWorksRes = await fetch(
        `https://musicbrainz.org/ws/2/work?artist=${mbid}&limit=45&fmt=json`,
        { headers: { "User-Agent": UA } }
      );
      if (mbWorksRes.ok) {
        const mbWorksJson = (await mbWorksRes.json()) as {
          works?: { title: string; type?: string }[];
        };
        for (const w of mbWorksJson.works || []) {
          if (!w.title || isMovementSubworkTitle(w.title)) continue;
          candidateWorks.push({
            title: w.title,
            genre: mapWorkGenre(w.type || "", w.title),
            is_popular: false,
            imslp_url: null,
          });
        }
      }
    } catch {
      // Ignore MB works error
    }
  }

  // 2c. Also include IMSLP category pages directly (especially useful for public-domain composers not in OpenOpus!)
  for (const page of imslpPages.slice(0, 40)) {
    const cleanTitle = page.title.replace(/\s*\([^()]+\)\s*$/, "").trim();
    if (!cleanTitle || isMovementSubworkTitle(cleanTitle)) continue;
    candidateWorks.push({
      title: cleanTitle,
      genre: mapWorkGenre("", cleanTitle),
      is_popular: false,
      imslp_url: page.url,
    });
  }

  // Match IMSLP URLs onto OpenOpus/MB candidates and insert unique works
  const imslpMatcher = buildWorkMatcher(
    imslpPages.map((p) => {
      const clean = p.title.replace(/\s*\([^()]+\)\s*$/, "").trim();
      const cat = extractCatalog(clean);
      return {
        title: clean,
        catalog_system: cat.catalog_system,
        catalog_number: cat.catalog_number,
        url: p.url,
      };
    })
  );

  const rowsToInsert: Database["public"]["Tables"]["works"]["Insert"][] = [];
  let linkedImslpScores = 0;

  for (const cand of candidateWorks) {
    const cat = extractCatalog(cand.title);
    const already = matcher.findMatch({
      musicbrainz_id: undefined,
      openopus_id: undefined,
      title: cand.title,
      catalog_system: cat.catalog_system,
      catalog_number: cat.catalog_number,
    });
    if (already) continue;

    let imslpUrl = cand.imslp_url;
    if (!imslpUrl) {
      const imslpHit = imslpMatcher.findMatch({
        musicbrainz_id: undefined,
        openopus_id: undefined,
        title: cand.title,
        catalog_system: cat.catalog_system,
        catalog_number: cat.catalog_number,
      }) as { url?: string } | null;
      if (imslpHit?.url) imslpUrl = imslpHit.url;
    }

    if (imslpUrl) linkedImslpScores++;

    rowsToInsert.push({
      composer_id: composer.id,
      title: cand.title,
      genre: cand.genre,
      catalog_system: cat.catalog_system,
      catalog_number: cat.catalog_number,
      key_signature: extractKey(cand.title),
      is_popular: cand.is_popular,
      imslp_url: imslpUrl,
    });

    matcher.add({
      title: cand.title,
      catalog_system: cat.catalog_system,
      catalog_number: cat.catalog_number,
    });

    if (rowsToInsert.length >= 45) break;
  }

  if (rowsToInsert.length > 0) {
    const { error: insErr } = await client.from("works").insert(rowsToInsert);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }
  }

  return NextResponse.json({
    importedWorks: rowsToInsert.length,
    linkedImslpScores,
    composerImslpUrl,
  });
}
