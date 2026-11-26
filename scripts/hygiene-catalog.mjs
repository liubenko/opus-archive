#!/usr/bin/env node
/**
 * Catalog Hygiene Script (Phase 0.5)
 *
 * 1. Folds individual movement rows (e.g. "Concerto: II. Grazioso") that were
 *    imported flatly from MusicBrainz into `public.work_movements` whenever an
 *    exact parent work exists for the same composer, updates `movements_count`,
 *    and deletes the redundant movement rows from `public.works`.
 * 2. Backfills missing `catalog_system`, `catalog_number`, and `catalog_display`
 *    using the expanded `CATALOG_REGEX` (G., MWV, TH, CT, FS, JB, WAB, TrV, etc.).
 *
 * Environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SECRET_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { extractCatalog, isMovementSubworkTitle } from "./lib/dedup.mjs";

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

const ROMAN_MAP = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
  XIII: 13,
  XIV: 14,
  XV: 15,
  XVI: 16,
  XVII: 17,
  XVIII: 18,
  XIX: 19,
  XX: 20,
};

function parseMovementPart(part) {
  const trimmed = String(part || "").trim();
  const romanMatch = trimmed.match(/^([IVX]+)\.\s*(.+)$/i);
  if (romanMatch) {
    const num = ROMAN_MAP[romanMatch[1].toUpperCase()];
    if (num) return { movement_number: num, title: romanMatch[2].trim() };
  }
  const noMatch = trimmed.match(/^No\.?\s*(\d+)\.?\s*(.*)$/i);
  if (noMatch) {
    const num = Number(noMatch[1]);
    if (Number.isFinite(num) && num > 0 && num <= 100) {
      return {
        movement_number: num,
        title: (noMatch[2] || `No. ${num}`).trim(),
      };
    }
  }
  const numMatch = trimmed.match(/^(\d{1,2})\.\s*(.+)$/);
  if (numMatch) {
    const num = Number(numMatch[1]);
    if (Number.isFinite(num) && num > 0 && num <= 100) {
      return { movement_number: num, title: numMatch[2].trim() };
    }
  }
  const actMatch = trimmed.match(
    /^(?:Act|Atto|Acte|Akt|Scene|Scène|Tableau|Part|Teil)\s+([IVXLCDM]+|\d+)[:.]?\s*(.*)$/i
  );
  if (actMatch) {
    const rawNum = actMatch[1].toUpperCase();
    const base = ROMAN_MAP[rawNum] || Number(rawNum) || 1;
    return {
      movement_number: base,
      title: trimmed.slice(0, 240),
    };
  }
  return null;
}

async function fetchAllWorks() {
  const all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("works")
      .select(
        "id, composer_id, title, catalog_system, catalog_number, catalog_display, key_signature, duration_minutes, movements_count"
      )
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  console.log("Loading all works for Phase 0.5 catalog hygiene...");
  const allWorks = await fetchAllWorks();
  console.log(`Loaded ${allWorks.length} works.`);

  // Index parent works by (composer_id, lower(trim(title)))
  const byComposerTitle = new Map();
  for (const w of allWorks) {
    const key = `${w.composer_id}::${String(w.title || "").trim().toLowerCase()}`;
    if (!byComposerTitle.has(key)) byComposerTitle.set(key, w);
  }

  const movementsToUpsert = [];
  const childIdsToDelete = [];
  const parentMovementCounts = new Map();

  for (const w of allWorks) {
    if (!isMovementSubworkTitle(w.title)) continue;
    const colonIdx = w.title.indexOf(":");
    if (colonIdx === -1) continue;

    const parentGuess = w.title.slice(0, colonIdx).trim();
    const partText = w.title.slice(colonIdx + 1).trim();
    const parent = byComposerTitle.get(
      `${w.composer_id}::${parentGuess.toLowerCase()}`
    );
    if (!parent || parent.id === w.id) continue;

    const parsed = parseMovementPart(partText);
    if (!parsed || !parsed.title) continue;

    movementsToUpsert.push({
      work_id: parent.id,
      movement_number: parsed.movement_number,
      title: parsed.title.slice(0, 240),
      key_signature: w.key_signature || null,
      duration_seconds: w.duration_minutes ? w.duration_minutes * 60 : null,
    });
    childIdsToDelete.push(w.id);

    const prev = parentMovementCounts.get(parent.id) || 0;
    parentMovementCounts.set(parent.id, Math.max(prev, parsed.movement_number));
  }

  console.log(
    `Found ${movementsToUpsert.length} movement rows matching existing parent works.`
  );

  // Deduplicate (work_id, movement_number) before upsert — assign sequential numbers if an opera Act has multiple scenes
  const usedNumbersByWork = new Map();
  const mvtList = [];
  for (const m of movementsToUpsert) {
    if (!usedNumbersByWork.has(m.work_id)) {
      usedNumbersByWork.set(m.work_id, new Set());
    }
    const used = usedNumbersByWork.get(m.work_id);
    let num = m.movement_number;
    while (used.has(num)) num++;
    used.add(num);
    mvtList.push({ ...m, movement_number: num });
  }

  // 1. Upsert into work_movements in batches of 200
  for (let i = 0; i < mvtList.length; i += 200) {
    const batch = mvtList.slice(i, i + 200);
    const { error } = await supabase
      .from("work_movements")
      .upsert(batch, { onConflict: "work_id,movement_number" });
    if (error) {
      console.error("Failed upserting work_movements batch:", error.message);
      process.exit(1);
    }
  }
  console.log(`Upserted ${mvtList.length} rows into public.work_movements.`);

  // 2. Update movements_count on parent works
  const parentEntries = Array.from(parentMovementCounts.entries());
  for (let i = 0; i < parentEntries.length; i += 25) {
    const chunk = parentEntries.slice(i, i + 25);
    await Promise.all(
      chunk.map(([workId, count]) =>
        supabase
          .from("works")
          .update({ movements_count: count })
          .eq("id", workId)
          .is("movements_count", null)
      )
    );
  }

  // 3. Delete folded movement rows from public.works in batches of 200
  for (let i = 0; i < childIdsToDelete.length; i += 200) {
    const ids = childIdsToDelete.slice(i, i + 200);
    const { error } = await supabase.from("works").delete().in("id", ids);
    if (error) {
      console.error("Failed deleting folded movement rows:", error.message);
      process.exit(1);
    }
  }
  console.log(
    `Removed ${childIdsToDelete.length} redundant movement rows from public.works.`
  );

  // 4. Backfill missing catalog_display using expanded CATALOG_REGEX
  const deletedSet = new Set(childIdsToDelete);
  const catalogPatches = [];

  for (const w of allWorks) {
    if (deletedSet.has(w.id)) continue;
    if (w.catalog_display) continue;

    let sys = w.catalog_system;
    let num = w.catalog_number;
    if (!sys || !num) {
      const extracted = extractCatalog(w.title);
      sys = sys || extracted.catalog_system;
      num = num || extracted.catalog_number;
    }
    if (sys && num) {
      catalogPatches.push({
        id: w.id,
        catalog_system: sys,
        catalog_number: num,
        catalog_display: `${sys} ${num}`,
      });
    }
  }

  console.log(`Backfilling catalog_display on ${catalogPatches.length} works...`);
  for (let i = 0; i < catalogPatches.length; i += 25) {
    const chunk = catalogPatches.slice(i, i + 25);
    await Promise.all(
      chunk.map((p) =>
        supabase
          .from("works")
          .update({
            catalog_system: p.catalog_system,
            catalog_number: p.catalog_number,
            catalog_display: p.catalog_display,
          })
          .eq("id", p.id)
      )
    );
  }

  // 5. Normalize double-whitespace in work titles
  const whitespacePatches = allWorks.filter(
    (w) => !deletedSet.has(w.id) && /\s{2,}|^\s|\s$/.test(w.title || "")
  );
  if (whitespacePatches.length > 0) {
    console.log(
      `Cleaning whitespace in ${whitespacePatches.length} work titles...`
    );
    for (let i = 0; i < whitespacePatches.length; i += 25) {
      const chunk = whitespacePatches.slice(i, i + 25);
      await Promise.all(
        chunk.map((w) =>
          supabase
            .from("works")
            .update({ title: w.title.replace(/\s+/g, " ").trim() })
            .eq("id", w.id)
        )
      );
    }
  }

  console.log("Phase 0.5 catalog hygiene complete!");
}

main().catch((err) => {
  console.error("Hygiene failed:", err);
  process.exit(1);
});
