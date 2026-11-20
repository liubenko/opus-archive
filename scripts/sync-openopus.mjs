#!/usr/bin/env node
/**
 * Incremental Classical Music Sync Script (OpenOpus + Wikipedia -> Supabase)
 *
 * Fetches composers and their cataloged works from the open-source OpenOpus API,
 * enriches biographies via Wikipedia's REST API, extracts opus/thematic catalog
 * numbers (Op., BWV, K., Hob., RV, D., S., WWV, HWV, L., M., WoO, etc.), and
 * upserts a clean batch into the Supabase `composers` database.
 *
 * Environment variables:
 *   SUPABASE_URL                - e.g. https://iyfzoobqtegrrvexcqkk.supabase.co
 *   SUPABASE_SECRET_KEY         - Supabase secret / service_role key (never commit!)
 *   BATCH_SIZE                  - Composers to import per run (default: 15)
 *   MAX_WORKS_PER_COMPOSER      - Max works per composer (default: 35)
 */

import { createClient } from "@supabase/supabase-js";

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

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

const CATALOG_REGEX =
  /\b(Op\.?\s*\d+[a-z]?(?:,\s*No\.?\s*\d+)?|BWV\s*\d+[a-z]?|K\.?\s*\d+[a-z]?|KV\.?\s*\d+[a-z]?|Hob\.?\s*[IVXLCa-z]+:\s*\d+[a-z]?|RV\s*\d+[a-z]?|D\.?\s*\d+[a-z]?|S\.?\s*\d+(?:\/\d+)?|WWV\s*\d+[A-Z]?|WoO\s*\d+(?:,\s*No\.?\s*\d+)?|HWV\s*\d+[a-z]?|L\.?\s*\d+|M\.?\s*\d+|Z\.?\s*\d+|Sz\.?\s*\d+|TWV\s*\d+:\w+)\b/i;

function extractCatalog(title) {
  const match = title.match(CATALOG_REGEX);
  if (!match) return { catalog_system: null, catalog_number: null };
  const raw = match[1].trim();
  const sysMatch = raw.match(/^([A-Za-z]+\.?)\s*(.+)$/);
  if (!sysMatch) return { catalog_system: null, catalog_number: raw };
  let system = sysMatch[1];
  if (/^op\.?$/i.test(system)) system = "Op.";
  else if (/^kv\.?$/i.test(system) || /^k\.?$/i.test(system)) system = "K.";
  else if (/^hob\.?$/i.test(system)) system = "Hob.";
  else if (/^d\.?$/i.test(system)) system = "D.";
  else if (/^s\.?$/i.test(system)) system = "S.";
  else if (/^l\.?$/i.test(system)) system = "L.";
  else if (/^m\.?$/i.test(system)) system = "M.";
  else if (/^z\.?$/i.test(system)) system = "Z.";
  else if (/^sz\.?$/i.test(system)) system = "Sz.";
  else if (/^woo$/i.test(system)) system = "WoO";
  else system = system.toUpperCase();

  return {
    catalog_system: system,
    catalog_number: sysMatch[2].trim(),
  };
}

function mapGenre(openOpusGenre, title) {
  const lower = title.toLowerCase();
  if (lower.includes("symphony") || lower.includes("sinfonia")) return "Symphony";
  if (lower.includes("concerto")) return "Concerto";
  if (lower.includes("ballet")) return "Ballet";
  if (
    lower.includes("requiem") ||
    lower.includes("mass ") ||
    lower.includes("stabat mater") ||
    lower.includes("magnificat") ||
    lower.includes("passion") ||
    lower.includes("oratorio")
  ) {
    return "Sacred";
  }
  switch (openOpusGenre) {
    case "Keyboard":
      return "Piano Solo";
    case "Chamber":
      return "Chamber";
    case "Stage":
      return "Opera";
    case "Vocal":
      return "Choral & Vocal";
    case "Orchestral":
      return "Orchestral";
    default:
      return "Orchestral";
  }
}

function extractKey(title) {
  const match = title.match(
    /\bin\s+([A-G](?:-flat|-sharp| flat| sharp|♭|♯)?\s+(?:major|minor))\b/i
  );
  return match ? match[1] : null;
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

  // Try to extract nationality from the first sentence (e.g. "was a German composer")
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

  // 1. Load existing composer slugs & names from Supabase
  const { data: existingComposers, error: existingErr } = await supabase
    .from("composers")
    .select("id, slug, name, full_name");

  if (existingErr) {
    throw new Error(`Failed to fetch existing composers: ${existingErr.message}`);
  }

  const existingSlugs = new Set(existingComposers.map((c) => c.slug));
  const existingNames = new Set(
    existingComposers.flatMap((c) => [
      c.name.toLowerCase(),
      (c.full_name || "").toLowerCase(),
    ])
  );
  console.log(`Currently ${existingSlugs.size} composers in Supabase.`);

  // 2. Fetch composer directory from OpenOpus (popular first, then all epochs)
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

  // 3. Pick next batch of composers not yet in Supabase
  const toImport = [];
  for (const c of candidates) {
    const slug = slugify(c.complete_name || c.name);
    if (
      existingSlugs.has(slug) ||
      existingNames.has((c.complete_name || "").toLowerCase())
    ) {
      continue;
    }
    const birthYear = parseYear(c.birth);
    if (!birthYear) continue;
    toImport.push({ ...c, slug, birthYear, deathYear: parseYear(c.death) });
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

    const { data: inserted, error: compErr } = await supabase
      .from("composers")
      .upsert(
        {
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
        },
        { onConflict: "slug" }
      )
      .select("id")
      .single();

    if (compErr || !inserted) {
      console.error(`Failed to upsert ${c.complete_name}:`, compErr?.message);
      continue;
    }

    insertedComposers += 1;

    // Fetch works for this composer from OpenOpus
    const worksData = await fetchJson(
      `https://api.openopus.org/work/list/composer/${c.id}/genre/all.json`
    );
    const rawWorks = worksData?.works ?? [];

    // Prioritize popular & recommended works first
    const sortedWorks = [...rawWorks].sort((a, b) => {
      const scoreA = (a.popular === "1" ? 2 : 0) + (a.recommended === "1" ? 1 : 0);
      const scoreB = (b.popular === "1" ? 2 : 0) + (b.recommended === "1" ? 1 : 0);
      return scoreB - scoreA;
    });

    const selectedWorks = sortedWorks.slice(0, MAX_WORKS_PER_COMPOSER);
    if (selectedWorks.length > 0) {
      const rows = selectedWorks.map((w) => {
        const { catalog_system, catalog_number } = extractCatalog(w.title);
        return {
          composer_id: inserted.id,
          title: w.title,
          nickname: w.subtitle || null,
          catalog_system,
          catalog_number,
          genre: mapGenre(w.genre, w.title),
          key_signature: extractKey(w.title),
          is_popular: w.popular === "1" || w.recommended === "1",
          description: w.searchterms ? `Also known as: ${w.searchterms}` : null,
        };
      });

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

    console.log(
      `  ✓ ${c.complete_name} (${era}) — ${selectedWorks.length} works`
    );
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
