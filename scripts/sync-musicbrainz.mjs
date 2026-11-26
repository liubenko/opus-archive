#!/usr/bin/env node
/**
 * MusicBrainz Classical Music Enrichment & Sync Script -> Supabase
 *
 * Respects MusicBrainz's 1 req/sec rate limit and User-Agent policy.
 * 1. Picks the next batch of composers (oldest/unsynced `musicbrainz_synced_at` first).
 * 2. Matches each composer to their canonical MusicBrainz Artist MBID (verifying birth year).
 * 3. Enriches missing composer metadata (musicbrainz_id, birth_place, nationality).
 * 4. Fetches their works from MusicBrainz, extracts structured Key + Opus/Catalog numbers,
 *    and either ENRICHES existing works (zero duplicates!) or inserts genuinely new works.
 *
 * Environment variables:
 *   SUPABASE_URL           - e.g. https://iyfzoobqtegrrvexcqkk.supabase.co
 *   SUPABASE_SECRET_KEY    - Supabase secret / service_role key
 *   MB_BATCH_SIZE          - Composers to sync per run (default: 15)
 *   MB_MAX_WORKS           - Max works to fetch per composer from MB (default: 50)
 */

import { createClient } from "@supabase/supabase-js";
import {
  buildWorkMatcher,
  extractCatalog,
  extractKey,
  isMovementSubworkTitle,
  mapWorkGenre,
  normalizeText,
} from "./lib/dedup.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const MB_BATCH_SIZE = Math.max(1, Number(process.env.MB_BATCH_SIZE || 15));
const MB_MAX_WORKS = Math.min(100, Math.max(1, Number(process.env.MB_MAX_WORKS || 50)));

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MB_BASE = "https://musicbrainz.org/ws/2";
const MB_USER_AGENT =
  "OpusArchive/1.0 ( https://github.com/liubenko/opus-archive )";

let lastMbRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mbFetch(path, retries = 3) {
  // Enforce >= 1150ms spacing between MusicBrainz requests (1 req/sec rule)
  const now = Date.now();
  const wait = Math.max(0, 1150 - (now - lastMbRequestAt));
  if (wait > 0) await sleep(wait);
  lastMbRequestAt = Date.now();

  const url = `${MB_BASE}${path}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": MB_USER_AGENT,
        Accept: "application/json",
      },
    });

    if (res.ok) return res.json();

    if (res.status === 503 || res.status === 429) {
      const backoff = 1500 * attempt;
      console.warn(`MusicBrainz rate limit (${res.status}), waiting ${backoff}ms...`);
      await sleep(backoff);
      lastMbRequestAt = Date.now();
      continue;
    }

    return null;
  }
  return null;
}

function parseYear(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

async function findMusicBrainzArtist(composer) {
  if (composer.musicbrainz_id) {
    return mbFetch(`/artist/${composer.musicbrainz_id}?fmt=json`);
  }

  const query = encodeURIComponent(`artist:"${composer.name}" AND type:person`);
  const data = await mbFetch(`/artist?query=${query}&limit=5&fmt=json`);
  const candidates = data?.artists ?? [];

  for (const artist of candidates) {
    const mbBirth = parseYear(artist["life-span"]?.begin);
    // Require birth year match within +/- 2 years (or high score + name match if MB lacks birth date)
    if (mbBirth && composer.birth_year) {
      if (Math.abs(mbBirth - composer.birth_year) <= 2) {
        return artist;
      }
    } else if (
      artist.score >= 95 &&
      normalizeText(artist.name) === normalizeText(composer.name)
    ) {
      return artist;
    }
  }

  return null;
}

function extractMbKeyAttribute(mbWork) {
  const attrs = mbWork.attributes ?? [];
  for (const attr of attrs) {
    if (String(attr.type || "").toLowerCase() === "key" && attr.value) {
      return attr.value;
    }
  }
  return extractKey(mbWork.title);
}

async function main() {
  console.log(
    `Starting MusicBrainz sync (batch: ${MB_BATCH_SIZE} composers, max works/composer: ${MB_MAX_WORKS})...`
  );

  // Pick composers that have never been synced with MusicBrainz first, then oldest synced
  const { data: composers, error: compErr } = await supabase
    .from("composers")
    .select(
      "id, slug, name, full_name, birth_year, death_year, birth_place, nationality, musicbrainz_id, musicbrainz_synced_at"
    )
    .order("musicbrainz_synced_at", { ascending: true, nullsFirst: true })
    .order("rank_order", { ascending: true, nullsFirst: false })
    .limit(MB_BATCH_SIZE);

  if (compErr) {
    throw new Error(`Failed to fetch composers: ${compErr.message}`);
  }

  if (!composers || composers.length === 0) {
    console.log("No composers found to sync.");
    return;
  }

  let matchedArtists = 0;
  let enrichedWorks = 0;
  let insertedWorks = 0;
  let skippedDuplicates = 0;

  for (const composer of composers) {
    const artist = await findMusicBrainzArtist(composer);

    if (!artist?.id) {
      console.log(`  - ${composer.name}: no confident MusicBrainz match found`);
      await supabase
        .from("composers")
        .update({ musicbrainz_synced_at: new Date().toISOString() })
        .eq("id", composer.id);
      continue;
    }

    matchedArtists += 1;

    // Enrich composer metadata without overwriting curated values
    const composerUpdate = {
      musicbrainz_synced_at: new Date().toISOString(),
    };
    if (!composer.musicbrainz_id) composerUpdate.musicbrainz_id = artist.id;
    if (!composer.birth_place && artist["begin-area"]?.name) {
      composerUpdate.birth_place = artist["begin-area"].name;
    }
    if (
      (!composer.nationality || composer.nationality === "European") &&
      artist.area?.name
    ) {
      composerUpdate.nationality = artist.area.name;
    }

    const { error: updErr } = await supabase
      .from("composers")
      .update(composerUpdate)
      .eq("id", composer.id);

    if (updErr) {
      console.warn(`  ! Could not update ${composer.name}: ${updErr.message}`);
      continue;
    }

    // Load all existing works for this composer so our dedup matcher catches every overlap
    const { data: existingWorks } = await supabase
      .from("works")
      .select(
        "id, title, canonical_key, catalog_system, catalog_number, key_signature, openopus_id, musicbrainz_id"
      )
      .eq("composer_id", composer.id);

    const matcher = buildWorkMatcher(existingWorks ?? []);

    // Fetch works from MusicBrainz
    const mbWorksRes = await mbFetch(
      `/work?artist=${artist.id}&limit=${MB_MAX_WORKS}&fmt=json`
    );
    const mbWorks = mbWorksRes?.works ?? [];

    const toInsert = [];
    let compEnriched = 0;

    for (const mbWork of mbWorks) {
      const cleanTitle = String(mbWork.title || "").trim();
      if (!cleanTitle) continue;
      if (isMovementSubworkTitle(cleanTitle)) continue;

      const { catalog_system, catalog_number } = extractCatalog(cleanTitle);
      const keySig = extractMbKeyAttribute(mbWork);
      const canonicalKey = normalizeText(cleanTitle);
      if (!canonicalKey) continue;

      const existing = matcher.findMatch({
        musicbrainz_id: mbWork.id,
        title: cleanTitle,
        catalog_system,
        catalog_number,
      });

      if (existing) {
        // Enrich existing work with missing MusicBrainz ID, key signature, or catalog number
        const patch = {};
        if (!existing.musicbrainz_id && mbWork.id) patch.musicbrainz_id = mbWork.id;
        if (!existing.key_signature && keySig) patch.key_signature = keySig;
        if (!existing.catalog_system && catalog_system) {
          patch.catalog_system = catalog_system;
          patch.catalog_number = catalog_number;
        }

        if (Object.keys(patch).length > 0) {
          const { error: patchErr } = await supabase
            .from("works")
            .update(patch)
            .eq("id", existing.id);
          if (!patchErr) {
            Object.assign(existing, patch);
            enrichedWorks += 1;
            compEnriched += 1;
          }
        } else {
          skippedDuplicates += 1;
        }
        continue;
      }

      const newWork = {
        composer_id: composer.id,
        title: cleanTitle,
        canonical_key: canonicalKey,
        nickname: mbWork.disambiguation ? mbWork.disambiguation.slice(0, 120) : null,
        catalog_system,
        catalog_number,
        genre: mapWorkGenre(mbWork.type, cleanTitle),
        key_signature: keySig,
        is_popular: false,
        musicbrainz_id: mbWork.id,
      };

      // Register in matcher immediately to prevent intra-batch duplicates from MusicBrainz itself
      matcher.add(newWork);
      toInsert.push(newWork);
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase
        .from("works")
        .upsert(toInsert, {
          onConflict: "musicbrainz_id",
          ignoreDuplicates: true,
        });

      if (insErr) {
        console.warn(`  ! Work insert warning for ${composer.name}: ${insErr.message}`);
      } else {
        insertedWorks += toInsert.length;
      }
    }

    console.log(
      `  ✓ ${composer.name} (MBID ${artist.id.slice(0, 8)}…) — +${toInsert.length} new, ${compEnriched} enriched`
    );
  }

  console.log(
    `MusicBrainz sync complete! Matched ${matchedArtists}/${composers.length} composers, added ${insertedWorks} new works, enriched ${enrichedWorks} existing works, skipped ${skippedDuplicates} duplicates.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
