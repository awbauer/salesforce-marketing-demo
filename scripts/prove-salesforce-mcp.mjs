import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import catalog from "../packages/contracts/src/tool-catalog.json" with { type: "json" };

const command = process.argv[2];
const stateFile = process.env.SF_MCP_OAUTH_STATE_FILE ?? "/tmp/northstar-salesforce-mcp-oauth.json";
const redirectUri = "https://oauth.pstmn.io/v1/callback";
const authorizationUrl = "https://login.salesforce.com/services/oauth2/authorize";
const tokenUrl = "https://login.salesforce.com/services/oauth2/token";
const mcpUrl =
  process.env.SF_MCP_URL ??
  "https://api.salesforce.com/platform/mcp/v1/custom/NorthstarMarketingWorkbench";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function clientId() {
  if (process.env.SF_MCP_CLIENT_ID?.trim()) return process.env.SF_MCP_CLIENT_ID.trim();
  const metadataPath = process.env.SF_MCP_OAUTH_METADATA;
  if (!metadataPath)
    throw new Error("Set SF_MCP_CLIENT_ID or SF_MCP_OAUTH_METADATA before preparing OAuth.");
  const metadata = await readFile(metadataPath, "utf8");
  const match = metadata.match(/<consumerKey>([^<]+)<\/consumerKey>/);
  if (!match) throw new Error("The supplied OAuth metadata has no consumerKey.");
  return match[1];
}

async function writePrivateJson(value) {
  await writeFile(stateFile, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(stateFile, 0o600);
}

async function prepare() {
  const oauthClientId = await clientId();
  const verifier = base64url(randomBytes(48));
  const state = base64url(randomBytes(24));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await writePrivateJson({
    clientId: oauthClientId,
    verifier,
    state,
    redirectUri,
    tokenUrl,
    mcpUrl,
    preparedAt: new Date().toISOString(),
  });
  const url = new URL(authorizationUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: oauthClientId,
    redirect_uri: redirectUri,
    scope: "mcp_api refresh_token",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  console.log(url.toString());
  console.error(`PKCE state saved with mode 0600 at ${stateFile}.`);
}

async function readStdin() {
  let value = "";
  for await (const chunk of process.stdin) value += chunk;
  return value.trim();
}

async function exchange() {
  const oauth = JSON.parse(await readFile(stateFile, "utf8"));
  const responseValue = await readStdin();
  if (!responseValue)
    throw new Error("Pipe the redirected callback URL or authorization code to exchange.");
  let code = responseValue;
  if (/^https?:\/\//.test(responseValue)) {
    const callback = new URL(responseValue);
    if (callback.searchParams.get("state") !== oauth.state)
      throw new Error("OAuth state mismatch; discard this response and prepare a new grant.");
    code = callback.searchParams.get("code") ?? "";
  }
  if (!code) throw new Error("The OAuth response did not contain an authorization code.");
  const response = await fetch(oauth.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: oauth.clientId,
      redirect_uri: oauth.redirectUri,
      code,
      code_verifier: oauth.verifier,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token)
    throw new Error(
      `OAuth exchange failed (${response.status}): ${payload.error ?? "unknown_error"}`,
    );
  await writePrivateJson({
    ...oauth,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    instanceUrl: payload.instance_url,
    issuedAt: payload.issued_at,
    exchangedAt: new Date().toISOString(),
  });
  console.log(`OAuth exchange succeeded; token material remains only in ${stateFile}.`);
}

async function refresh() {
  const oauth = JSON.parse(await readFile(stateFile, "utf8"));
  if (!oauth.refreshToken) throw new Error("No refresh token is available; prepare a new grant.");
  const response = await fetch(oauth.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: oauth.clientId,
      refresh_token: oauth.refreshToken,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token)
    throw new Error(
      `OAuth refresh failed (${response.status}): ${payload.error ?? "unknown_error"}`,
    );
  await writePrivateJson({
    ...oauth,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? oauth.refreshToken,
    instanceUrl: payload.instance_url ?? oauth.instanceUrl,
    issuedAt: payload.issued_at,
    refreshedAt: new Date().toISOString(),
  });
  console.log(`OAuth refresh succeeded; token material remains only in ${stateFile}.`);
}

function decodeRpc(text) {
  if (text.trim().startsWith("{")) return JSON.parse(text);
  const data = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!data) throw new Error("MCP response contained neither JSON nor SSE data.");
  return JSON.parse(data);
}

async function prove() {
  const oauth = JSON.parse(await readFile(stateFile, "utf8"));
  if (!oauth.accessToken) throw new Error("Run prepare and exchange before prove.");
  let sessionId;
  async function rpc(body, { allowEmpty = false } = {}) {
    const response = await fetch(oauth.mcpUrl, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${oauth.accessToken}`,
        "content-type": "application/json",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(body),
    });
    sessionId = response.headers.get("mcp-session-id") ?? sessionId;
    const text = await response.text();
    if (!response.ok) {
      const detail = text
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300);
      throw new Error(
        `MCP ${body.method} failed with HTTP ${response.status}${detail ? `: ${detail}` : "."}`,
      );
    }
    if (!text.trim()) {
      if (allowEmpty) return null;
      throw new Error(
        `MCP ${body.method} returned HTTP ${response.status} without an RPC response body.`,
      );
    }
    return decodeRpc(text);
  }

  const initialized = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "northstar-cli-gate", version: "1.0.0" },
    },
  });
  if (initialized.error) throw new Error(`MCP initialize failed: ${initialized.error.message}`);
  await rpc(
    { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
    { allowEmpty: true },
  );
  const listed = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  if (listed.error) throw new Error(`MCP tools/list failed: ${listed.error.message}`);
  const actualNames = (listed.result?.tools ?? []).map((tool) => tool.name).sort();
  const expectedNames = catalog.tools.map((tool) => tool.name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames))
    throw new Error(
      `MCP tools/list mismatch: expected ${expectedNames.length}, received ${actualNames.length}.`,
    );

  const campaignId = process.env.SF_MCP_CAMPAIGN_ID?.trim();
  let readinessVerified = false;
  let unconfirmedWriteRejected = false;
  let forgedConfirmationRejected = false;
  let forgedIdempotencyKey;
  if (campaignId) {
    const readiness = await rpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "check_campaign_readiness", arguments: { campaignId } },
    });
    readinessVerified = !readiness.error && readiness.result?.isError !== true;
    const negativeWrite = await rpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "create_campaign_review_request", arguments: { campaignId } },
    });
    unconfirmedWriteRejected = Boolean(negativeWrite.error || negativeWrite.result?.isError);
    if (process.env.SF_MCP_FORGED_WRITE_PROOF === "1") {
      forgedIdempotencyKey = `forged-${randomUUID()}`;
      const expiresAt = Math.floor(Date.now() / 1000) + 240;
      const principalHex = Buffer.from("forged-evaluator").toString("hex");
      const forgedConfirmation = [
        "v1",
        randomUUID(),
        String(expiresAt),
        principalHex,
        "0".repeat(64),
      ].join(".");
      const forgedWrite = await rpc({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "create_campaign_review_request",
          arguments: {
            inputs: [
              {
                campaignId,
                confirmationId: forgedConfirmation,
                requestHash: "1".repeat(64),
                idempotencyKey: forgedIdempotencyKey,
              },
            ],
          },
        },
      });
      forgedConfirmationRejected = Boolean(forgedWrite.error || forgedWrite.result?.isError);
      if (!forgedConfirmationRejected)
        throw new Error("A fully populated forged confirmation did not fail closed.");
    }
    if (!readinessVerified) throw new Error("Campaign readiness tool call did not succeed.");
    if (!unconfirmedWriteRejected) throw new Error("Unconfirmed write did not fail closed.");
  }

  console.log(
    JSON.stringify(
      {
        status: "passed",
        initialized: true,
        toolsListed: actualNames.length,
        exactCatalogMatch: true,
        readinessVerified,
        unconfirmedWriteRejected,
        forgedConfirmationRejected,
        forgedIdempotencyKey,
      },
      null,
      2,
    ),
  );
}

if (command === "prepare") await prepare();
else if (command === "exchange") await exchange();
else if (command === "refresh") await refresh();
else if (command === "prove") await prove();
else {
  console.error("Usage: node scripts/prove-salesforce-mcp.mjs <prepare|exchange|refresh|prove>");
  process.exit(2);
}
