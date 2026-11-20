/**
 * Shared canonical normalization & deduplication helpers for Opus Archive.
 * Prevents duplicate composers and works across OpenOpus, MusicBrainz, and manual seeds.
 */

export function normalizeText(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function slugify(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function extractLastName(name, sortName) {
  if (sortName && sortName.includes(",")) {
    return normalizeText(sortName.split(",")[0]);
  }
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return normalizeText(parts[parts.length - 1] || "");
}

export const CATALOG_REGEX =
  /\b(Op\.?\s*\d+[a-z]?(?:,\s*No\.?\s*\d+)?|BWV\s*\d+[a-z]?|K\.?\s*\d+[a-z]?|KV\.?\s*\d+[a-z]?|Hob\.?\s*[IVXLCa-z]+:\s*\d+[a-z]?|RV\s*\d+[a-z]?|D\.?\s*\d+[a-z]?|S\.?\s*\d+(?:\/\d+)?|WWV\s*\d+[A-Z]?|WoO\s*\d+(?:,\s*No\.?\s*\d+)?|HWV\s*\d+[a-z]?|L\.?\s*\d+|M\.?\s*\d+|Z\.?\s*\d+|Sz\.?\s*\d+|TWV\s*\d+:\w+|B\.?\s*\d+|H\.?\s*\d+)\b/i;

export function extractCatalog(title) {
  const match = String(title || "").match(CATALOG_REGEX);
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
  else if (/^b\.?$/i.test(system)) system = "B.";
  else if (/^h\.?$/i.test(system)) system = "H.";
  else if (/^woo$/i.test(system)) system = "WoO";
  else system = system.toUpperCase();

  return {
    catalog_system: system,
    catalog_number: sysMatch[2].trim(),
  };
}

export function normalizeCatalogKey(system, number) {
  if (!system || !number) return null;
  const s = normalizeText(system);
  const n = normalizeText(number);
  if (!s || !n) return null;
  return `${s}:${n}`;
}

/**
 * Strips catalog suffix and parenthetical nicknames so
 * "Symphony No. 5 in C minor" matches "Symphony no. 5 in C minor, op. 67".
 */
export function normalizeWorkBaseTitle(title) {
  const withoutCatalog = String(title || "")
    .replace(CATALOG_REGEX, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/["""''`]/g, "");
  return normalizeText(withoutCatalog);
}

export function extractKey(title) {
  const match = String(title || "").match(
    /\bin\s+([A-G](?:-flat|-sharp| flat| sharp|♭|♯)?\s+(?:major|minor))\b/i
  );
  return match ? match[1] : null;
}

export function mapWorkGenre(sourceGenre, title) {
  const lower = String(title || "").toLowerCase();
  const src = String(sourceGenre || "").toLowerCase();

  if (lower.includes("symphony") || lower.includes("sinfonia") || src === "symphony") {
    return "Symphony";
  }
  if (lower.includes("concerto") || src === "concerto") {
    return "Concerto";
  }
  if (lower.includes("ballet") || src === "ballet") {
    return "Ballet";
  }
  if (
    lower.includes("requiem") ||
    lower.includes("mass ") ||
    lower.startsWith("missa") ||
    lower.includes("stabat mater") ||
    lower.includes("magnificat") ||
    lower.includes("passion") ||
    lower.includes("oratorio") ||
    src === "mass" ||
    src === "motet" ||
    src === "oratorio"
  ) {
    return "Sacred";
  }
  if (src === "opera" || src === "operetta" || src === "stage" || lower.includes("opera")) {
    return "Opera";
  }
  if (
    src === "keyboard" ||
    src === "piano" ||
    lower.includes("piano sonata") ||
    lower.includes("nocturne") ||
    lower.includes("etude") ||
    lower.includes("étude") ||
    lower.includes("prelude") ||
    lower.includes("prélude") ||
    lower.includes("mazurka") ||
    lower.includes("polonaise")
  ) {
    return "Piano Solo";
  }
  if (
    src === "chamber" ||
    src === "quartet" ||
    src === "trio" ||
    lower.includes("string quartet") ||
    lower.includes("quintet") ||
    lower.includes("trio") ||
    lower.includes("violin sonata") ||
    lower.includes("cello sonata")
  ) {
    return "Chamber";
  }
  if (
    src === "vocal" ||
    src === "song" ||
    src === "lied" ||
    src === "cantata" ||
    src === "aria" ||
    src === "madrigal"
  ) {
    return "Choral & Vocal";
  }
  if (src === "sonata" || src === "suite" || src === "partita") {
    return "Solo Instrumental";
  }
  return "Orchestral";
}

export function inferEraFromBirthYear(birthYear) {
  if (!birthYear) return "Classical";
  if (birthYear < 1400) return "Medieval";
  if (birthYear < 1580) return "Renaissance";
  if (birthYear < 1730) return "Baroque";
  if (birthYear < 1790) return "Classical";
  if (birthYear < 1810) return "Early Romantic";
  if (birthYear < 1855) return "Romantic";
  if (birthYear < 1880) return "Late Romantic";
  if (birthYear < 1945) return "20th Century";
  return "Contemporary";
}

/**
 * Multi-layer composer deduplicator:
 * 1. Exact musicbrainz_id
 * 2. Exact openopus_id
 * 3. Exact slug
 * 4. Normalized name or full_name
 * 5. Birth year + normalized last name (catches Haydn / Franz Joseph Haydn, etc.)
 * 6. Birth year + death year + surname prefix >= 5 chars (catches Rachmaninoff/Rachmaninov)
 */
export function buildComposerMatcher(existingComposers) {
  const byMbId = new Map();
  const byOpenOpusId = new Map();
  const bySlug = new Map();
  const byNormName = new Map();
  const byBirthAndSurname = new Map();
  const list = [...existingComposers];

  function register(c) {
    if (c.musicbrainz_id) byMbId.set(c.musicbrainz_id, c);
    if (c.openopus_id) byOpenOpusId.set(String(c.openopus_id), c);
    if (c.slug) bySlug.set(c.slug, c);
    const n1 = normalizeText(c.name);
    const n2 = normalizeText(c.full_name);
    if (n1) byNormName.set(n1, c);
    if (n2) byNormName.set(n2, c);
    const surname = extractLastName(c.name, c.sort_name);
    if (c.birth_year && surname) {
      byBirthAndSurname.set(`${c.birth_year}:${surname}`, c);
    }
  }

  for (const c of list) register(c);

  function findMatch({ musicbrainz_id, openopus_id, slug, name, full_name, sort_name, birth_year, death_year }) {
    if (musicbrainz_id && byMbId.has(musicbrainz_id)) return byMbId.get(musicbrainz_id);
    if (openopus_id && byOpenOpusId.has(String(openopus_id))) return byOpenOpusId.get(String(openopus_id));
    if (slug && bySlug.has(slug)) return bySlug.get(slug);

    const n1 = normalizeText(name);
    const n2 = normalizeText(full_name);
    if (n1 && byNormName.has(n1)) return byNormName.get(n1);
    if (n2 && byNormName.has(n2)) return byNormName.get(n2);

    const surname = extractLastName(name || full_name, sort_name);
    if (birth_year && surname) {
      const exactKey = `${birth_year}:${surname}`;
      if (byBirthAndSurname.has(exactKey)) return byBirthAndSurname.get(exactKey);
    }

    // Fuzzy transliteration check (same birth & death year + shared 5-char surname prefix)
    if (birth_year && surname.length >= 5) {
      const prefix = surname.slice(0, 5);
      for (const existing of list) {
        if (Math.abs(existing.birth_year - birth_year) <= 1) {
          const exSurname = extractLastName(existing.name, existing.sort_name);
          if (
            exSurname.startsWith(prefix) &&
            (!death_year || !existing.death_year || Math.abs(existing.death_year - death_year) <= 1)
          ) {
            return existing;
          }
        }
      }
    }

    return null;
  }

  function add(c) {
    list.push(c);
    register(c);
  }

  return { findMatch, add };
}

/**
 * Multi-layer per-composer work deduplicator:
 * 1. Exact musicbrainz_id
 * 2. Exact openopus_id
 * 3. Exact canonical_key (normalized full title)
 * 4. Normalized base title (title with catalog suffix stripped)
 * 5. Specific catalog_system + catalog_number match (for non-generic catalogs)
 */
export function buildWorkMatcher(existingWorks) {
  const byMbId = new Map();
  const byOpenOpusId = new Map();
  const byCanonical = new Map();
  const byBaseTitle = new Map();
  const byCatalog = new Map();

  function register(w) {
    if (w.musicbrainz_id) byMbId.set(w.musicbrainz_id, w);
    if (w.openopus_id) byOpenOpusId.set(String(w.openopus_id), w);
    const ck = w.canonical_key || normalizeText(w.title);
    if (ck) byCanonical.set(ck, w);
    const base = normalizeWorkBaseTitle(w.title);
    if (base && base.length >= 6) byBaseTitle.set(base, w);

    const catKey = normalizeCatalogKey(w.catalog_system, w.catalog_number);
    // Avoid colliding generic "Op. 10" when multiple distinct pieces share an opus without "No."
    if (catKey && (!catKey.startsWith("op:") || catKey.includes("no") || (base && base.length < 18))) {
      if (!byCatalog.has(catKey)) byCatalog.set(catKey, w);
    }
  }

  for (const w of existingWorks) register(w);

  function findMatch({ musicbrainz_id, openopus_id, title, catalog_system, catalog_number }) {
    if (musicbrainz_id && byMbId.has(musicbrainz_id)) return byMbId.get(musicbrainz_id);
    if (openopus_id && byOpenOpusId.has(String(openopus_id))) return byOpenOpusId.get(String(openopus_id));

    const ck = normalizeText(title);
    if (ck && byCanonical.has(ck)) return byCanonical.get(ck);

    const base = normalizeWorkBaseTitle(title);
    if (base && base.length >= 6 && byBaseTitle.has(base)) {
      return byBaseTitle.get(base);
    }

    const catKey = normalizeCatalogKey(catalog_system, catalog_number);
    if (catKey && byCatalog.has(catKey)) {
      const candidate = byCatalog.get(catKey);
      const candBase = normalizeWorkBaseTitle(candidate.title);
      // Confirm catalog match is same work (either non-Op catalog like BWV/K./RV or overlapping title words)
      if (!catKey.startsWith("op:") || !base || !candBase || base.includes(candBase.slice(0, 8)) || candBase.includes(base.slice(0, 8))) {
        return candidate;
      }
    }

    return null;
  }

  return { findMatch, add: register };
}
