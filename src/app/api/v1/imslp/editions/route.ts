import { apiError, apiJson, apiOptions } from "@/lib/api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return apiOptions();
}

export interface ImslpEdition {
  description: string;
  publisher: string | null;
  editor: string | null;
  copyright: string | null;
  fileName: string | null;
  imslpId: string | null;
  url: string;
}

function cleanWikiValue(raw: string): string {
  return raw
    // Convert {{LinkEd|First|Last|...}} or {{LinkCopy|First|Last|...}} -> "First Last"
    .replace(
      /\{\{(?:LinkEd|LinkCopy|LinkArr|LinkName)\|([^|}]*)\|([^|}]*)[^}]*\}\}/gi,
      (_m, first, last) => `${first} ${last}`.trim()
    )
    // Convert {{P|Publisher|Location|Year|...}} -> "Publisher (Year)"
    .replace(
      /\{\{P\|([^|}]*)\|([^|}]*)\|([^|}]*)\|([^|}]*)\|([^|}]*)[^}]*\}\}/gi,
      (_m, pub, _a, loc, _b, yr) =>
        [pub, loc, yr].filter((s) => s && s.trim()).join(", ")
    )
    // Convert {{BachComplete|vol|year|...}} -> "Bach-Gesellschaft Ausgabe (year)"
    .replace(
      /\{\{BachComplete\|[^|}]*\|(\d{4})[^}]*\}\}/gi,
      "Bach-Gesellschaft Ausgabe ($1)"
    )
    // Convert {{Mss|17|27|31}} -> "Manuscript"
    .replace(/\{\{Mss\|[^}]*\}\}/gi, "Historical Manuscript")
    .replace(/\[mailto:[^\]]+\]/gi, " ")
    .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{\{[^}]+\}\}/g, " ")
    .replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts brace-balanced {{#fte:imslpfile ... }} blocks from IMSLP wikitext.
 */
function extractImslpFileBlocks(wikitext: string, maxBlocks = 12): string[] {
  const blocks: string[] = [];
  const marker = "{{#fte:imslpfile";
  let cursor = 0;

  while (blocks.length < maxBlocks) {
    const start = wikitext.indexOf(marker, cursor);
    if (start === -1) break;

    let depth = 0;
    let i = start;
    while (i < wikitext.length - 1) {
      if (wikitext[i] === "{" && wikitext[i + 1] === "{") {
        depth++;
        i += 2;
      } else if (wikitext[i] === "}" && wikitext[i + 1] === "}") {
        depth--;
        i += 2;
        if (depth === 0) {
          blocks.push(wikitext.slice(start + marker.length, i - 2));
          break;
        }
      } else {
        i++;
      }
    }
    cursor = i > start ? i : start + marker.length;
  }

  return blocks;
}

function parseImslpEditions(wikitext: string, pageUrl: string): ImslpEdition[] {
  const blocks = extractImslpFileBlocks(wikitext, 12);
  const editions: ImslpEdition[] = [];

  for (const body of blocks) {
    const get = (key: string) => {
      const m = body.match(
        new RegExp(`^\\|[ \\t]*${key}[ \\t]*=[ \\t]*([^\\r\\n]*)`, "im")
      );
      if (!m) return null;
      const cleaned = cleanWikiValue(m[1]);
      if (!cleaned || cleaned.startsWith("|") || cleaned.includes("=")) {
        return null;
      }
      return cleaned;
    };

    const fileName = get("File Name 1") || get("File Name");
    const desc =
      get("File Description 1") ||
      get("File Description") ||
      "Complete Score";
    const imageType = get("Image Type");
    const publisher =
      get("Publisher Information") || get("Publisher") || get("Reprint");
    const editor = get("Editor");
    const copyright = get("Copyright");

    const idMatch = body.match(/IMSLP\d{4,}/i);
    const imslpId = idMatch ? idMatch[0] : null;

    if (!fileName && !publisher && !editor) continue;

    // Link directly to the specific IMSLP file page (or Special:ImagefromIndex/<id>) instead of the generic work page
    let directScoreUrl = pageUrl;
    if (fileName) {
      directScoreUrl = `https://imslp.org/wiki/File:${encodeURIComponent(
        fileName.replace(/ /g, "_")
      )}`;
    } else if (imslpId) {
      const digits = imslpId.replace(/\D/g, "");
      if (digits) {
        directScoreUrl = `https://imslp.org/wiki/Special:ImagefromIndex/${digits}`;
      }
    }

    editions.push({
      description: [desc, imageType].filter(Boolean).join(" · ").slice(0, 120),
      publisher: publisher ? publisher.slice(0, 140) : null,
      editor: editor ? editor.slice(0, 100) : null,
      copyright: copyright ? copyright.slice(0, 80) : null,
      fileName: fileName ? fileName.slice(0, 140) : null,
      imslpId,
      url: directScoreUrl,
    });
  }

  return editions;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imslpUrl = searchParams.get("url")?.trim();

  if (!imslpUrl || !imslpUrl.startsWith("https://imslp.org/wiki/")) {
    return apiError("Valid https://imslp.org/wiki/... url is required", 400);
  }

  const rawTitle = imslpUrl.slice("https://imslp.org/wiki/".length);
  let pageTitle = rawTitle;
  try {
    pageTitle = decodeURIComponent(rawTitle).replace(/_/g, " ");
  } catch {
    pageTitle = rawTitle.replace(/_/g, " ");
  }

  const apiUrl = new URL("https://imslp.org/api.php");
  apiUrl.searchParams.set("action", "query");
  apiUrl.searchParams.set("prop", "revisions");
  apiUrl.searchParams.set("rvprop", "content");
  apiUrl.searchParams.set("titles", pageTitle);
  apiUrl.searchParams.set("format", "json");

  try {
    const res = await fetch(apiUrl.toString(), {
      headers: {
        "User-Agent":
          "OpusArchive/1.0 ( https://github.com/liubenko/opus-archive )",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      return apiJson(
        { editions: [], page_url: imslpUrl },
        { cacheSeconds: 3600 }
      );
    }
    const json = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            revisions?: Array<{
              slots?: { main?: { "*"?: string } };
              "*"?: string;
            }>;
          }
        >;
      };
    };

    const pages = Object.values(json.query?.pages ?? {});
    const wikitext =
      pages[0]?.revisions?.[0]?.slots?.main?.["*"] ||
      pages[0]?.revisions?.[0]?.["*"] ||
      "";

    const editions = parseImslpEditions(wikitext, imslpUrl);
    return apiJson(
      { editions, page_url: imslpUrl },
      { cacheSeconds: 86400 }
    );
  } catch {
    return apiJson({ editions: [], page_url: imslpUrl }, { cacheSeconds: 300 });
  }
}
