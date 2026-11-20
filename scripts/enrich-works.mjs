#!/usr/bin/env node
/**
 * Work Metadata Enrichment Script (Wikipedia + Wikidata + MusicBrainz -> Supabase)
 *
 * Populates missing work metadata:
 *   - description       (Wikipedia REST summary)
 *   - year_composed     (Wikidata P571/P1191 & MusicBrainz composer-rel dates)
 *   - movements_count   (MusicBrainz sub-work parts & Wikidata P527)
 *   - duration_minutes  (MusicBrainz median recording length & Wikidata P2047)
 *   - instrumentation   (Title/genre inference fallback if still null)
 *
 * Prioritizes `is_popular = true` (ESSENTIAL) works first, then rotates through
 * the rest of the catalog using `metadata_enriched_at ASC NULLS FIRST`.
 *
 * Environment variables:
 *   SUPABASE_URL          - e.g. https://iyfzoobqtegrrvexcqkk.supabase.co
 *   SUPABASE_SECRET_KEY   - Supabase secret / service_role key
 *   ENRICH_BATCH_SIZE     - Works to enrich per run (default: 40)
 */

import { createClient } from "@supabase/supabase-js";
import { CATALOG_REGEX, extractLastName, normalizeText } from "./lib/dedup.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENRICH_BATCH_SIZE = Math.max(
  1,
  Number(process.env.ENRICH_BATCH_SIZE || 40)
);

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const USER_AGENT =
  "OpusArchive/1.0 ( https://github.com/liubenko/opus-archive )";
const MB_BASE = "https://musicbrainz.org/ws/2";
let lastMbAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, headers = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...headers,
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function mbFetch(path, retries = 3) {
  const wait = Math.max(0, 1150 - (Date.now() - lastMbAt));
  if (wait > 0) await sleep(wait);
  lastMbAt = Date.now();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${MB_BASE}${path}`, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
      });
      if (res.ok) return res.json();
      if (res.status === 503 || res.status === 429) {
        await sleep(1500 * attempt);
        lastMbAt = Date.now();
        continue;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

function trimDescription(extract) {
  if (!extract) return null;
  const clean = extract.replace(/\s+/g, " ").trim();
  if (clean.length <= 300) return clean;
  // Take first 2 sentences up to 340 chars
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  let out = "";
  for (const s of sentences) {
    if ((out + " " + s).trim().length > 340 && out.length > 80) break;
    out = (out + " " + s).trim();
    if (out.length >= 180) break;
  }
  return out || clean.slice(0, 300).trim() + "…";
}

function parseWikidataYear(claims, prop, composerBirthYear) {
  const arr = claims?.[prop];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  for (const claim of arr) {
    const time = claim?.mainsnak?.datavalue?.value?.time;
    const m = String(time || "").match(/^[+-]?(\d{4})/);
    if (m) {
      const year = Number(m[1]);
      if (year >= 900 && year <= 2026) {
        if (!composerBirthYear || year >= composerBirthYear + 4) {
          return year;
        }
      }
    }
  }
  return null;
}

function parseWikidataDurationMinutes(claims) {
  const arr = claims?.P2047;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const val = arr[0]?.mainsnak?.datavalue?.value;
  const amount = Number(val?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = String(val?.unit || "");
  // Q7727 = minute, Q11574 = second
  if (unit.endsWith("Q11574")) {
    const mins = Math.round(amount / 60);
    return mins >= 1 && mins <= 400 ? mins : null;
  }
  if (unit.endsWith("Q7727")) {
    const mins = Math.round(amount);
    return mins >= 1 && mins <= 400 ? mins : null;
  }
  return null;
}

async function lookupWikipediaAndWikidata(work, composer) {
  const surname = extractLastName(composer.name, composer.sort_name);
  const surnameWord =
    composer.sort_name?.split(",")[0]?.trim() ||
    composer.name.split(/\s+/).pop();
  const baseTitle = work.title.replace(CATALOG_REGEX, "").trim() || work.title;

  const searchQuery = encodeURIComponent(`${baseTitle} ${surnameWord}`);
  const searchData = await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${searchQuery}&srlimit=3&format=json`
  );

  const hits = searchData?.query?.search ?? [];
  if (hits.length === 0) return null;

  const normComposerName = normalizeText(composer.name);
  const normWorkTitle = normalizeText(baseTitle);

  let bestTitle = null;
  for (const hit of hits) {
    const hitTitleNorm = normalizeText(hit.title);
    // Never pick the composer's own biography page
    if (hitTitleNorm === normComposerName) continue;
    if (hit.title.toLowerCase().startsWith("list of ")) continue;

    const combinedNorm = normalizeText(`${hit.title} ${hit.snippet || ""}`);
    const mentionsComposer = surname && combinedNorm.includes(surname);
    const titleOverlap =
      hitTitleNorm.includes(normWorkTitle.slice(0, 10)) ||
      normWorkTitle.includes(hitTitleNorm.slice(0, 10));

    if (mentionsComposer && titleOverlap) {
      bestTitle = hit.title;
      break;
    }
  }

  if (!bestTitle) return null;

  const summary = await fetchJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      bestTitle.replace(/\s+/g, "_")
    )}`
  );
  if (!summary || summary.type === "disambiguation") return null;

  const result = {
    description: trimDescription(summary.extract),
    year_composed: null,
    movements_count: null,
    duration_minutes: null,
  };

  // Query Wikidata entity if available
  const qid = summary.wikibase_item;
  if (qid) {
    const entityData = await fetchJson(
      `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`
    );
    const claims = entityData?.entities?.[qid]?.claims;
    if (claims) {
      result.year_composed =
        parseWikidataYear(claims, "P571", composer.birth_year) ||
        parseWikidataYear(claims, "P1191", composer.birth_year);

      const parts = claims.P527;
      if (Array.isArray(parts) && parts.length >= 2 && parts.length <= 60) {
        result.movements_count = parts.length;
      }

      result.duration_minutes = parseWikidataDurationMinutes(claims);
    }
  }

  return result;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function lookupMusicBrainzWork(work, composer) {
  if (!work.musicbrainz_id) return null;
  const data = await mbFetch(
    `/work/${work.musicbrainz_id}?inc=work-rels+artist-rels+recording-rels&fmt=json`
  );
  if (!data) return null;

  const relations = data.relations ?? [];
  const result = {
    year_composed: null,
    movements_count: null,
    duration_minutes: null,
  };

  // 1. Sub-work parts -> movements_count
  const subParts = relations.filter(
    (r) =>
      r["target-type"] === "work" &&
      r.type === "parts" &&
      r.direction === "forward"
  );
  if (subParts.length >= 2 && subParts.length <= 60) {
    result.movements_count = subParts.length;
  }

  // 2. Composer relation date -> year_composed
  for (const r of relations) {
    if (r["target-type"] === "artist" && r.type === "composer") {
      const d = r.end || r.begin;
      const m = String(d || "").match(/^(\d{4})/);
      if (m) {
        const yr = Number(m[1]);
        if (!composer.birth_year || yr >= composer.birth_year + 4) {
          result.year_composed = yr;
          break;
        }
      }
    }
  }

  // 3. Recording lengths -> median duration_minutes
  const recLengthsMs = relations
    .filter(
      (r) =>
        r["target-type"] === "recording" &&
        r.type === "performance" &&
        typeof r.recording?.length === "number" &&
        r.recording.length >= 30_000 &&
        r.recording.length <= 4 * 60 * 60 * 1000
    )
    .map((r) => r.recording.length);

  if (recLengthsMs.length > 0) {
    const medMs = median(recLengthsMs);
    if (medMs) {
      result.duration_minutes = Math.max(1, Math.round(medMs / 60_000));
    }
  }

  return result;
}

async function main() {
  console.log(
    `Starting work metadata enrichment (batch size: ${ENRICH_BATCH_SIZE})...`
  );

  // Pick works missing key metadata, prioritizing ESSENTIAL (is_popular) first
  const { data: works, error } = await supabase
    .from("works")
    .select(
      "id, title, genre, year_composed, description, instrumentation, movements_count, duration_minutes, is_popular, musicbrainz_id, composers(id, name, sort_name, birth_year, death_year)"
    )
    .or(
      "year_composed.is.null,description.is.null,movements_count.is.null,duration_minutes.is.null"
    )
    .order("is_popular", { ascending: false })
    .order("metadata_enriched_at", { ascending: true, nullsFirst: true })
    .limit(ENRICH_BATCH_SIZE);

  if (error) {
    throw new Error(`Failed to fetch works for enrichment: ${error.message}`);
  }

  if (!works || works.length === 0) {
    console.log("All works already have complete metadata!");
    return;
  }

  let updatedCount = 0;

  for (const work of works) {
    const composer = work.composers;
    if (!composer) continue;

    const patch = {
      metadata_enriched_at: new Date().toISOString(),
    };
    const filledFields = [];

    // Pass 2: Wikipedia + Wikidata (if missing description, year, movements, or duration)
    if (
      !work.description ||
      !work.year_composed ||
      !work.movements_count ||
      !work.duration_minutes
    ) {
      const wikiData = await lookupWikipediaAndWikidata(work, composer);
      if (wikiData) {
        if (!work.description && wikiData.description) {
          patch.description = wikiData.description;
          filledFields.push("description");
        }
        if (!work.year_composed && wikiData.year_composed) {
          patch.year_composed = wikiData.year_composed;
          filledFields.push(`year:${wikiData.year_composed}`);
        }
        if (!work.movements_count && wikiData.movements_count) {
          patch.movements_count = wikiData.movements_count;
          filledFields.push(`mvts:${wikiData.movements_count}`);
        }
        if (!work.duration_minutes && wikiData.duration_minutes) {
          patch.duration_minutes = wikiData.duration_minutes;
          filledFields.push(`dur:${wikiData.duration_minutes}m`);
        }
      }
      await sleep(120);
    }

    // Pass 3: MusicBrainz deep lookup (if MBID exists and still missing year/movements/duration)
    const stillNeedsMb =
      work.musicbrainz_id &&
      ((!work.year_composed && !patch.year_composed) ||
        (!work.movements_count && !patch.movements_count) ||
        (!work.duration_minutes && !patch.duration_minutes));

    if (stillNeedsMb) {
      const mbData = await lookupMusicBrainzWork(work, composer);
      if (mbData) {
        if (!work.year_composed && !patch.year_composed && mbData.year_composed) {
          patch.year_composed = mbData.year_composed;
          filledFields.push(`mb-year:${mbData.year_composed}`);
        }
        if (
          !work.movements_count &&
          !patch.movements_count &&
          mbData.movements_count
        ) {
          patch.movements_count = mbData.movements_count;
          filledFields.push(`mb-mvts:${mbData.movements_count}`);
        }
        if (
          !work.duration_minutes &&
          !patch.duration_minutes &&
          mbData.duration_minutes
        ) {
          patch.duration_minutes = mbData.duration_minutes;
          filledFields.push(`mb-dur:${mbData.duration_minutes}m`);
        }
      }
    }

    const { error: updErr } = await supabase
      .from("works")
      .update(patch)
      .eq("id", work.id);

    if (updErr) {
      console.warn(`  ! Failed updating work #${work.id}: ${updErr.message}`);
      continue;
    }

    if (filledFields.length > 0) {
      updatedCount += 1;
      console.log(
        `  ✓ ${composer.name} — ${work.title.slice(0, 50)} [${filledFields.join(", ")}]`
      );
    }
  }

  console.log(
    `Enrichment complete! Processed ${works.length} works, enriched ${updatedCount} with new metadata.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
