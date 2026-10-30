#!/usr/bin/env node
/**
 * privatesearch CLI.
 *
 *   privatesearch search <query> [--max-results n] [--region code] [--json]
 *   privatesearch fetch-content <url>
 *   privatesearch mcp
 *
 * Exit codes: 0 success, 1 search/fetch error, 2 usage error.
 */
import { fetchContent, searchWeb, VERSION } from "./search.js";
import type { FetchFn } from "./types.js";

function usage(): never {
  console.error(`Usage:
  privatesearch search <query> [--max-results n] [--region code] [--json]
  privatesearch fetch-content <url>
  privatesearch mcp
  privatesearch --version`);
  process.exit(2);
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function withoutFlags(args: string[], valueFlags: string[], boolFlags: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.includes(args[i])) i++;
    else if (!boolFlags.includes(args[i])) out.push(args[i]);
  }
  return out;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  try {
    if (cmd === "search") {
      const asJson = rest.includes("--json");
      const positional = withoutFlags(rest, ["--max-results", "--region"], ["--json"]);
      const query = positional.join(" ").trim();
      if (!query) usage();
      const maxRaw = flagValue(rest, "--max-results");
      const maxParsed = maxRaw !== undefined ? Number.parseInt(maxRaw, 10) : undefined;
      const result = await searchWeb(fetchFn, {
        query,
        max_results: maxParsed !== undefined && Number.isFinite(maxParsed) ? maxParsed : undefined,
        region: flagValue(rest, "--region"),
      });
      if (asJson) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.results.length === 0) {
        console.log("No results found.");
      } else {
        for (const r of result.results) {
          console.log(`${r.title}\n  ${r.url}\n  ${r.snippet}`);
        }
      }
    } else if (cmd === "fetch-content") {
      const [url] = rest;
      if (!url) usage();
      const result = await fetchContent(fetchFn, url);
      console.log(result.text);
    } else {
      usage();
    }
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
