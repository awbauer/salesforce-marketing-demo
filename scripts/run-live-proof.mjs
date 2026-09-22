import { report } from "./lib/report.mjs";
const required = ["PROOF_BASE_URL"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  await report("live-proof", {
    status: "blocked",
    boundary: "human_authorization_or_credentials",
    missing,
  });
  console.error(`Live proof requires: ${missing.join(", ")}`);
  process.exit(2);
}

const baseUrl = new URL(process.env.PROOF_BASE_URL);
const accessJwt = process.env.CF_ACCESS_JWT;
const request = async (path, authenticated = false) =>
  fetch(new URL(path, baseUrl), {
    redirect: "manual",
    headers: authenticated && accessJwt ? { "Cf-Access-Jwt-Assertion": accessJwt } : undefined,
  });

const unsigned = await request("/api/session");
const unsignedProtected =
  [301, 302, 303, 307, 308, 401, 403].includes(unsigned.status) &&
  !unsigned.headers.get("content-type")?.includes("application/json");

let authenticated;
if (accessJwt) {
  const response = await request("/api/ready", true);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  authenticated = {
    status: response.ok ? "passed" : "failed",
    httpStatus: response.status,
    body,
  };
}

const passed = unsignedProtected && (!authenticated || authenticated.status === "passed");
await report("live-proof", {
  status: passed ? "passed" : "failed",
  authentication: accessJwt ? "human_access_jwt" : "perimeter_only",
  unsigned: {
    status: unsignedProtected ? "passed" : "failed",
    httpStatus: unsigned.status,
    accessRedirect: unsigned.headers.get("location")?.includes("cloudflareaccess.com") ?? false,
  },
  authenticated,
});
if (!passed) process.exit(1);
