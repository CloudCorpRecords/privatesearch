# privatesearch — Build Report

MCP Rebuild 100, Tier A. Clean-room rebuild of the DuckDuckGo MCP
server (nickclyde/duckduckgo-mcp-server), built from the public tool
spec captured in `harness/fixtures/duckduckgo-tools-original.json`
only. The fixture was created for this build: it is docs-derived from
the original project's public documentation (tool names, parameter
types, required sets), marked `"_source": docs-derived ... not
hand-probed`. Local build only — nothing pushed or published, and no
live network call was made or claimed at any point.

Identity: repo `privatesearch`, npm `@reneturcios/privatesearch`,
MCP name `io.github.CloudCorpRecords/privatesearch`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `privatesearch: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Web search through DuckDuckGo and
  readable page fetching, no API key needed." = **76 chars** (≤100 ✓);
  npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/privatesearch:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/privatesearch"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`search`, `fetch-content`, `mcp`,
  `--version`; exit 2 usage / 1 fetch error), `src/mcp.ts`,
  `src/types.ts`, `src/search.ts` (core logic, `VERSION = "0.1.0"`)
- `test/search.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to privatesearch)

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the clockport precedent: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the public spec and
  break exact schema parity. Zod still validates every `tools/call`.
- Search targets the real keyless endpoint
  `https://html.duckduckgo.com/html/?q=...` (region sent as `kl` when
  given). Result blocks are parsed for title / URL / snippet; result
  links that are DuckDuckGo redirect wrappers are unwrapped via their
  `uddg` parameter. `fetch_content` retrieves the target URL and
  strips it to readable text (script/style/head dropped, block markup
  becomes line breaks, entities decoded).
- All HTTP flows through an injectable `FetchFn` (types.ts). The test
  suite uses a fake fetch returning a hand-written DuckDuckGo-like
  HTML fixture — **no live call was performed during this build**, so
  behaviour against the real endpoint's current markup is unverified
  (see Gaps).

## Verification (exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo exit=$?
tsc exit=0
```
`dist/` produced, including `dist/cli.js` with the
`#!/usr/bin/env node` shebang.

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 10
ℹ pass 10
ℹ fail 0
```
Covers: result-block parsing (title / unwrapped URL / snippet),
nested `uddg` query decoding, `max_results` slicing, region passed
as `kl`, empty-query and HTTP-error handling, HTML-to-text stripping
(scripts/styles/head removed, entities decoded), fetch_content happy
path and 404.

### 3. CLI / MCP smoke
`--version` → `0.1.0`; unknown command exits 2 with Usage;
`fetch-content` with no URL exits 2. MCP `initialize` over stdio →
`serverInfo: {"name":"privatesearch","version":"0.1.0"}`. CLI
search/fetch against the live endpoint were **not** run (offline
build rule for this wave).

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/duckduckgo-tools-original.json \
    --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/privatesearch/dist/cli.js mcp" \
    --out .../builds/privatesearch/parity-out
verdict=PASS parity_pct=100.0 original_tools=2 rebuild_tools=2 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
Original side is tools-file mode, so `fixture_results` records
`SKIPPED-TOOLS-FILE-MODE` — expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was copied from clockport's and edited with the
file edit tool: top-level `name`, root package `name`, and root
package `bin` key changed clockport -> privatesearch (dependency
ranges are identical, so the tree is unchanged). **Clean regeneration
(no `node_modules` present) is deferred to the publish wave**; do not
publish from this lockfile as-is. `node_modules` here is a `cp -a`
copy of clockport's (ownership-preservation warnings during the copy
were cosmetic; `.bin/tsc` / `.bin/tsx` verified working).

## Gaps / honest notes

- No live DuckDuckGo call was made. The parser is written against the
  endpoint's documented/observed HTML result-block shape as captured
  in the hand-written test fixture; if the live markup has drifted,
  parsing may return fewer or zero results until adjusted. A live
  smoke belongs to the publish wave.
- Snippet extraction takes the first `result__snippet` element after
  each result anchor within a bounded window; result blocks without a
  snippet yield an empty snippet string rather than an error.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.

## Publish remediation deviation (2026-10-27, publish train Wave 3)

Under Rene's 2026-10-27 remediation decision (the Wave 2 pattern,
`publish/GATE-POLICY.md`), descriptions were added to every tool
parameter that lacked one, in the `src/mcp.ts` schema literals only —
parameter names, types and required lists are unchanged.

- Descriptions added: 4 (search: query, max_results, region;
  fetch_content: url).
- Rebuild: `npm run build` (tsc) exit 0; `tsc --noEmit` exit 0; full
  test suite 10/10 pass.
- Parity harness re-run, verbatim: **PARTIAL, parity_pct 50.0** — all
  4 schema diffs are description additions (0 structural).
  Structural parity proven independently: stripping `description`
  keys from both the pre- and post-remediation tools/list makes them
  deep-equal, and every pre-existing description is unchanged.
  Full record: `publish/parity-remediation/privatesearch/parity.json`
  (tools-pre.json / tools-post.json alongside).
