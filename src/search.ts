/**
 * privatesearch core: web search and page fetching through DuckDuckGo's
 * public endpoints.
 *
 * Search queries go to the keyless HTML endpoint
 * (https://html.duckduckgo.com/html/) and the returned document is
 * parsed for its result blocks: each block carries a result link (the
 * title), a snippet link (the excerpt), and a display URL. Result links
 * on that endpoint are redirect wrappers, so the real destination is
 * recovered from the wrapper's `uddg` parameter when present.
 *
 * fetch_content retrieves an arbitrary page and reduces its body to
 * readable text: script/style/head material is dropped, block-level
 * markup becomes line breaks, remaining tags are removed, and entities
 * are decoded.
 *
 * All HTTP goes through an injected FetchFn so the parsing logic is
 * fully testable offline with hand-written fixtures.
 */
import type {
  FetchContentResult,
  FetchFn,
  SearchOptions,
  SearchResultItem,
  SearchResults,
} from "./types.js";

export const VERSION = "0.1.0";

export const SEARCH_ENDPOINT = "https://html.duckduckgo.com/html/";

export const DEFAULT_MAX_RESULTS = 10;

export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "(c)",
  mdash: "--",
  ndash: "-",
  hellip: "...",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

/** Remove markup from a fragment, decode entities, and tidy whitespace. */
export function stripTags(fragment: string): string {
  const noTags = fragment.replace(/<[^>]*>/g, "");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

/**
 * Recover the real destination from a DuckDuckGo redirect wrapper
 * (//duckduckgo.com/l/?uddg=<encoded>&rut=...). Non-wrapper hrefs are
 * returned unchanged, with protocol-relative URLs given an https scheme.
 */
export function unwrapResultUrl(href: string): string {
  const decoded = decodeEntities(href);
  try {
    const parsed = new URL(decoded, "https://duckduckgo.com");
    const target = parsed.searchParams.get("uddg");
    if (target) return target;
    return parsed.href;
  } catch {
    return decoded;
  }
}

function attrValue(tag: string, name: string): string {
  const dbl = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  if (dbl) return dbl[1];
  const sgl = new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i").exec(tag);
  return sgl ? sgl[1] : "";
}

/**
 * Parse the result blocks of a DuckDuckGo HTML results page.
 *
 * Blocks are anchored on anchors carrying the `result__a` class; the
 * snippet is the text of the next `result__snippet` element after the
 * anchor, and parsing stops at the following result anchor so snippets
 * never bleed across results.
 */
export function parseSearchResults(html: string): SearchResultItem[] {
  const results: SearchResultItem[] = [];
  const anchorRe = /<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a\s*>/gi;
  const anchors: Array<{ href: string; title: string; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const openTag = m[0].slice(0, m[0].indexOf(">") + 1);
    anchors.push({
      href: attrValue(openTag, "href"),
      title: stripTags(m[1]),
      end: m.index + m[0].length,
    });
  }
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (!a.href || !a.title) continue;
    const limit = i + 1 < anchors.length ? anchors[i + 1].end : html.length;
    const region = html.slice(a.end, Math.min(limit + 4000, html.length));
    const snip = /<a\b[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a\s*>/i.exec(region);
    results.push({
      title: a.title,
      url: unwrapResultUrl(a.href),
      snippet: snip ? stripTags(snip[1]) : "",
    });
  }
  return results;
}

/** Reduce an HTML document (or any text body) to readable plain text. */
export function htmlToText(html: string): string {
  let out = html;
  out = out.replace(/<!--[\s\S]*?-->/g, " ");
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ");
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ");
  out = out.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ");
  out = out.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, " ");
  out = out.replace(/<br\b[^>]*>/gi, "\n");
  out = out.replace(
    /<\/(?:p|div|section|article|header|footer|main|li|tr|h[1-6]|blockquote|pre)\s*>/gi,
    "\n",
  );
  out = out.replace(/<[^>]*>/g, "");
  out = decodeEntities(out);
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
    .join("\n")
    .trim();
}

async function getBody(fetchFn: FetchFn, url: string): Promise<string> {
  let response;
  try {
    response = await fetchFn(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,*/*" },
      redirect: "follow",
    });
  } catch (err) {
    throw new Error(
      `Failed to fetch ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
    );
  }
  return response.text();
}

/** Run a web search and return up to max_results parsed results. */
export async function searchWeb(
  fetchFn: FetchFn,
  options: SearchOptions,
): Promise<SearchResults> {
  const query = typeof options.query === "string" ? options.query.trim() : "";
  if (!query) throw new Error("query must be a non-empty string");
  const maxResults =
    options.max_results !== undefined && Number.isFinite(options.max_results)
      ? Math.max(1, Math.floor(options.max_results))
      : DEFAULT_MAX_RESULTS;
  const region =
    typeof options.region === "string" && options.region.trim()
      ? options.region.trim()
      : undefined;

  const params = new URLSearchParams({ q: query });
  if (region) params.set("kl", region);
  const url = `${SEARCH_ENDPOINT}?${params.toString()}`;

  const html = await getBody(fetchFn, url);
  const results = parseSearchResults(html).slice(0, maxResults);
  const out: SearchResults = { query, results };
  if (region) out.region = region;
  return out;
}

/** Fetch a page and return its readable text. */
export async function fetchContent(
  fetchFn: FetchFn,
  url: string,
): Promise<FetchContentResult> {
  const target = typeof url === "string" ? url.trim() : "";
  if (!target) throw new Error("url must be a non-empty string");
  const body = await getBody(fetchFn, target);
  return { url: target, text: htmlToText(body) };
}
