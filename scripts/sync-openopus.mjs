#!/usr/bin/env node
/**
 * Incremental Classical Music Sync Script (OpenOpus + Wikipedia -> Supabase)
 *
 * Uses shared multi-layer deduplication (scripts/lib/dedup.mjs) so composers
 * and works are never duplicated across repeated runs or across OpenOpus + MusicBrainz.
 *
 * Environment variables:
 *   SUPABASE_URL                - e.g. https://iyfzoobqtegrrvexcqkk.supabase.co
 *   SUPABASE_SECRET_KEY         - Supabase secret / service_role key (never commit!)
 *   BATCH_SIZE                  - Composers to import per run (default: 15)
 *   MAX_WORKS_PER_COMPOSER      - Max works per composer (default: 35)
 */

import { createClient } from "@supabase/supabase-js";
import {
  buildComposerMatcher,
  buildWorkMatcher,
  extractCatalog,
  extractKey,
  mapWorkGenre,
  normalizeText,
  slugify,
} from "./lib/dedup.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE = Math.max(1, Number(process.env.BATCH_SIZE || 15));
const MAX_WORKS_PER_COMPOSER = Math.max(
  1,
  Number(process.env.MAX_WORKS_PER_COMPOSER || 35)
);

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables."
  );
  process.exit(1);
}

if (SUPABASE_SECRET_KEY.startsWith("sb_publishable_")) {
  console.error(
    "SUPABASE_SECRET_KEY starts with 'sb_publishable_' (read-only). Please use your 'sb_secret_...' or 'service_role' key."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const OPENOPUS_EPOCHS = [
  "Medieval",
  "Renaissance",
  "Baroque",
  "Classical",
  "Early Romantic",
  "Romantic",
  "Late Romantic",
  "20th Century",
  "Post-War",
  "21st Century",
];

function mapEra(epoch) {
  switch (epoch) {
    case "Medieval":
      return "Medieval";
    case "Renaissance":
      return "Renaissance";
    case "Baroque":
      return "Baroque";
    case "Classical":
      return "Classical";
    case "Early Romantic":
      return "Early Romantic";
    case "Romantic":
      return "Romantic";
    case "Late Romantic":
      return "Late Romantic";
    case "20th Century":
      return "20th Century";
    case "Post-War":
    case "21st Century":
      return "Contemporary";
    default:
      return "Classical";
  }
}

function parseYear(dateStr) {
  if (!dateStr) return null;
  const match = String(dateStr).match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

function toSortName(completeName, shortName) {
  const parts = completeName.trim().split(/\s+/);
  if (parts.length <= 1) return completeName;
  const last = shortName || parts[parts.length - 1];
  const rest = completeName.replace(new RegExp(`\\b${last}$`), "").trim();
  return rest ? `${last}, ${rest}` : completeName;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "OpusArchiveBot/1.0 (classical-music-database)" },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchWikipediaSummary(completeName) {
  const encoded = encodeURIComponent(completeName.replace(/\s+/g, "_"));
  const data = await fetchJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`
  );
  if (!data || !data.extract) return null;

  const natMatch = data.extract.match(
    /\b(?:was|is)\s+an?\s+([A-Z][a-z]+(?:-[A-Z][a-z]+)?)\s+(?:composer|pianist|violinist|organist|conductor|Baroque|Classical|Romantic)/
  );

  return {
    bio: data.extract.slice(0, 600),
    nationality: natMatch ? natMatch[1] : null,
    thumbnail: data.thumbnail?.source ?? null,
    description: data.description ?? null,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(
    `Starting OpenOpus sync (batch size: ${BATCH_SIZE}, max works/composer: ${MAX_WORKS_PER_COMPOSER})...`
  );

  // 1. Load existing composers and build multi-layer deduplicator
  const { data: existingComposers, error: existingErr } = await supabase
    .from("composers")
    .select("id, slug, name, full_name, sort_name, birth_year, death_year, openopus_id, musicbrainz_id");

  if (existingErr) {
    throw new Error(`Failed to fetch existing composers: ${existingErr.message}`);
  }

  const composerMatcher = buildComposerMatcher(existingComposers ?? []);
  console.log(`Currently ${(existingComposers ?? []).length} composers in Supabase.`);

  // 2. Fetch composer directory from OpenOpus
  const candidates = [];
  const seenOpenOpusIds = new Set();

  const popData = await fetchJson(
    "https://api.openopus.org/composer/list/pop.json"
  );
  for (const c of popData?.composers ?? []) {
    if (!seenOpenOpusIds.has(c.id)) {
      seenOpenOpusIds.add(c.id);
      candidates.push(c);
    }
  }

  for (const epoch of OPENOPUS_EPOCHS) {
    const data = await fetchJson(
      `https://api.openopus.org/composer/list/epoch/${encodeURIComponent(epoch)}.json`
    );
    for (const c of data?.composers ?? []) {
      if (!seenOpenOpusIds.has(c.id)) {
        seenOpenOpusIds.add(c.id);
        candidates.push(c);
      }
    }
    await sleep(120);
  }

  console.log(`Discovered ${candidates.length} total composers in OpenOpus.`);

  // 3. Pick next batch of composers not yet in Supabase (using multi-layer dedup)
  const toImport = [];
  for (const c of candidates) {
    const birthYear = parseYear(c.birth);
    const deathYear = parseYear(c.death);
    if (!birthYear) continue;

    const slug = slugify(c.complete_name || c.name);
    const existing = composerMatcher.findMatch({
      openopus_id: c.id,
      slug,
      name: c.complete_name,
      full_name: c.complete_name,
      sort_name: toSortName(c.complete_name, c.name),
      birth_year: birthYear,
      death_year: deathYear,
    });

    if (existing) {
      // Backfill openopus_id on existing composer if missing
      if (!existing.openopus_id) {
        await supabase
          .from("composers")
          .update({ openopus_id: String(c.id) })
          .eq("id", existing.id);
      }
      continue;
    }

    toImport.push({ ...c, slug, birthYear, deathYear });
    if (toImport.length >= BATCH_SIZE) break;
  }

  if (toImport.length === 0) {
    console.log("All OpenOpus composers are already synced!");
    return;
  }

  console.log(`Importing ${toImport.length} new composers...`);

  let insertedComposers = 0;
  let insertedWorks = 0;

  for (const c of toImport) {
    const wiki = await fetchWikipediaSummary(c.complete_name);
    const era = mapEra(c.epoch);
    const shortBio =
      wiki?.bio ||
      `${c.complete_name} (${c.birthYear}${c.deathYear ? `–${c.deathYear}` : ""}) was a ${era} composer featured in the OpenOpus classical repertoire.`;

    const newComposerRow = {
      slug: c.slug,
      name: c.complete_name,
      full_name: c.complete_name,
      sort_name: toSortName(c.complete_name, c.name),
      era,
      nationality: wiki?.nationality || "European",
      birth_year: c.birthYear,
      death_year: c.deathYear,
      avatar_url: c.portrait || wiki?.thumbnail || null,
      short_bio: shortBio,
      notable_for: wiki?.description || `${era} composer`,
      openopus_id: String(c.id),
    };

    const { data: inserted, error: compErr } = await supabase
      .from("composers")
      .upsert(newComposerRow, { onConflict: "slug" })
      .select("id")
      .single();

    if (compErr || !inserted) {
      console.error(`Failed to upsert ${c.complete_name}:`, compErr?.message);
      continue;
    }

    composerMatcher.add({ ...newComposerRow, id: inserted.id });
    insertedComposers += 1;

    // Fetch works for this composer from OpenOpus and deduplicate before inserting
    const worksData = await fetchJson(
      `https://api.openopus.org/work/list/composer/${c.id}/genre/all.json`
    );
    const rawWorks = worksData?.works ?? [];

    const sortedWorks = [...rawWorks].sort((a, b) => {
      const scoreA = (a.popular === "1" ? 2 : 0) + (a.recommended === "1" ? 1 : 0);
      const scoreB = (b.popular === "1" ? 2 : 0) + (b.recommended === "1" ? 1 : 0);
      return scoreB - scoreA;
    });

    const workMatcher = buildWorkMatcher([]);
    const rows = [];

    for (const w of sortedWorks) {
      if (rows.length >= MAX_WORKS_PER_COMPOSER) break;
      const cleanTitle = String(w.title || "").trim();
      const canonicalKey = normalizeText(cleanTitle);
      if (!cleanTitle || !canonicalKey) continue;

      const { catalog_system, catalog_number } = extractCatalog(cleanTitle);
      if (
        workMatcher.findMatch({
          openopus_id: w.id,
          title: cleanTitle,
          catalog_system,
          catalog_number,
        })
      ) {
        continue;
      }

      const row = {
        composer_id: inserted.id,
        title: cleanTitle,
        canonical_key: canonicalKey,
        nickname: w.subtitle || null,
        catalog_system,
        catalog_number,
        genre: mapWorkGenre(w.genre, cleanTitle),
        key_signature: extractKey(cleanTitle),
        is_popular: w.popular === "1" || w.recommended === "1",
        description: w.searchterms ? `Also known as: ${w.searchterms}` : null,
        openopus_id: w.id ? String(w.id) : null,
      };
      workMatcher.add(row);
      rows.push(row);
    }

    if (rows.length > 0) {
      const { error: worksErr } = await supabase.from("works").insert(rows);
      if (worksErr) {
        console.error(
          `Failed to insert works for ${c.complete_name}:`,
          worksErr.message
        );
      } else {
        insertedWorks += rows.length;
      }
    }

    console.log(`  ✓ ${c.complete_name} (${era}) — ${rows.length} works`);
    await sleep(250);
  }

  console.log(
    `Done! Added ${insertedComposers} composers and ${insertedWorks} works.`
  );

  if (toImport.length > 0 && insertedComposers === 0) {
    throw new Error(
      "All composer upserts failed. Check SUPABASE_SECRET_KEY and service_role table permissions."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
