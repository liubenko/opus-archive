import {
  extractCatalog,
  extractKey,
  inferEraFromBirthYear,
  mapWorkGenre,
} from "../../scripts/lib/dedup.mjs";

const UA =
  "OpusArchive/1.0 (https://github.com/liubenko/opus-archive; classical catalog enrichment)";

export interface EnrichedComposerCandidate {
  id: string;
  name: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
  nationality: string;
  birth_place: string | null;
  era: string;
  avatar_url: string | null;
  short_bio: string;
  imslp_url: string | null;
  source_url: string | null;
  sources: string[];
}

export interface EnrichedWorkCandidate {
  id: string;
  title: string;
  composer_name: string;
  genre: string;
  catalog_display: string | null;
  key_signature: string | null;
  year_composed: number | null;
  duration_minutes: number | null;
  instrumentation: string | null;
  description: string | null;
  imslp_url: string | null;
  source_url: string | null;
  sources: string[];
  composer_meta: EnrichedComposerCandidate | null;
}

const NATIONALITY_PATTERNS = [
  "Ukrainian",
  "German",
  "Austrian",
  "French",
  "Italian",
  "Russian",
  "American",
  "British",
  "English",
  "Polish",
  "Czech",
  "Hungarian",
  "Finnish",
  "Spanish",
  "Argentine",
  "Brazilian",
  "Mexican",
  "Japanese",
  "Chinese",
  "South Korean",
  "Korean",
  "Estonian",
  "Latvian",
  "Lithuanian",
  "Georgian",
  "Armenian",
  "Turkish",
  "Norwegian",
  "Swedish",
  "Danish",
  "Dutch",
  "Belgian",
  "Swiss",
  "Romanian",
  "Canadian",
  "Australian",
  "Icelandic",
];

function extractYearsAndNationality(text: string): {
  birthYear: number | null;
  deathYear: number | null;
  nationality: string;
} {
  let birthYear: number | null = null;
  let deathYear: number | null = null;

  const spanMatch = text.match(
    /\((?:[^()]{0,40}?\b)?(1[3-9]\d{2}|20[01]\d)\s*[–—-]\s*(?:[^()]{0,35}?\b)?(1[3-9]\d{2}|20[0-2]\d)\)/
  );
  if (spanMatch) {
    birthYear = Number(spanMatch[1]);
    deathYear = Number(spanMatch[2]);
  } else {
    const bornMatch = text.match(
      /\b(?:born|b\.)[^()]{0,25}?\b(1[4-9]\d{2}|20[01]\d)\b/i
    );
    if (bornMatch) birthYear = Number(bornMatch[1]);
  }

  let nationality = "International";
  for (const nat of NATIONALITY_PATTERNS) {
    if (new RegExp(`\\b${nat}\\b`, "i").test(text)) {
      nationality = nat === "English" ? "British" : nat;
      break;
    }
  }

  return { birthYear, deathYear, nationality };
}

async function checkImslpComposerUrl(name: string): Promise<string | null> {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  const catQuery = `Category:${last}, ${first}`;
  try {
    const res = await fetch(
      `https://imslp.org/api.php?action=opensearch&search=${encodeURIComponent(
        catQuery
      )}&namespace=14&limit=3&format=json`,
      { headers: { "User-Agent": UA } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as [string, string[], string[], string[]];
    const url = data?.[3]?.[0];
    return url || null;
  } catch {
    return null;
  }
}

type OpenSearchTuple = [string, string[], string[], string[]];
type OpenOpusSearchJson = {
  composers?: {
    id?: string;
    name?: string;
    complete_name?: string;
    birth?: string;
    death?: string;
    epoch?: string;
    portrait?: string;
  }[];
};
type MusicBrainzWorkSearchJson = {
  works?: {
    id: string;
    title: string;
    type?: string;
    relations?: {
      type?: string;
      artist?: { name?: string };
    }[];
  }[];
};

export async function lookupComposerCandidates(
  query: string
): Promise<EnrichedComposerCandidate[]> {
  if (!query.trim()) return [];

  const [wikiSearchRes, openOpusRes] = await Promise.allSettled([
    fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
        `${query} composer`
      )}&limit=4&namespace=0&format=json`,
      { headers: { "User-Agent": UA } }
    ).then((r) => (r.ok ? (r.json() as Promise<OpenSearchTuple>) : null)),
    fetch(
      `https://api.openopus.org/composer/list/search/${encodeURIComponent(
        query
      )}.json`,
      { headers: { "User-Agent": UA } }
    ).then((r) => (r.ok ? (r.json() as Promise<OpenOpusSearchJson>) : null)),
  ]);

  const titles = new Set<string>();
  if (
    wikiSearchRes.status === "fulfilled" &&
    Array.isArray(wikiSearchRes.value?.[1])
  ) {
    for (const t of wikiSearchRes.value[1]) {
      titles.add(t);
    }
  }

  const directWiki = await fetch(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
      query
    )}&limit=2&namespace=0&format=json`,
    { headers: { "User-Agent": UA } }
  )
    .then((r) => (r.ok ? (r.json() as Promise<OpenSearchTuple>) : null))
    .catch(() => null);
  if (Array.isArray(directWiki?.[1])) {
    for (const t of directWiki[1]) titles.add(t);
  }

  const openOpusComposers: {
    name?: string;
    complete_name?: string;
    birth?: string;
    death?: string;
    epoch?: string;
    portrait?: string;
  }[] =
    openOpusRes.status === "fulfilled" &&
    Array.isArray(openOpusRes.value?.composers)
      ? openOpusRes.value.composers
      : [];

  const titleList = Array.from(titles).slice(0, 3);
  const wikiSummaries = await Promise.all(
    titleList.map(async (t) => {
      try {
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            t.replace(/ /g, "_")
          )}`,
          { headers: { "User-Agent": UA } }
        );
        if (!res.ok) return null;
        return (await res.json()) as {
          title?: string;
          wikibase_item?: string;
          description?: string;
          extract?: string;
          thumbnail?: { source?: string };
          content_urls?: { desktop?: { page?: string } };
        };
      } catch {
        return null;
      }
    })
  );

  // Batch-fetch exact birth (P569) and death (P570) years from Wikidata QIDs
  const qids = wikiSummaries
    .map((s) => s?.wikibase_item)
    .filter((q): q is string => Boolean(q));
  const wikidataYears = new Map<
    string,
    { birth: number | null; death: number | null }
  >();
  if (qids.length > 0) {
    try {
      const wdRes = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.join(
          "|"
        )}&props=claims&format=json`,
        { headers: { "User-Agent": UA } }
      );
      if (wdRes.ok) {
        const wdJson = (await wdRes.json()) as {
          entities?: Record<
            string,
            {
              claims?: {
                P569?: {
                  mainsnak?: { datavalue?: { value?: { time?: string } } };
                }[];
                P570?: {
                  mainsnak?: { datavalue?: { value?: { time?: string } } };
                }[];
              };
            }
          >;
        };
        for (const qid of qids) {
          const claims = wdJson.entities?.[qid]?.claims;
          const bStr =
            claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time || "";
          const dStr =
            claims?.P570?.[0]?.mainsnak?.datavalue?.value?.time || "";
          const bMatch = bStr.match(/([12]\d{3})/);
          const dMatch = dStr.match(/([12]\d{3})/);
          wikidataYears.set(qid, {
            birth: bMatch ? Number(bMatch[1]) : null,
            death: dMatch ? Number(dMatch[1]) : null,
          });
        }
      }
    } catch {
      // Ignore Wikidata fallback error
    }
  }

  const candidates: EnrichedComposerCandidate[] = [];

  for (const sum of wikiSummaries) {
    if (!sum || !sum.extract) continue;
    const combined = `${sum.description || ""} ${sum.extract}`;
    if (
      titleList.length > 1 &&
      !/composer|musician|pianist|violinist|cellist|conductor|organist/i.test(
        combined
      )
    ) {
      continue;
    }

    const cleanName = String(sum.title || query)
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();
    const { birthYear, deathYear, nationality } =
      extractYearsAndNationality(combined);
    const wd = sum.wikibase_item
      ? wikidataYears.get(sum.wikibase_item)
      : undefined;

    const ooMatch = openOpusComposers.find((c) =>
      (c.complete_name || c.name || "")
        .toLowerCase()
        .includes(cleanName.split(" ").pop()?.toLowerCase() || "")
    );

    const finalBirth =
      wd?.birth ||
      birthYear ||
      (ooMatch?.birth ? Number(ooMatch.birth.slice(0, 4)) : null);
    const finalDeath =
      wd?.death ||
      deathYear ||
      (ooMatch?.death && ooMatch.death !== "null"
        ? Number(ooMatch.death.slice(0, 4))
        : null);

    const imslpUrl = await checkImslpComposerUrl(cleanName);
    const sources = ["Wikipedia"];
    if (ooMatch) sources.push("OpenOpus");
    if (imslpUrl) sources.push("IMSLP");

    candidates.push({
      id: `wiki:${cleanName}`,
      name: cleanName,
      full_name: ooMatch?.complete_name || cleanName,
      birth_year: finalBirth,
      death_year: finalDeath,
      nationality,
      birth_place: null,
      era: inferEraFromBirthYear(finalBirth || 1950),
      avatar_url: sum.thumbnail?.source || ooMatch?.portrait || null,
      short_bio: sum.extract.slice(0, 550),
      imslp_url: imslpUrl,
      source_url: sum.content_urls?.desktop?.page || imslpUrl || null,
      sources,
    });
  }

  if (candidates.length === 0 && openOpusComposers.length > 0) {
    for (const c of openOpusComposers.slice(0, 3)) {
      const bYear = c.birth ? Number(c.birth.slice(0, 4)) : null;
      const dYear =
        c.death && c.death !== "null" ? Number(c.death.slice(0, 4)) : null;
      const fullName = c.complete_name || c.name || query;
      const imslpUrl = await checkImslpComposerUrl(fullName);
      candidates.push({
        id: `oo:${fullName}`,
        name: fullName,
        full_name: fullName,
        birth_year: bYear,
        death_year: dYear,
        nationality: "International",
        birth_place: null,
        era: inferEraFromBirthYear(bYear || 1900),
        avatar_url: c.portrait || null,
        short_bio: `${fullName} — classical composer indexed via OpenOpus.`,
        imslp_url: imslpUrl,
        source_url: imslpUrl,
        sources: imslpUrl ? ["OpenOpus", "IMSLP"] : ["OpenOpus"],
      });
    }
  }

  return candidates.slice(0, 4);
}

export function parseImslpWorkInfo(wikitext: string) {
  const getField = (pattern: string) => {
    const m = wikitext.match(
      new RegExp(`^\\|[ \\t]*(?:${pattern})[ \\t]*=[ \\t]*([^\\r\\n]*)`, "im")
    );
    if (!m) return null;
    const cleaned = m[1]
      .replace(
        /\{\{Key\|([a-g])([b#s]?)\}\}/g,
        (_, n, acc) =>
          `${n.toUpperCase()}${acc === "b" ? "-flat" : acc === "#" || acc === "s" ? "-sharp" : ""} minor`
      )
      .replace(
        /\{\{Key\|([A-G])([b#s]?)\}\}/g,
        (_, n, acc) =>
          `${n}${acc === "b" ? "-flat" : acc === "#" || acc === "s" ? "-sharp" : ""} major`
      )
      .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")
      .replace(/\{\{[^}]*\}\}/g, "")
      .replace(/\{\{.*/g, "")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!cleaned || cleaned.startsWith("|") || cleaned.includes("=")) {
      return null;
    }
    return cleaned;
  };

  const yearRaw = getField("Year/Date of Composition|Composition Year");
  const yearMatch = yearRaw?.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
  const keyRaw = getField("Key");
  const instRaw = getField("Instrumentation");
  const durRaw = getField("Average Duration");
  const durMatch = durRaw?.match(/(\d+)\s*(?:min|m\b)/i);

  return {
    year_composed: yearMatch ? Number(yearMatch[1]) : null,
    key_signature: keyRaw ? keyRaw.slice(0, 60) : null,
    instrumentation: instRaw ? instRaw.slice(0, 180) : null,
    duration_minutes: durMatch ? Number(durMatch[1]) : null,
  };
}

function stripCatalogSuffix(title: string): string {
  return title
    .replace(
      /,?\s*\b(?:Op\.?|BWV|KV|K\.?|Hob\.?|D\.?|S\.?|Sz\.?|TrV|WoO|RV|HWV|TWV|L\.?|M\.?|H\.?|B\.?)\s*[\dA-Za-z./-]+$/i,
      ""
    )
    .trim();
}

export async function lookupWorkCandidates(
  workQuery: string,
  composerQuery: string,
  options?: { includeComposerMeta?: boolean }
): Promise<EnrichedWorkCandidate[]> {
  const includeComposerMeta = options?.includeComposerMeta ?? true;
  const baseWorkQuery = stripCatalogSuffix(workQuery) || workQuery;
  const combinedSearch = [baseWorkQuery, composerQuery]
    .filter(Boolean)
    .join(" ");
  const composerLast = composerQuery.trim().split(/\s+/).pop() || "";

  type ImslpSearchJson = {
    query?: { search?: { title: string }[] };
  };

  const [mbRes, imslpRes, wikiRes, composerCands] = await Promise.all([
    fetch(
      `https://musicbrainz.org/ws/2/work/?query=${encodeURIComponent(
        composerLast
          ? `${baseWorkQuery} AND artist:${composerLast}`
          : baseWorkQuery
      )}&fmt=json&limit=4`,
      { headers: { "User-Agent": UA } }
    )
      .then((r) =>
        r.ok ? (r.json() as Promise<MusicBrainzWorkSearchJson>) : null
      )
      .catch(() => null),
    fetch(
      `https://imslp.org/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        combinedSearch
      )}&srnamespace=0&srlimit=4&format=json`,
      { headers: { "User-Agent": UA } }
    )
      .then((r) => (r.ok ? (r.json() as Promise<ImslpSearchJson>) : null))
      .catch(() => null),
    fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
        combinedSearch
      )}&namespace=0&limit=3&format=json`,
      { headers: { "User-Agent": UA } }
    )
      .then((r) => (r.ok ? (r.json() as Promise<OpenSearchTuple>) : null))
      .catch(() => null),
    includeComposerMeta && composerQuery.trim()
      ? lookupComposerCandidates(composerQuery)
      : Promise.resolve([]),
  ]);

  const primaryComposerMeta = composerCands[0] ?? null;

  // Inspect top IMSLP page wikitext if found
  let imslpTopTitle: string | null = null;
  let imslpTopUrl: string | null = null;
  let imslpParsed: ReturnType<typeof parseImslpWorkInfo> | null = null;

  const imslpHits = imslpRes?.query?.search || [];
  if (imslpHits.length > 0) {
    // Prefer a hit whose title includes the composer's last name if available
    const preferredHit =
      (composerLast &&
        imslpHits.find((h) =>
          h.title.toLowerCase().includes(composerLast.toLowerCase())
        )) ||
      imslpHits[0];

    imslpTopTitle = preferredHit.title;
    imslpTopUrl = `https://imslp.org/wiki/${encodeURIComponent(
      imslpTopTitle.replace(/ /g, "_")
    )}`;
    if (imslpTopTitle) {
      try {
        const wtRes = await fetch(
          `https://imslp.org/api.php?action=parse&page=${encodeURIComponent(
            imslpTopTitle
          )}&prop=wikitext&format=json`,
          { headers: { "User-Agent": UA } }
        );
        if (wtRes.ok) {
          const wtJson = (await wtRes.json()) as {
            parse?: { wikitext?: { "*"?: string } };
          };
          const wt = wtJson.parse?.wikitext?.["*"] || "";
          if (wt) imslpParsed = parseImslpWorkInfo(wt);
        }
      } catch {
        // Ignore wikitext parse error
      }
    }
  }

  // Optional Wikipedia summary for program description (try combined first, then work title alone)
  let wikiTitleCandidate: string | null =
    Array.isArray(wikiRes?.[1]) && wikiRes[1][0] ? String(wikiRes[1][0]) : null;
  if (!wikiTitleCandidate && baseWorkQuery.length >= 4) {
    try {
      const fallbackWiki = await fetch(
        `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
          baseWorkQuery
        )}&namespace=0&limit=2&format=json`,
        { headers: { "User-Agent": UA } }
      ).then((r) => (r.ok ? (r.json() as Promise<OpenSearchTuple>) : null));
      if (Array.isArray(fallbackWiki?.[1]) && fallbackWiki[1][0]) {
        wikiTitleCandidate = String(fallbackWiki[1][0]);
      }
    } catch {
      // Ignore fallback error
    }
  }

  let wikiDesc: string | null = null;
  let wikiPageUrl: string | null = null;
  let wikiYear: number | null = null;
  if (wikiTitleCandidate) {
    try {
      const sumRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
          wikiTitleCandidate.replace(/ /g, "_")
        )}`,
        { headers: { "User-Agent": UA } }
      );
      if (sumRes.ok) {
        const sum = (await sumRes.json()) as {
          extract?: string;
          content_urls?: { desktop?: { page?: string } };
        };
        if (
          sum.extract &&
          /concerto|symphony|sonata|quartet|opera|composed|premiered|music|suite|piece|opus|orchestra/i.test(
            sum.extract
          )
        ) {
          wikiDesc = sum.extract.slice(0, 650);
          wikiPageUrl = sum.content_urls?.desktop?.page || null;
          const ym = sum.extract.match(
            /\b(?:composed|written|completed|premiered|arranged|published)\s+(?:in\s+)?(1[4-9]\d{2}|20[0-2]\d)\b/i
          );
          if (ym) wikiYear = Number(ym[1]);
        }
      }
    } catch {
      // Ignore wiki summary error
    }
  }

  const out: EnrichedWorkCandidate[] = [];

  if (imslpTopTitle && imslpTopUrl) {
    const m = imslpTopTitle.match(/^(.+?)\s*\(([^,()]+),\s*([^()]+)\)$/);
    const cleanWorkTitle = m ? m[1].trim() : imslpTopTitle;
    const inferredComp = m
      ? `${m[3].trim()} ${m[2].trim()}`
      : primaryComposerMeta?.name || composerQuery;
    const cat = extractCatalog(cleanWorkTitle);
    const catDisplay =
      cat.catalog_system && cat.catalog_number
        ? `${cat.catalog_system} ${cat.catalog_number}`
        : null;

    const sources = ["IMSLP"];
    if (wikiDesc) sources.push("Wikipedia");

    out.push({
      id: `imslp:${imslpTopTitle}`,
      title: cleanWorkTitle,
      composer_name: inferredComp || composerQuery,
      genre: mapWorkGenre("", cleanWorkTitle),
      catalog_display: catDisplay,
      key_signature:
        imslpParsed?.key_signature || extractKey(cleanWorkTitle) || null,
      year_composed: imslpParsed?.year_composed || wikiYear || null,
      duration_minutes: imslpParsed?.duration_minutes || null,
      instrumentation: imslpParsed?.instrumentation || null,
      description: wikiDesc,
      imslp_url: imslpTopUrl,
      source_url: imslpTopUrl,
      sources,
      composer_meta: primaryComposerMeta,
    });
  }

  const mbWorks: {
    id: string;
    title: string;
    type?: string;
    relations?: {
      type?: string;
      artist?: { name?: string };
    }[];
  }[] = Array.isArray(mbRes?.works) ? mbRes.works : [];

  for (const w of mbWorks) {
    if (!w.title || /:\s*([IVX]+\.|No\.\s*\d+)/i.test(w.title)) continue;
    const compRel = w.relations?.find((r) => r.type === "composer");
    const cName =
      compRel?.artist?.name || primaryComposerMeta?.name || composerQuery;
    const cat = extractCatalog(w.title);
    const catDisplay =
      cat.catalog_system && cat.catalog_number
        ? `${cat.catalog_system} ${cat.catalog_number}`
        : null;

    if (
      out.some(
        (existing) => existing.title.toLowerCase() === w.title.toLowerCase()
      )
    ) {
      out[0].sources = Array.from(new Set([...out[0].sources, "MusicBrainz"]));
      continue;
    }

    const sources = ["MusicBrainz"];
    if (out.length === 0 && wikiDesc) sources.push("Wikipedia");

    out.push({
      id: `mb:${w.id}`,
      title: w.title,
      composer_name: cName || "Unknown Composer",
      genre: mapWorkGenre(w.type || "", w.title),
      catalog_display: catDisplay,
      key_signature: extractKey(w.title) || null,
      year_composed: out.length === 0 ? wikiYear : null,
      duration_minutes: null,
      instrumentation: null,
      description: out.length === 0 ? wikiDesc : null,
      imslp_url: out.length === 0 ? imslpTopUrl : null,
      source_url: wikiPageUrl || `https://musicbrainz.org/work/${w.id}`,
      sources,
      composer_meta: primaryComposerMeta,
    });
  }

  if (out.length === 0 && wikiDesc) {
    const cat = extractCatalog(workQuery);
    out.push({
      id: `wiki:${workQuery}`,
      title: workQuery,
      composer_name: primaryComposerMeta?.name || composerQuery,
      genre: mapWorkGenre("", workQuery),
      catalog_display:
        cat.catalog_system && cat.catalog_number
          ? `${cat.catalog_system} ${cat.catalog_number}`
          : null,
      key_signature: extractKey(workQuery) || null,
      year_composed: wikiYear,
      duration_minutes: null,
      instrumentation: null,
      description: wikiDesc,
      imslp_url: null,
      source_url: wikiPageUrl,
      sources: ["Wikipedia"],
      composer_meta: primaryComposerMeta,
    });
  }

  return out.slice(0, 4);
}
