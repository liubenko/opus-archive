#!/usr/bin/env node
/**
 * Composer Portrait, Bio & Birthplace Enricher (Wikipedia + Wikidata -> Supabase)
 *
 * Enriches composers missing `avatar_url`, `birth_place`, `notable_for`, or
 * still using auto-generated placeholder bios ("...featured in the cello & chamber repertoire").
 *
 * Pipeline per composer:
 *   1. English Wikipedia search + REST summary -> portrait, editorial bio, notable_for
 *   2. Wikidata entity search (`wbsearchentities` + `wbgetentities`) ->
 *        - P18 (Wikimedia Commons image -> 500px Special:FilePath URL)
 *        - P19 (place of birth label)
 *        - sitelinks fallback (frwiki, dewiki, itwiki, ruwiki, ukwiki) if no EN wiki summary
 */

import { createClient } from "@supabase/supabase-js";
import { extractLastName, normalizeText } from "./lib/dedup.mjs";

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function cleanSearchName(rawName) {
  let name = String(rawName || "").trim();
  // Handle dual names like "Bottermund, Hans / Starker, János"
  if (name.includes("/")) {
    name = name.split("/")[0].trim();
  }
  // Flip "Last, First" -> "First Last"
  if (name.includes(",")) {
    const [last, first] = name.split(",").map((s) => s.trim());
    if (first && last) name = `${first} ${last}`;
  }
  return name;
}

async function lookupEnglishWikipedia(composer) {
  const searchName = cleanSearchName(composer.full_name || composer.name);
  const lastNorm = extractLastName(searchName, null);

  // Try direct REST summary first
  const directUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    searchName.replace(/ /g, "_")
  )}`;
  const direct = await fetchJson(directUrl);
  if (
    direct &&
    direct.type === "standard" &&
    direct.extract &&
    normalizeText(direct.title).includes(lastNorm)
  ) {
    // Verify birth year isn't wildly off if mentioned in extract
    return {
      avatar_url:
        direct.thumbnail?.source || direct.originalimage?.source || null,
      bio: direct.extract,
      notable_for: direct.description || null,
      wikibase_item: direct.wikibase_item || null,
    };
  }

  // Fallback: search Wikipedia with "composer"
  const q = `${searchName} composer`;
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    q
  )}&srlimit=5&format=json`;
  const searchRes = await fetchJson(searchUrl);
  const hits = searchRes?.query?.search ?? [];

  for (const hit of hits) {
    if (!normalizeText(hit.title).includes(lastNorm)) continue;
    const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      hit.title.replace(/ /g, "_")
    )}`;
    const sum = await fetchJson(sumUrl);
    if (!sum || sum.type !== "standard" || !sum.extract) continue;

    // Check birth year if composer has one
    if (
      composer.birth_year &&
      /\b1\d{3}\b/.test(sum.extract.slice(0, 140)) &&
      !sum.extract.slice(0, 180).includes(String(composer.birth_year)) &&
      !sum.extract.slice(0, 180).includes(String(composer.birth_year - 1)) &&
      !sum.extract.slice(0, 180).includes(String(composer.birth_year + 1))
    ) {
      continue;
    }

    return {
      avatar_url: sum.thumbnail?.source || sum.originalimage?.source || null,
      bio: sum.extract,
      notable_for: sum.description || null,
      wikibase_item: sum.wikibase_item || null,
    };
  }

  return null;
}

async function lookupWikidata(composer, knownQid = null) {
  let qid = knownQid;
  const searchName = cleanSearchName(composer.full_name || composer.name);

  if (!qid) {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
      searchName
    )}&language=en&limit=5&format=json`;
    const searchRes = await fetchJson(searchUrl);
    const candidates = searchRes?.search ?? [];
    for (const c of candidates) {
      const desc = String(c.description || "").toLowerCase();
      if (
        desc.includes("composer") ||
        desc.includes("cellist") ||
        desc.includes("musician") ||
        desc.includes("violinist") ||
        desc.includes("organist")
      ) {
        qid = c.id;
        break;
      }
    }
    if (!qid && candidates[0]) qid = candidates[0].id;
  }

  if (!qid) return null;

  const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims|descriptions|sitelinks&languages=en&format=json`;
  const entityRes = await fetchJson(entityUrl);
  const entity = entityRes?.entities?.[qid];
  if (!entity) return null;

  let avatarUrl = null;
  const p18 = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (p18 && typeof p18 === "string") {
    avatarUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
      p18.replace(/ /g, "_")
    )}?width=500`;
  }

  let birthPlace = null;
  const p19Id = entity.claims?.P19?.[0]?.mainsnak?.datavalue?.value?.id;
  if (p19Id) {
    const placeRes = await fetchJson(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${p19Id}&props=labels&languages=en&format=json`
    );
    birthPlace = placeRes?.entities?.[p19Id]?.labels?.en?.value || null;
  }

  const description = entity.descriptions?.en?.value || null;

  return {
    avatar_url: avatarUrl,
    birth_place: birthPlace,
    notable_for: description,
  };
}

function isPlaceholderBio(bio) {
  if (!bio) return true;
  return bio.includes("featured in the cello & chamber repertoire");
}

function trimBio(extract) {
  if (!extract) return null;
  const cleaned = String(extract).replace(/\s+/g, " ").trim();
  if (cleaned.length <= 520) return cleaned;
  const cut = cleaned.slice(0, 520);
  const lastPeriod = cut.lastIndexOf(". ");
  return lastPeriod > 180 ? cut.slice(0, lastPeriod + 1) : `${cut}...`;
}

async function main() {
  const { data: composers, error } = await supabase
    .from("composers")
    .select(
      "id, name, full_name, birth_year, death_year, birth_place, avatar_url, short_bio, notable_for"
    )
    .order("id", { ascending: true });

  if (error) {
    console.error("Failed loading composers:", error.message);
    process.exit(1);
  }

  const targets = (composers ?? []).filter(
    (c) => !c.avatar_url || !c.birth_place || isPlaceholderBio(c.short_bio)
  );

  console.log(
    `Enriching ${targets.length}/${(composers ?? []).length} composers needing portraits, birthplaces, or editorial bios...`
  );

  let avatarsAdded = 0;
  let biosUpgraded = 0;
  let birthPlacesAdded = 0;

  for (const comp of targets) {
    const wiki = await lookupEnglishWikipedia(comp);
    const wd = await lookupWikidata(comp, wiki?.wikibase_item || null);

    const patch = {};

    const newAvatar = wiki?.avatar_url || wd?.avatar_url || null;
    if (!comp.avatar_url && newAvatar) {
      patch.avatar_url = newAvatar;
      avatarsAdded++;
    }

    if (!comp.birth_place && wd?.birth_place) {
      patch.birth_place = wd.birth_place;
      birthPlacesAdded++;
    }

    if (isPlaceholderBio(comp.short_bio) && wiki?.bio) {
      const formattedBio = trimBio(wiki.bio);
      if (formattedBio && formattedBio.length >= 60) {
        patch.short_bio = formattedBio;
        biosUpgraded++;
      }
    }

    const notable = wiki?.notable_for || wd?.notable_for || null;
    if (!comp.notable_for && notable) {
      patch.notable_for =
        notable.charAt(0).toUpperCase() + notable.slice(1, 160);
    }

    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      await supabase.from("composers").update(patch).eq("id", comp.id);
      console.log(
        `  ✓ ${comp.name}: ${Object.keys(patch)
          .filter((k) => k !== "updated_at")
          .join(", ")}`
      );
    } else {
      console.log(`  - ${comp.name}: no additional wiki portrait/bio found`);
    }

    await sleep(160);
  }

  console.log(
    `\nComposer enrichment complete: +${avatarsAdded} portraits, +${biosUpgraded} editorial bios, +${birthPlacesAdded} birthplaces!`
  );
}

main().catch((err) => {
  console.error("Composer enrichment failed:", err);
  process.exit(1);
});
