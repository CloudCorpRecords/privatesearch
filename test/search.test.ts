import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fetchContent,
  htmlToText,
  parseSearchResults,
  searchWeb,
  unwrapResultUrl,
} from "../src/search.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

// Hand-written fixture in the shape of the DuckDuckGo HTML endpoint:
// result blocks with a result__a title link (a redirect wrapper), a
// result__url display link, and a result__snippet excerpt link.
const DDG_HTML = `<!DOCTYPE html>
<html><head><title>cats at DuckDuckGo</title></head><body>
<div class="results">
  <div class="result results_links results_links_deep web-result">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FCat&amp;rut=abc123">Cat - Wikipedia</a>
    </h2>
    <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FCat&amp;rut=abc123">en.wikipedia.org/wiki/Cat</a>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FCat&amp;rut=abc123">The <b>cat</b> is a domestic species of small carnivorous mammal.</a>
  </div>
  <div class="result results_links results_links_deep web-result">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="https://www.aspca.org/pet-care/cat-care">Cat Care | ASPCA</a>
    </h2>
    <a class="result__snippet" href="https://www.aspca.org/pet-care/cat-care">Tips &amp; advice for keeping your cat happy and healthy.</a>
  </div>
  <div class="result results_links results_links_deep web-result">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fcats%3Fq%3D1%26lang%3Den&amp;rut=def456">All About Cats</a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fcats&amp;rut=def456">A page entirely about cats.</a>
  </div>
</div>
</body></html>`;

const PAGE_HTML = `<!DOCTYPE html>
<html><head><title>Hello Page</title><style>body { color: red; }</style></head>
<body>
<h1>Welcome</h1>
<p>First paragraph with <b>bold</b> words &amp; an entity.</p>
<script>var secret = "should not appear";</script>
<p>Second paragraph.</p>
</body></html>`;

function okResponse(body: string): HttpResponse {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => "text/html; charset=utf-8" },
    text: async () => body,
  };
}

/** Fake fetch: records the requested URL, serves fixture bodies by host. */
function fakeFetch(captured: { url?: string }): FetchFn {
  return async (url: string) => {
    captured.url = url;
    if (url.startsWith("https://html.duckduckgo.com/")) return okResponse(DDG_HTML);
    if (url === "https://example.com/page") return okResponse(PAGE_HTML);
    return {
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: { get: () => null },
      text: async () => "missing",
    };
  };
}

describe("parseSearchResults", () => {
  it("extracts title, unwrapped url, and snippet per result block", () => {
    const results = parseSearchResults(DDG_HTML);
    assert.equal(results.length, 3);
    assert.deepEqual(results[0], {
      title: "Cat - Wikipedia",
      url: "https://en.wikipedia.org/wiki/Cat",
      snippet: "The cat is a domestic species of small carnivorous mammal.",
    });
    assert.deepEqual(results[1], {
      title: "Cat Care | ASPCA",
      url: "https://www.aspca.org/pet-care/cat-care",
      snippet: "Tips & advice for keeping your cat happy and healthy.",
    });
  });

  it("decodes nested query parameters inside the uddg wrapper", () => {
    const results = parseSearchResults(DDG_HTML);
    assert.equal(results[2].url, "https://example.com/cats?q=1&lang=en");
    assert.equal(results[2].snippet, "A page entirely about cats.");
  });

  it("returns an empty list when the page has no result blocks", () => {
    assert.deepEqual(parseSearchResults("<html><body>No results.</body></html>"), []);
  });
});

describe("unwrapResultUrl", () => {
  it("passes plain and protocol-relative URLs through sensibly", () => {
    assert.equal(unwrapResultUrl("https://example.com/a"), "https://example.com/a");
    assert.equal(unwrapResultUrl("//example.com/a"), "https://example.com/a");
  });
});

describe("searchWeb", () => {
  it("queries the HTML endpoint and parses the results", async () => {
    const captured: { url?: string } = {};
    const out = await searchWeb(fakeFetch(captured), { query: "cats" });
    assert.equal(out.query, "cats");
    assert.equal(out.results.length, 3);
    assert.ok(captured.url?.startsWith("https://html.duckduckgo.com/html/?"));
    assert.ok(captured.url?.includes("q=cats"));
    assert.equal(out.region, undefined);
  });

  it("honours max_results and passes the region through as kl", async () => {
    const captured: { url?: string } = {};
    const out = await searchWeb(fakeFetch(captured), {
      query: "cats",
      max_results: 2,
      region: "uk-en",
    });
    assert.equal(out.results.length, 2);
    assert.equal(out.region, "uk-en");
    assert.ok(captured.url?.includes("kl=uk-en"));
  });

  it("rejects an empty query and propagates HTTP failures", async () => {
    await assert.rejects(() => searchWeb(fakeFetch({}), { query: "  " }), /non-empty/);
    const failing: FetchFn = async () => ({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      headers: { get: () => null },
      text: async () => "",
    });
    await assert.rejects(() => searchWeb(failing, { query: "cats" }), /HTTP 503/);
  });
});

describe("htmlToText / fetchContent", () => {
  it("strips markup, scripts, and styles down to readable text", () => {
    const text = htmlToText(PAGE_HTML);
    assert.ok(text.includes("Welcome"));
    assert.ok(text.includes("First paragraph with bold words & an entity."));
    assert.ok(text.includes("Second paragraph."));
    assert.ok(!text.includes("should not appear"));
    assert.ok(!text.includes("color: red"));
    assert.ok(!text.includes("Hello Page"));
  });

  it("fetchContent returns the page text for a URL", async () => {
    const out = await fetchContent(fakeFetch({}), "https://example.com/page");
    assert.equal(out.url, "https://example.com/page");
    assert.ok(out.text.includes("Welcome"));
  });

  it("fetchContent errors on a missing page and an empty URL", async () => {
    await assert.rejects(
      () => fetchContent(fakeFetch({}), "https://example.com/nope"),
      /HTTP 404/,
    );
    await assert.rejects(() => fetchContent(fakeFetch({}), ""), /non-empty/);
  });
});
