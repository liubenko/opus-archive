/**
 * Polite, Human-Paced HTTP Fetcher & Per-Host Circuit Breaker
 * for Opus Archive World Stage Crawlers.
 *
 * Implements the 6 anti-ban crawling habits:
 *  1. Consistent, realistic desktop Chrome headers + locale-matched Accept-Language + Referer
 *  2. Per-origin cookie jar (one continuous browser session per host)
 *  3. Sequential randomized human delays (3–10s in CLI/cron, 1.2–2.8s in serverless)
 *  4. Per-host circuit breaker: stops immediately on 403 / 429 / 503 / WAF challenge
 *     and never retry-loops a blocked host
 *  5. Optional Firecrawl managed fallback (only when FIRECRAWL_API_KEY is explicitly set
 *     and a datacenter IP is blocked)
 *  6. URL canonicalization helper for delta scraping
 */

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BLOCKING_STATUS_CODES = new Set([403, 429, 503]);

export function randomBetween(minMs, maxMs) {
  const low = Math.max(0, Number(minMs) || 0);
  const high = Math.max(low, Number(maxMs) || low);
  return Math.floor(low + Math.random() * (high - low + 1));
}

export function sleepMs(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getHostname(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function normalizeUrlForDelta(rawUrl) {
  if (!rawUrl) return "";
  try {
    const u = new URL(String(rawUrl).trim());
    u.hash = "";
    // Strip tracking params so UTM variants don't look like brand-new concerts
    for (const k of [...u.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid|mc_cid|mc_eid)/i.test(k)) {
        u.searchParams.delete(k);
      }
    }
    const cleanedPath = u.pathname.replace(/\/+$/, "") || "/";
    const qs = u.searchParams.toString();
    return `${u.origin.toLowerCase()}${cleanedPath}${qs ? `?${qs}` : ""}`;
  } catch {
    return String(rawUrl).trim().toLowerCase().replace(/\/+$/, "");
  }
}

export function inferAcceptLanguageForHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (h.endsWith(".ua")) return "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7";
  if (h.endsWith(".de") || h.endsWith(".at") || h.endsWith(".ch")) {
    return "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7";
  }
  if (h.endsWith(".fr") || h.endsWith(".be")) {
    return "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7";
  }
  if (h.endsWith(".it")) return "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7";
  if (h.endsWith(".pl")) return "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7";
  if (h.endsWith(".es")) return "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7";
  if (h.endsWith(".nl")) return "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7";
  if (h.endsWith(".jp")) return "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7";
  return "en-US,en;q=0.9";
}

export function buildBrowserHeaders(url, options = {}) {
  const host = getHostname(url);
  const refererHost = options.referer ? getHostname(options.referer) : "";
  const isSameOrigin = Boolean(refererHost && refererHost === host);

  const headers = {
    "User-Agent": BROWSER_USER_AGENT,
    Accept:
      options.accept ||
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": inferAcceptLanguageForHost(host),
    "Cache-Control": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": options.isApi ? "empty" : "document",
    "Sec-Fetch-Mode": options.isApi ? "cors" : "navigate",
    "Sec-Fetch-Site": options.referer
      ? isSameOrigin
        ? "same-origin"
        : "cross-site"
      : "none",
  };

  if (!options.isApi) {
    headers["Sec-Fetch-User"] = "?1";
  }
  if (options.referer) {
    headers.Referer = options.referer;
  }
  if (options.cookieHeader) {
    headers.Cookie = options.cookieHeader;
  }
  return headers;
}

function detectWafChallenge(res, bodyText) {
  if (res.headers.get("cf-mitigated") === "challenge") {
    return "Cloudflare challenge header";
  }
  const head = String(bodyText || "").slice(0, 6000);
  if (
    /<title>\s*(?:Just a moment\.\.\.|Attention Required!\s*\|\s*Cloudflare|Access Denied|Checking your browser)\s*<\/title>/i.test(
      head
    ) ||
    /challenges\.cloudflare\.com\/turnstile|window\._cf_chl_opt|g-recaptcha/i.test(
      head
    )
  ) {
    return "WAF / bot challenge page";
  }
  return null;
}

function extractSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  if (!single) return [];
  // Split combined Set-Cookie header carefully (avoiding Expires=Wed, 01 Jan ... commas)
  return single.split(/,(?=\s*[^;=,\s]+=[^;,]+)/g);
}

/**
 * Optional managed scraper fallback (Firecrawl) used ONLY when:
 *  - FIRECRAWL_API_KEY is configured in the environment, AND
 *  - A host blocked our datacenter IP (403 / WAF).
 */
async function fetchViaFirecrawl(url, apiKey, timeoutMs = 15000) {
  if (!apiKey) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ["html"],
        onlyMainContent: false,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.html || json?.data?.rawHtml || null;
  } catch {
    return null;
  }
}

/**
 * Creates a reusable polite HTTP session with:
 *  - Per-origin cookie jar
 *  - Per-host circuit breaker on 403 / 429 / 503 / WAF challenge
 *  - Randomized human pacing between requests
 *  - Optional Firecrawl fallback on datacenter-IP blocks
 */
export function createPoliteSession(config = {}) {
  const minDelayMs = config.minDelayMs ?? 3200;
  const maxDelayMs = config.maxDelayMs ?? 9500;
  const timeoutMs = config.timeoutMs ?? 9000;
  const firecrawlApiKey = config.firecrawlApiKey || "";
  const logger = config.logger || console;

  /** @type {Map<string, Map<string, string>>} */
  const cookieJar = new Map();
  /** @type {Map<string, { status: number, retryAfter: string | null, reason: string, trippedAt: string }>} */
  const trippedHosts = new Map();
  /** @type {Map<string, number>} */
  const lastRequestByHost = new Map();
  let lastGlobalRequestAt = 0;

  function getCookieHeader(host) {
    const jar = cookieJar.get(host);
    if (!jar || jar.size === 0) return "";
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  function storeCookies(host, headers) {
    const rawList = extractSetCookies(headers);
    if (rawList.length === 0) return;
    let jar = cookieJar.get(host);
    if (!jar) {
      jar = new Map();
      cookieJar.set(host, jar);
    }
    for (const raw of rawList) {
      const firstPair = String(raw).split(";")[0]?.trim();
      if (!firstPair) continue;
      const eq = firstPair.indexOf("=");
      if (eq <= 0) continue;
      const name = firstPair.slice(0, eq).trim();
      const val = firstPair.slice(eq + 1).trim();
      if (name) jar.set(name, val);
    }
  }

  function tripBreaker(host, status, retryAfter, reason) {
    if (!host) return;
    const entry = {
      status,
      retryAfter: retryAfter || null,
      reason,
      trippedAt: new Date().toISOString(),
    };
    trippedHosts.set(host, entry);
    logger.warn?.(
      `[circuit-breaker] Stopped for ${host} (${reason}${retryAfter ? `, Retry-After: ${retryAfter}` : ""}) — will wait until next scheduled run.`
    );
  }

  function isHostBlocked(urlOrHost) {
    const host = urlOrHost.includes("://")
      ? getHostname(urlOrHost)
      : String(urlOrHost || "").toLowerCase();
    return trippedHosts.has(host);
  }

  async function paceRequest(host, skipDelay = false) {
    if (skipDelay || maxDelayMs <= 0) return;
    const now = Date.now();
    const lastHostAt = lastRequestByHost.get(host) || 0;
    const isSameHostRepeat = lastHostAt > 0;

    // Full 3-10s human delay when hitting the same host again; lighter randomized pause between distinct hosts
    const targetWait = isSameHostRepeat
      ? randomBetween(minDelayMs, maxDelayMs)
      : lastGlobalRequestAt > 0
        ? randomBetween(Math.floor(minDelayMs * 0.45), Math.floor(maxDelayMs * 0.55))
        : 0;

    const elapsed = now - (isSameHostRepeat ? lastHostAt : lastGlobalRequestAt);
    const remaining = targetWait - elapsed;
    if (remaining > 0) {
      await sleepMs(remaining);
    }
  }

  /**
   * Fetches a URL politely with cookie persistence, browser headers, pacing,
   * and immediate circuit breaking on 403/429/503/WAF.
   */
  async function fetchText(url, options = {}) {
    const host = getHostname(url);
    if (!host) {
      return {
        ok: false,
        status: 0,
        blocked: false,
        skippedByBreaker: false,
        retryAfter: null,
        reason: "Invalid URL",
        text: null,
        via: "none",
      };
    }

    if (trippedHosts.has(host)) {
      const prev = trippedHosts.get(host);
      return {
        ok: false,
        status: prev.status,
        blocked: true,
        skippedByBreaker: true,
        retryAfter: prev.retryAfter,
        reason: `Circuit breaker open (${prev.reason})`,
        text: null,
        via: "breaker",
      };
    }

    await paceRequest(host, Boolean(options.skipDelay));

    const cookieHeader = getCookieHeader(host);
    const headers = buildBrowserHeaders(url, {
      referer: options.referer,
      accept: options.accept,
      isApi: options.isApi,
      cookieHeader,
    });

    const reqTimeout = options.timeoutMs ?? timeoutMs;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), reqTimeout);
      const res = await fetch(url, {
        headers,
        redirect: "follow",
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      const now = Date.now();
      lastRequestByHost.set(host, now);
      lastGlobalRequestAt = now;
      storeCookies(host, res.headers);

      const retryAfter = res.headers.get("retry-after");

      if (BLOCKING_STATUS_CODES.has(res.status)) {
        tripBreaker(host, res.status, retryAfter, `HTTP ${res.status}`);

        // Optional managed fallback ONLY if Firecrawl key is explicitly configured
        if (options.allowFirecrawlFallback && firecrawlApiKey) {
          const fcHtml = await fetchViaFirecrawl(url, firecrawlApiKey);
          if (fcHtml) {
            return {
              ok: true,
              status: 200,
              blocked: false,
              skippedByBreaker: false,
              retryAfter: null,
              reason: null,
              text: fcHtml,
              via: "firecrawl",
            };
          }
        }

        return {
          ok: false,
          status: res.status,
          blocked: true,
          skippedByBreaker: false,
          retryAfter,
          reason: `HTTP ${res.status}`,
          text: null,
          via: "fetch",
        };
      }

      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          blocked: false,
          skippedByBreaker: false,
          retryAfter,
          reason: `HTTP ${res.status}`,
          text: null,
          via: "fetch",
        };
      }

      const bodyText = await res.text();
      const wafReason = detectWafChallenge(res, bodyText);
      if (wafReason) {
        tripBreaker(host, res.status, retryAfter, wafReason);

        if (options.allowFirecrawlFallback && firecrawlApiKey) {
          const fcHtml = await fetchViaFirecrawl(url, firecrawlApiKey);
          if (fcHtml) {
            return {
              ok: true,
              status: 200,
              blocked: false,
              skippedByBreaker: false,
              retryAfter: null,
              reason: null,
              text: fcHtml,
              via: "firecrawl",
            };
          }
        }

        return {
          ok: false,
          status: res.status,
          blocked: true,
          skippedByBreaker: false,
          retryAfter,
          reason: wafReason,
          text: null,
          via: "fetch",
        };
      }

      return {
        ok: true,
        status: res.status,
        blocked: false,
        skippedByBreaker: false,
        retryAfter: null,
        reason: null,
        text: bodyText,
        via: "fetch",
      };
    } catch (err) {
      const now = Date.now();
      lastRequestByHost.set(host, now);
      lastGlobalRequestAt = now;
      return {
        ok: false,
        status: 0,
        blocked: false,
        skippedByBreaker: false,
        retryAfter: null,
        reason: err?.name === "AbortError" ? "Request timed out" : String(err?.message || err),
        text: null,
        via: "fetch",
      };
    }
  }

  function getBlockedSummary() {
    return [...trippedHosts.entries()].map(([host, info]) => ({
      host,
      ...info,
    }));
  }

  return {
    fetchText,
    isHostBlocked,
    tripBreaker,
    getBlockedSummary,
    getCookieHeader,
  };
}
