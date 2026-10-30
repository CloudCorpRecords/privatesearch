# privatesearch

privatesearch looks things up on the web without an account, an API
key, or a search subscription. It asks DuckDuckGo's public HTML
endpoint a question and hands back the titles, addresses, and excerpts
of what came up, and it can also open a page and return the words on it
as plain readable text. It works from the command line or as an MCP
server for agents.

## Install

```bash
npx @reneturcios/privatesearch search "trail running shoes"
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/privatesearch
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

```bash
# Search the web; results print as title / URL / snippet blocks
privatesearch search "composting basics"
privatesearch search "composting basics" --max-results 5 --region uk-en
privatesearch search "composting basics" --json

# Fetch a page as readable text (markup, scripts, and styles removed)
privatesearch fetch-content https://example.com/some/article

privatesearch --version
```

Exit codes: `0` on success, `1` when a search or fetch fails (the
error names the problem), `2` for usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/privatesearch mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "privatesearch": {
      "command": "npx",
      "args": ["-y", "@reneturcios/privatesearch", "mcp"]
    }
  }
}
```

### Tools

| Tool | Input | What it returns |
| --- | --- | --- |
| `search` | `query` (string, required), `max_results` (integer, optional), `region` (string, optional, a DuckDuckGo region code such as `us-en`) | The matching results: for each one a title, the destination URL (redirect wrappers are unwrapped), and a snippet excerpt. |
| `fetch_content` | `url` (string, required) | The page's readable text: script, style, and head material removed, tags stripped, entities decoded. |

Search reads the result blocks of the HTML endpoint's response page;
when the endpoint returns no blocks the result list is empty rather
than an error. Fetch failures (non-2xx responses, unreachable hosts)
are reported as tool errors.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
