# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `privatesearch search <query>` with `--max-results`, `--region`,
  and `--json`; `privatesearch fetch-content <url>` prints a page as
  readable text.
- MCP server (`privatesearch mcp`, stdio) with two tools: `search` and
  `fetch_content`.
- Search uses DuckDuckGo's public HTML endpoint and parses its result
  blocks; redirect-wrapper URLs are unwrapped to the real destination.
- All HTTP goes through an injectable fetch function, so the test suite
  runs entirely on hand-written fixtures with no network access.
