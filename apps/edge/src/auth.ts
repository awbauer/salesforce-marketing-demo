import { DEFAULTS, INSTANCE_PROFILE, type Principal, PrincipalSchema } from "@workbench/contracts";
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  decodeProtectedHeader,
  importSPKI,
  jwtVerify,
} from "jose";

export type AuthBindings = {
  AUTH_MODE: string;
  ENVIRONMENT: string;
  /** Cloudflare Access (AUTH_MODE=access). */
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Generic OIDC (AUTH_MODE=oidc): a bearer token checked against the issuer's keys. */
  OIDC_ISSUER?: string;
  OIDC_AUDIENCE?: string;
  OIDC_JWKS_URL?: string;
  /** Static keys instead of a URL, for air-gapped runs and tests. */
  OIDC_JWKS_JSON?: string;
  /** AWS load balancer OIDC (AUTH_MODE=alb-oidc): the signer ARN and region pin the keys. */
  ALB_ARN?: string;
  AWS_REGION?: string;
  /** Comma-separated emails allowed in; empty means any authenticated user. */
  ALLOWED_EMAILS?: string;
};

export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
  }
}

type Claims = Record<string, unknown> & { sub?: string; email?: string };

function toPrincipal(claims: Claims, env: AuthBindings): Principal {
  const allowed = (env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(String(claims.email ?? "").toLowerCase()))
    throw new AuthError("FORBIDDEN", "This identity is not on the allowed list.");
  const parsed = PrincipalSchema.safeParse({
    subject: claims.sub,
    email: claims.email,
    role: claims.role ?? "evaluator",
    tenantId: claims.tenant_id ?? INSTANCE_PROFILE.instance.id,
  });
  if (!parsed.success || !DEFAULTS.roles.includes(parsed.data.role))
    throw new AuthError("FORBIDDEN", "The identity is not allowed in this workspace.");
  return parsed.data;
}

const albKeys = new Map<string, CryptoKey>();

/** The load balancer signs `x-amzn-oidc-data` with ES256; its public keys are PEMs keyed by `kid`. */
async function verifyAlbToken(token: string, env: AuthBindings, fetchImpl: typeof fetch) {
  const header = decodeProtectedHeader(token);
  if (header.alg !== "ES256" || !header.kid)
    throw new AuthError("UNAUTHENTICATED", "The load balancer token is not valid.");
  if (!env.AWS_REGION) throw new AuthError("FORBIDDEN", "AWS_REGION is not configured.");
  if (env.ALB_ARN && header.signer !== env.ALB_ARN)
    throw new AuthError("FORBIDDEN", "The token was not signed by this load balancer.");
  let key = albKeys.get(header.kid);
  if (!key) {
    const response = await fetchImpl(
      `https://public-keys.auth.elb.${env.AWS_REGION}.amazonaws.com/${encodeURIComponent(header.kid)}`,
    );
    if (!response.ok) throw new AuthError("UNAUTHENTICATED", "The signing key was not found.");
    key = await importSPKI(await response.text(), "ES256");
    albKeys.set(header.kid, key);
  }
  return (await jwtVerify(token, key, env.OIDC_ISSUER ? { issuer: env.OIDC_ISSUER } : {}))
    .payload as Claims;
}

export async function resolvePrincipal(
  request: Request,
  env: AuthBindings,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<Principal> {
  if (env.AUTH_MODE === "development" && env.ENVIRONMENT === "local")
    return {
      subject: "local-evaluator",
      email: "evaluator@workbench.example",
      role: "evaluator",
      tenantId: INSTANCE_PROFILE.instance.id,
    };

  if (env.AUTH_MODE === "alb-oidc") {
    const token = request.headers.get("x-amzn-oidc-data");
    if (!token) throw new AuthError("UNAUTHENTICATED", "Sign in through the load balancer.");
    return toPrincipal(await verifyAlbToken(token, env, deps.fetchImpl ?? fetch), env);
  }

  if (env.AUTH_MODE === "oidc") {
    const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!bearer) throw new AuthError("UNAUTHENTICATED", "A bearer token is required.");
    if (!env.OIDC_ISSUER || !env.OIDC_AUDIENCE)
      throw new AuthError("FORBIDDEN", "The OIDC verifier is not configured.");
    const keys = env.OIDC_JWKS_JSON
      ? createLocalJWKSet(JSON.parse(env.OIDC_JWKS_JSON))
      : createRemoteJWKSet(
          new URL(
            env.OIDC_JWKS_URL ?? `${env.OIDC_ISSUER.replace(/\/$/, "")}/.well-known/jwks.json`,
          ),
        );
    const result = await jwtVerify(bearer, keys, {
      issuer: env.OIDC_ISSUER,
      audience: env.OIDC_AUDIENCE,
    });
    return toPrincipal(result.payload as Claims, env);
  }

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
  return toPrincipal(result.payload as Claims, env);
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
