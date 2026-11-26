#!/usr/bin/env node
/**
 * Wikidata Composer Lineage Sync (P1066 student of / P737 influenced by -> Supabase)
 *
 * Queries Wikidata's public SPARQL endpoint for documented teacher/student (P1066)
 * and artistic influence (P737) relationships between composers already in `public.composers`,
 * and inserts any missing links into `public.composer_relations`.
 *
 * Environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SECRET_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { normalizeText } from "./lib/dedup.mjs";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const USER_AGENT =
  "OpusArchive/1.0 ( https://github.com/liubenko/opus-archive )";

async function runSparql(query) {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(
    query
  )}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/sparql-results+json",
    },
  });
  if (!res.ok) {
    throw new Error(`Wikidata SPARQL failed: ${res.status}`);
  }
  const json = await res.json();
  return json?.results?.bindings ?? [];
}

async function main() {
  console.log("Loading composers and existing relations from Supabase...");
  const [compRes, relRes] = await Promise.all([
    supabase.from("composers").select("id, name, full_name, birth_year"),
    supabase
      .from("composer_relations")
      .select("source_composer_id, target_composer_id, relation_type"),
  ]);

  if (compRes.error) throw compRes.error;
  if (relRes.error) throw relRes.error;

  const composers = compRes.data ?? [];
  const existingSet = new Set(
    (relRes.data ?? []).map(
      (r) => `${r.source_composer_id}:${r.target_composer_id}:${r.relation_type}`
    )
  );

  // Build normalized name lookup (both name & full_name)
  const byNormName = new Map();
  for (const c of composers) {
    for (const raw of [c.name, c.full_name]) {
      const k = normalizeText(raw);
      if (k && !byNormName.has(k)) byNormName.set(k, c);
    }
  }

  // Query Wikidata for classical composers with P1066 (student of) or P737 (influenced by)
  const sparql = `
    SELECT DISTINCT ?studentLabel ?teacherLabel ?prop WHERE {
      VALUES ?prop { wdt:P1066 wdt:P737 }
      ?student wdt:P106 wd:Q36834 ;
               ?prop ?teacher .
      ?teacher wdt:P106 wd:Q36834 .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 6000
  `;

  console.log("Querying Wikidata SPARQL for composer lineages...");
  const rows = await runSparql(sparql);
  console.log(`Received ${rows.length} candidate composer links from Wikidata.`);

  const toInsert = [];

  for (const row of rows) {
    const targetName = row.studentLabel?.value;
    const sourceName = row.teacherLabel?.value;
    const propUri = row.prop?.value || "";
    if (!targetName || !sourceName) continue;

    const source = byNormName.get(normalizeText(sourceName));
    const target = byNormName.get(normalizeText(targetName));
    if (!source || !target || source.id === target.id) continue;

    // Sanity check chronological order (teacher/influencer shouldn't be born >40y after student)
    if (source.birth_year && target.birth_year && source.birth_year > target.birth_year + 40) {
      continue;
    }

    const relationType = propUri.endsWith("P1066") ? "teacher_of" : "influenced";
    const key = `${source.id}:${target.id}:${relationType}`;
    if (existingSet.has(key)) continue;

    existingSet.add(key);
    toInsert.push({
      source_composer_id: source.id,
      target_composer_id: target.id,
      relation_type: relationType,
      strength: relationType === "teacher_of" ? 5 : 3,
      description:
        relationType === "teacher_of"
          ? `${target.name} studied under ${source.name}.`
          : `${source.name} influenced the musical style of ${target.name}.`,
    });
  }

  console.log(`Found ${toInsert.length} new verified composer relations to insert.`);

  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100);
    const { error } = await supabase.from("composer_relations").insert(batch);
    if (error) {
      console.error("Failed inserting relations batch:", error.message);
      process.exit(1);
    }
  }

  console.log(`Inserted ${toInsert.length} new composer relations!`);
}

main().catch((err) => {
  console.error("Relations sync failed:", err);
  process.exit(1);
});
