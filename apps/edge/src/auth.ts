import { createRemoteJWKSet, jwtVerify } from "jose";
import { PrincipalSchema, PROOF_DEFAULTS, type Principal } from "@northstar/contracts";

export type AuthBindings = {
  AUTH_MODE: string;
  ENVIRONMENT: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
};

export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
  }
}

export async function resolvePrincipal(request: Request, env: AuthBindings): Promise<Principal> {
  if (env.AUTH_MODE === "development" && env.ENVIRONMENT === "local")
    return {
      subject: "local-evaluator",
      email: "evaluator@northstar.example",
      role: "evaluator",
      tenantId: "northstar-pot",
    };
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token)
    throw new AuthError("UNAUTHENTICATED", "Cloudflare Access authentication is required.");
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD)
    throw new AuthError("FORBIDDEN", "Access verifier is not configured.");
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  const result = await jwtVerify(
    token,
    createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
    { issuer, audience: env.ACCESS_AUD },
  );
  const parsed = PrincipalSchema.safeParse({
    subject: result.payload.sub,
    email: result.payload.email,
    role: result.payload.role ?? "evaluator",
    tenantId: result.payload.tenant_id ?? "northstar-pot",
  });
  if (!parsed.success || !PROOF_DEFAULTS.roles.includes(parsed.data.role))
    throw new AuthError("FORBIDDEN", "The Access identity is not allowed in this workspace.");
  return parsed.data;
}

export async function deriveAgentKey(principal: Principal, workspaceId: string) {
  const bytes = new TextEncoder().encode(
    `${principal.tenantId}:${principal.subject}:${workspaceId}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `wk_${Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}
