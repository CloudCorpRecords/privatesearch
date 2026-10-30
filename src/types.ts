/**
 * privatesearch types.
 *
 * A search takes a query plus optional result-count and region controls
 * and yields a list of results, each with a title, the page URL, and a
 * short snippet. A fetch takes one URL and yields the page's readable
 * text. HTTP access is described by a minimal response surface so tests
 * can inject a fake fetch and never touch the network.
 */

export interface SearchOptions {
  query: string;
  /** Maximum number of results to return. Defaults to 10. */
  max_results?: number;
  /** DuckDuckGo region code, e.g. "us-en" or "uk-en". Unset means no region bias. */
  region?: string;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResults {
  query: string;
  region?: string;
  results: SearchResultItem[];
}

export interface FetchContentResult {
  url: string;
  /** The page body with markup stripped down to readable text. */
  text: string;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchFn = (
  url: string,
  init?: { headers?: Record<string, string>; redirect?: string },
) => Promise<HttpResponse>;
