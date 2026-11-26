#!/usr/bin/env node
/**
 * IMSLP Score Link Sync Script (IMSLP MediaWiki API -> Supabase)
 *
 * Connects Opus Archive composers & works to verified IMSLP score pages:
 *   1. Resolves each composer's IMSLP category (e.g. Category:Bach,_Johann_Sebastian)
 *      and saves `composers.imslp_url`.
 *   2. Fetches all work pages in that composer's IMSLP category via `imslp.org/api.php`.
 *   3. Matches DB works by:
 *        - Exact catalog number (BWV, Op., K., Hob., RV, D., S., WoO, HWV, etc.)
 *          including catalog ranges (e.g. BWV 1007 -> BWV 1007-1012)
 *        - High-confidence normalized title / nickname similarity
 *   4. Saves verified `https://imslp.org/wiki/...` URLs to `works.imslp_url`.
 *
 * Environment variables:
 *   SUPABASE_URL          - e.g. https://iyfzoobqtegrrvexcqkk.supabase.co
 *   SUPABASE_SECRET_KEY   - Supabase secret / service_role key
 *   IMSLP_BATCH_SIZE      - Composers to sync per run (default: 25)
 *
 * Optional CLI flags:
 *   --composer=<slug>     - Sync one specific composer by slug
 *   --limit=<n>           - Override IMSLP_BATCH_SIZE
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  extractCatalog,
  extractLastName,
  normalizeCatalogKey,
  normalizeText,
  normalizeWorkBaseTitle,
} from "./lib/dedup.mjs";

// Load .env.local if running locally without exported env vars
function loadDotEnvIfNeeded() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) return;
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnvIfNeeded();

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Set them in env or .env.local."
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const composerFlag = args
  .find((a) => a.startsWith("--composer="))
  ?.split("=")[1]
  ?.trim();
const limitFlag = args
  .find((a) => a.startsWith("--limit="))
  ?.split("=")[1]
  ?.trim();

const BATCH_SIZE = Math.max(
  1,
  Number(limitFlag || process.env.IMSLP_BATCH_SIZE || 25)
);

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const IMSLP_API = "https://imslp.org/api.php";
const USER_AGENT =
  "OpusArchive/1.0 ( https://github.com/liubenko/opus-archive )";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function imslpFetch(params, retries = 3) {
  const url = new URL(IMSLP_API);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * attempt);
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      await sleep(750 * attempt);
    }
  }
  return null;
}

function imslpPageUrl(pageTitle) {
  const normalized = String(pageTitle).replace(/ /g, "_");
  return `https://imslp.org/wiki/${encodeURIComponent(normalized).replace(
    /%2F/g,
    "/"
  ).replace(/%3A/g, ":").replace(/%2C/g, ",").replace(/%28/g, "(").replace(/%29/g, ")")}`;
}

/**
 * Resolves a composer's IMSLP Category title (e.g. "Category:Bach, Johann Sebastian").
 */
async function resolveComposerCategory(composer) {
  const candidates = [];

  if (composer.sort_name && composer.sort_name.includes(",")) {
    candidates.push(`Category:${composer.sort_name.trim()}`);
  }

  // Construct "Last, First Middle" from full_name / name
  for (const rawName of [composer.full_name, composer.name]) {
    if (!rawName) continue;
    const parts = rawName.trim().split(/\s+/);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const first = parts.slice(0, -1).join(" ");
      candidates.push(`Category:${last}, ${first}`);
    }
  }

  const seen = new Set();
  for (const catTitle of candidates) {
    if (seen.has(catTitle)) continue;
    seen.add(catTitle);
    const data = await imslpFetch({
      action: "query",
      list: "categorymembers",
      cmtitle: catTitle,
      cmnamespace: "0",
      cmlimit: "5",
    });
    const members = data?.query?.categorymembers ?? [];
    if (members.length > 0) {
      return catTitle;
    }
    await sleep(150);
  }

  // Fallback: search IMSLP Category namespace (14)
  const lastNameNorm = extractLastName(composer.name, composer.sort_name);
  const searchData = await imslpFetch({
    action: "query",
    list: "search",
    srnamespace: "14",
    srsearch: composer.name,
    srlimit: "8",
  });

  const hits = searchData?.query?.search ?? [];
  for (const hit of hits) {
    const title = hit.title || "";
    if (!title.startsWith("Category:")) continue;
    const catBody = title.slice("Category:".length);
    // Composer categories on IMSLP are formatted "Last, First" and exclude "Works by ..." / "People..."
    if (!catBody.includes(",")) continue;
    const catLast = normalizeText(catBody.split(",")[0]);
    if (catLast === lastNameNorm) {
      // Confirm it actually has work pages
      const check = await imslpFetch({
        action: "query",
        list: "categorymembers",
        cmtitle: title,
        cmnamespace: "0",
        cmlimit: "3",
      });
      if ((check?.query?.categorymembers ?? []).length > 0) {
        return title;
      }
    }
  }

  return null;
}

/**
 * Fetches all main-namespace work page titles in an IMSLP composer category.
 */
async function fetchCategoryWorkPages(categoryTitle, maxPages = 4000) {
  const titles = [];
  let cmcontinue = null;

  while (titles.length < maxPages) {
    const data = await imslpFetch({
      action: "query",
      list: "categorymembers",
      cmtitle: categoryTitle,
      cmnamespace: "0",
      cmlimit: "500",
      cmcontinue: cmcontinue || undefined,
    });
    const members = data?.query?.categorymembers ?? [];
    for (const m of members) {
      if (m.title) titles.push(m.title);
    }
    cmcontinue = data?.continue?.cmcontinue || null;
    if (!cmcontinue || members.length === 0) break;
    await sleep(150);
  }

  return titles;
}

const STOP_WORDS = new Set([
  "in",
  "for",
  "and",
  "the",
  "of",
  "a",
  "an",
  "no",
  "nr",
  "op",
  "major",
  "minor",
  "flat",
  "sharp",
  "with",
  "from",
  "on",
  "by",
  "de",
  "la",
  "le",
  "les",
  "du",
  "des",
  "der",
  "die",
  "das",
  "und",
  "fur",
  "mit",
  "aus",
  "in",
  "solo",
]);

function stripImslpComposerSuffix(imslpTitle) {
  // IMSLP titles end with "(Composer, Name)"
  return String(imslpTitle || "").replace(/\s*\([^()]*,[^()]*\)\s*$/, "").trim();
}

function tokenizeTitle(str) {
  const cleaned = String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = cleaned
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

function tokenSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const t of setA) {
    if (setB.has(t)) shared++;
  }
  return (2 * shared) / (setA.size + setB.size);
}

/**
 * Extracts catalog keys AND catalog ranges (e.g. "BWV 1007-1012") from an IMSLP title.
 */
function extractImslpCatalogKeys(cleanTitle) {
  const keys = [];
  const ranges = [];

  const single = extractCatalog(cleanTitle);
  const singleKey = normalizeCatalogKey(
    single.catalog_system,
    single.catalog_number
  );
  if (singleKey) keys.push(singleKey);

  // Detect numeric ranges like "BWV 1007-1012" or "Op. 18, Nos. 1-6" or "RV 269-272"
  const rangeMatch = cleanTitle.match(
    /\b(BWV|RV|HWV|K\.?|KV\.?|D\.?|S\.?|WWV|WoO|Op\.?)\s*(\d+)\s*[-–]\s*(\d+)\b/i
  );
  if (rangeMatch) {
    const sysRaw = rangeMatch[1];
    const startNum = Number(rangeMatch[2]);
    const endNum = Number(rangeMatch[3]);
    if (
      Number.isFinite(startNum) &&
      Number.isFinite(endNum) &&
      endNum > startNum &&
      endNum - startNum <= 30
    ) {
      const sysNorm = normalizeCatalogKey(sysRaw, "1")?.split(":")[0];
      if (sysNorm) {
        ranges.push({ sys: sysNorm, start: startNum, end: endNum });
      }
    }
  }

  return { keys, ranges };
}

/**
 * Builds fast lookup indexes for a composer's IMSLP pages.
 */
function buildImslpIndex(pageTitles) {
  const byCatalog = new Map(); // catKey -> array of entries
  const catalogRanges = []; // { sys, start, end, entry }
  const byBaseTitle = new Map(); // normalized base title -> entry
  const allEntries = [];

  for (const pageTitle of pageTitles) {
    const cleanTitle = stripImslpComposerSuffix(pageTitle);
    const baseNorm = normalizeWorkBaseTitle(cleanTitle);
    const tokens = tokenizeTitle(cleanTitle);
    const { keys, ranges } = extractImslpCatalogKeys(cleanTitle);

    const entry = {
      pageTitle,
      cleanTitle,
      baseNorm,
      tokens,
      url: imslpPageUrl(pageTitle),
    };

    allEntries.push(entry);

    if (baseNorm && !byBaseTitle.has(baseNorm)) {
      byBaseTitle.set(baseNorm, entry);
    }

    for (const k of keys) {
      if (!byCatalog.has(k)) byCatalog.set(k, []);
      byCatalog.get(k).push(entry);
    }

    for (const r of ranges) {
      catalogRanges.push({ ...r, entry });
    }
  }

  return { byCatalog, catalogRanges, byBaseTitle, allEntries };
}

/**
 * Matches a single DB work against a composer's IMSLP index.
 */
function matchWorkToImslp(work, index) {
  const workTokens = tokenizeTitle(
    [work.title, work.nickname].filter(Boolean).join(" ")
  );
  const workBaseNorm = normalizeWorkBaseTitle(work.title);

  // 1. Exact catalog key match
  let catKey = normalizeCatalogKey(work.catalog_system, work.catalog_number);
  if (!catKey) {
    const extracted = extractCatalog(work.title);
    catKey = normalizeCatalogKey(
      extracted.catalog_system,
      extracted.catalog_number
    );
  }

  if (catKey) {
    const directMatches = index.byCatalog.get(catKey);
    if (directMatches && directMatches.length > 0) {
      if (directMatches.length === 1) {
        return directMatches[0].url;
      }
      // Multiple IMSLP pages share the same catalog number — pick best title match
      let best = directMatches[0];
      let bestScore = -1;
      for (const candidate of directMatches) {
        const score = tokenSimilarity(workTokens, candidate.tokens);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      return best.url;
    }

    // Check catalog ranges (e.g. BWV 1007 -> "6 Cello Suites, BWV 1007-1012")
    const [sys, numStr] = catKey.split(":");
    const numVal = Number(numStr);
    if (sys && Number.isFinite(numVal)) {
      const rangeHit = index.catalogRanges.find(
        (r) => r.sys === sys && numVal >= r.start && numVal <= r.end
      );
      if (rangeHit) {
        return rangeHit.entry.url;
      }
    }
  }

  // 2. Exact normalized base title match
  if (workBaseNorm && workBaseNorm.length >= 6) {
    const exactBase = index.byBaseTitle.get(workBaseNorm);
    if (exactBase) return exactBase.url;
  }

  // 3. High-confidence token similarity match
  if (workTokens.size >= 2) {
    let bestEntry = null;
    let bestScore = 0;
    for (const entry of index.allEntries) {
      const score = tokenSimilarity(workTokens, entry.tokens);
      if (score > bestScore) {
        bestScore = score;
        bestEntry = entry;
      }
    }
    if (bestEntry && bestScore >= 0.72) {
      return bestEntry.url;
    }
  }

  return null;
}

async function main() {
  console.log(
    composerFlag
      ? `Starting IMSLP sync for composer "${composerFlag}"...`
      : `Starting IMSLP sync (batch size: ${BATCH_SIZE} composers)...`
  );

  let composerQuery = supabase
    .from("composers")
    .select("id, slug, name, full_name, sort_name, imslp_url, imslp_synced_at");

  if (composerFlag) {
    composerQuery = composerQuery.eq("slug", composerFlag);
  } else {
    composerQuery = composerQuery
      .order("imslp_synced_at", { ascending: true, nullsFirst: true })
      .order("rank_order", { ascending: true, nullsFirst: false })
      .limit(BATCH_SIZE);
  }

  const { data: composers, error: cErr } = await composerQuery;
  if (cErr) {
    console.error("Failed to fetch composers:", cErr.message);
    process.exit(1);
  }

  if (!composers || composers.length === 0) {
    console.log("No composers to sync.");
    return;
  }

  let composersMatched = 0;
  let worksMatched = 0;
  let worksChecked = 0;

  for (const composer of composers) {
    const nowIso = new Date().toISOString();
    const categoryTitle = await resolveComposerCategory(composer);

    if (!categoryTitle) {
      console.log(`  - ${composer.name}: no IMSLP category found`);
      await supabase
        .from("composers")
        .update({ imslp_synced_at: nowIso })
        .eq("id", composer.id);
      await sleep(200);
      continue;
    }

    const composerImslpUrl = imslpPageUrl(categoryTitle);
    composersMatched++;

    await supabase
      .from("composers")
      .update({
        imslp_url: composerImslpUrl,
        imslp_synced_at: nowIso,
      })
      .eq("id", composer.id);

    // Fetch all IMSLP work pages for this composer
    const imslpPages = await fetchCategoryWorkPages(categoryTitle);
    const index = buildImslpIndex(imslpPages);

    // Fetch DB works for this composer that still lack imslp_url
    const { data: dbWorks, error: wErr } = await supabase
      .from("works")
      .select("id, title, nickname, catalog_system, catalog_number, imslp_url")
      .eq("composer_id", composer.id)
      .is("imslp_url", null);

    if (wErr) {
      console.error(`  ! Error loading works for ${composer.name}:`, wErr.message);
      continue;
    }

    const worksToCheck = dbWorks ?? [];
    worksChecked += worksToCheck.length;

    let matchedForComposer = 0;
    const updates = [];

    for (const work of worksToCheck) {
      const url = matchWorkToImslp(work, index);
      if (url) {
        matchedForComposer++;
        worksMatched++;
        updates.push({ id: work.id, imslp_url: url, imslp_synced_at: nowIso });
      }
    }

    // Apply updates in parallel chunks of 20
    for (let i = 0; i < updates.length; i += 20) {
      const chunk = updates.slice(i, i + 20);
      await Promise.all(
        chunk.map((u) =>
          supabase
            .from("works")
            .update({ imslp_url: u.imslp_url, imslp_synced_at: u.imslp_synced_at })
            .eq("id", u.id)
        )
      );
    }

    console.log(
      `  ✓ ${composer.name}: ${imslpPages.length} IMSLP pages → matched ${matchedForComposer}/${worksToCheck.length} works`
    );
    await sleep(250);
  }

  console.log(
    `\nIMSLP sync complete: ${composersMatched}/${composers.length} composers matched, ${worksMatched}/${worksChecked} works linked.`
  );
}

main().catch((err) => {
  console.error("IMSLP sync failed:", err);
  process.exit(1);
});
