// Workers AI credentials and provider for the evaluation scripts. A wrangler OAuth token expires
// after about an hour, and a rate-limited frontier run lasts longer, so the token is refreshed
// as it ages and once more on a 401. A CLOUDFLARE_API_TOKEN never expires mid-run and is used as is.
import { execFileSync } from "node:child_process";
import { createWorkersAI } from "workers-ai-provider";
import { throttled } from "./eval-throttle.mjs";

const REFRESH_MS = 10 * 60_000;

// Call the local binary directly: pnpm can print a banner before the JSON.
function wrangler(args) {
  const output = execFileSync("node_modules/.bin/wrangler", [...args, "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(output.slice(output.indexOf("{")));
}

export function createEvalProvider() {
  const fixed = process.env.CLOUDFLARE_API_TOKEN;
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) {
    const accounts = wrangler(["whoami"]).accounts ?? [];
    if (accounts.length !== 1)
      throw new Error("Set CLOUDFLARE_ACCOUNT_ID: wrangler reports zero or several accounts.");
    accountId = accounts[0].id;
  }
  let token = fixed;
  let fetchedAt = fixed ? Number.POSITIVE_INFINITY : 0;
  const freshToken = (force = false) => {
    if (fixed) return fixed;
    if (force || !token || Date.now() - fetchedAt > REFRESH_MS) {
      token = wrangler(["auth", "token"]).token;
      fetchedAt = Date.now();
    }
    return token;
  };
  const authedFetch = async (input, init) => {
    const send = (bearer) => {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${bearer}`);
      return fetch(input, { ...init, headers });
    };
    const response = await send(freshToken());
    return response.status === 401 && !fixed ? send(freshToken(true)) : response;
  };
  return throttled(
    createWorkersAI({ accountId, apiKey: "refreshed-per-request", fetch: authedFetch }),
  );
}
