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

function cleanWikiText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\{\{[^}]+\}\}/g, " ")
    .replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseImslpEditions(wikitext: string, pageUrl: string): ImslpEdition[] {
  const editions: ImslpEdition[] = [];
  // Match {{#fte:imslpfile|...}} blocks
  const blockRegex = /\{\{#fte:imslpfile\|([\s\S]*?)\}\}/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(wikitext)) !== null && editions.length < 12) {
    const body = match[1];
    const get = (key: string) => {
      const m = body.match(new RegExp(`\\|\\s*${key}\\s*=\\s*([^|\\n]+)`, "i"));
      return m ? cleanWikiText(m[1]) : null;
    };

    const fileName = get("File Name 1") || get("File Name");
    const desc =
      get("File Description 1") ||
      get("File Description") ||
      "Complete Score";
    const publisher = get("Publisher");
    const editor = get("Editor");
    const copyright = get("Copyright");

    // Extract IMSLP file number if present (e.g. PMLP... or IMSLP12345)
    const idMatch = body.match(/IMSLP\d{4,}/i);
    const imslpId = idMatch ? idMatch[0] : null;

    if (!fileName && !publisher && !desc) continue;

    editions.push({
      description: desc.slice(0, 120),
      publisher: publisher ? publisher.slice(0, 140) : null,
      editor: editor ? editor.slice(0, 100) : null,
      copyright: copyright ? copyright.slice(0, 80) : null,
      fileName: fileName ? fileName.slice(0, 120) : null,
      imslpId,
      url: imslpId ? `${pageUrl}#${imslpId}` : pageUrl,
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
  apiUrl.searchParams.set("rvslots", "main");
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
      return apiJson({ editions: [], page_url: imslpUrl }, { cacheSeconds: 3600 });
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
