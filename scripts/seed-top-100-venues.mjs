#!/usr/bin/env node
/**
 * Enriches the Top 100 Global Concert Halls & Opera Houses via Wikipedia REST API
 * (photos, descriptions, Wikidata QIDs) and emits compact multi-row idempotent SQL (or upserts directly).
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { TOP_100_VENUES } from "./data/top-100-venues.mjs";

const UA =
  "OpusArchive/1.0 (https://github.com/liubenko/opus-archive; world stage venue atlas)";

const emitArg = process.argv.find((a) => a.startsWith("--emit-sql="));
const EMIT_SQL_PATH = emitArg ? emitArg.slice("--emit-sql=".length) : null;

function sqlLit(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function fetchWikiMeta(wikiTitle) {
  if (!wikiTitle) return null;
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`,
      { headers: { "User-Agent": UA } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json.type === "disambiguation" || /may refer to:/i.test(json.extract || "")) {
      return null;
    }
    return {
      qid: json.wikibase_item || null,
      photo_url: json.thumbnail?.source || null,
      extract: json.extract ? String(json.extract).slice(0, 360) : null,
    };
  } catch {
    return null;
  }
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await fn(items[cur], cur);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

async function main() {
  console.log(
    `Enriching ${TOP_100_VENUES.length} global concert halls via Wikipedia REST API...`
  );

  const enriched = await mapPool(TOP_100_VENUES, 12, async (v) => {
    const wiki = await fetchWikiMeta(v.wiki_title);
    return {
      slug: v.slug,
      name: v.name,
      short_name: v.short_name,
      city: v.city,
      country: v.country,
      country_code: v.country_code,
      latitude: v.latitude,
      longitude: v.longitude,
      capacity: v.capacity ?? null,
      opened_year: v.opened_year ?? null,
      architect_or_acoustics: v.architect_or_acoustics ?? null,
      website_url: v.website_url ?? null,
      calendar_url: v.calendar_url ?? null,
      photo_url: wiki?.photo_url ?? null,
      wikidata_qid: wiki?.qid ?? null,
      feed_type: v.feed_type || "auto",
      tier: 1,
      description:
        v.description ||
        wiki?.extract ||
        `${v.name} — landmark classical concert venue in ${v.city}, ${v.country}.`,
    };
  });

  const withPhotos = enriched.filter((x) => x.photo_url).length;
  console.log(
    `Enriched ${enriched.length} venues (${withPhotos} with Wikipedia Commons photographs).`
  );

  if (EMIT_SQL_PATH) {
    const nowIso = new Date().toISOString();
    const tuples = enriched.map(
      (v) =>
        `(${sqlLit(v.slug)}, ${sqlLit(v.name)}, ${sqlLit(v.short_name)}, ${sqlLit(v.city)}, ${sqlLit(v.country)}, ${sqlLit(v.country_code)}, ${sqlLit(v.latitude)}, ${sqlLit(v.longitude)}, ${sqlLit(v.capacity)}, ${sqlLit(v.opened_year)}, ${sqlLit(v.architect_or_acoustics)}, ${sqlLit(v.website_url)}, ${sqlLit(v.calendar_url)}, ${sqlLit(v.photo_url)}, ${sqlLit(v.wikidata_qid)}, ${sqlLit(v.feed_type)}, 1, ${sqlLit(v.description)}, ${sqlLit(nowIso)})`
    );

    const sql = `INSERT INTO public.venues (
  slug, name, short_name, city, country, country_code,
  latitude, longitude, capacity, opened_year, architect_or_acoustics,
  website_url, calendar_url, photo_url, wikidata_qid, feed_type, tier, description, updated_at
) VALUES
${tuples.join(",\n")}
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  city = EXCLUDED.city,
  country = EXCLUDED.country,
  country_code = EXCLUDED.country_code,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  capacity = COALESCE(EXCLUDED.capacity, public.venues.capacity),
  opened_year = COALESCE(EXCLUDED.opened_year, public.venues.opened_year),
  architect_or_acoustics = COALESCE(EXCLUDED.architect_or_acoustics, public.venues.architect_or_acoustics),
  website_url = COALESCE(EXCLUDED.website_url, public.venues.website_url),
  calendar_url = COALESCE(EXCLUDED.calendar_url, public.venues.calendar_url),
  photo_url = COALESCE(EXCLUDED.photo_url, public.venues.photo_url),
  wikidata_qid = COALESCE(EXCLUDED.wikidata_qid, public.venues.wikidata_qid),
  feed_type = COALESCE(EXCLUDED.feed_type, public.venues.feed_type),
  tier = 1,
  description = COALESCE(public.venues.description, EXCLUDED.description),
  updated_at = EXCLUDED.updated_at;`;

    fs.mkdirSync(path.dirname(EMIT_SQL_PATH), { recursive: true });
    fs.writeFileSync(EMIT_SQL_PATH, sql, "utf8");
    console.log(`Wrote compact SQL (${sql.length} bytes) to ${EMIT_SQL_PATH}`);
    return;
  }

  const SUPABASE_URL =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  const { error } = await supabase
    .from("venues")
    .upsert(enriched, { onConflict: "slug" });
  if (error) throw error;
  console.log(`Upserted ${enriched.length} venues to Supabase!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
