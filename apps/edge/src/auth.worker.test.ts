import { exportJWK, exportSPKI, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { type AuthError, resolvePrincipal } from "./auth";

const ISSUER = "https://idp.example.test";
const AUDIENCE = "workbench";
const request = (headers: Record<string, string> = {}) =>
  new Request("https://workbench.example.test/api/session", { headers });
const expectAuthError = async (promise: Promise<unknown>, code: AuthError["code"]) =>
  expect(promise).rejects.toMatchObject({ code });

async function oidcSetup() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  const sign = (claims: Record<string, unknown>, audience = AUDIENCE) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setIssuer(ISSUER)
      .setAudience(audience)
      .setSubject("user-1")
      .setExpirationTime("5m")
      .sign(privateKey);
  const env = {
    AUTH_MODE: "oidc",
    ENVIRONMENT: "production",
    OIDC_ISSUER: ISSUER,
    OIDC_AUDIENCE: AUDIENCE,
    OIDC_JWKS_JSON: JSON.stringify({ keys: [jwk] }),
  };
  return { env, sign };
}

describe("OIDC bearer tokens", () => {
  it("accepts a valid token and builds the principal from its claims", async () => {
    const { env, sign } = await oidcSetup();
    const token = await sign({ email: "presenter@example.test" });
    const principal = await resolvePrincipal(request({ authorization: `Bearer ${token}` }), env);
    expect(principal).toMatchObject({
      subject: "user-1",
      email: "presenter@example.test",
      role: "evaluator",
    });
  });

  it("rejects a missing token, a wrong audience, and an unconfigured verifier", async () => {
    const { env, sign } = await oidcSetup();
    await expectAuthError(resolvePrincipal(request(), env), "UNAUTHENTICATED");
    const wrong = await sign({ email: "a@example.test" }, "someone-else");
    await expect(
      resolvePrincipal(request({ authorization: `Bearer ${wrong}` }), env),
    ).rejects.toThrow();
    await expectAuthError(
      resolvePrincipal(request({ authorization: "Bearer x" }), { ...env, OIDC_ISSUER: undefined }),
      "FORBIDDEN",
    );
  });

  it("limits access to the allowed emails", async () => {
    const { env, sign } = await oidcSetup();
    const token = await sign({ email: "stranger@example.test" });
    await expectAuthError(
      resolvePrincipal(request({ authorization: `Bearer ${token}` }), {
        ...env,
        ALLOWED_EMAILS: "presenter@example.test, other@example.test",
      }),
      "FORBIDDEN",
    );
  });
});

describe("load balancer OIDC", () => {
  async function albSetup() {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const pem = await exportSPKI(publicKey);
    const sign = (signer: string) =>
      new SignJWT({ email: "presenter@example.test" })
        .setProtectedHeader({ alg: "ES256", kid: "alb-key", signer } as never)
        .setIssuer(ISSUER)
        .setSubject("alb-user")
        .setExpirationTime("5m")
        .sign(privateKey);
    const fetchImpl = (async (url: string) =>
      String(url).endsWith("/alb-key")
        ? new Response(pem)
        : new Response("missing", { status: 404 })) as unknown as typeof fetch;
    const env = {
      AUTH_MODE: "alb-oidc",
      ENVIRONMENT: "production",
      AWS_REGION: "us-east-1",
      ALB_ARN: "arn:aws:elasticloadbalancing:us-east-1:111111111111:loadbalancer/app/demo/abc",
      OIDC_ISSUER: ISSUER,
    };
    return { env, sign, fetchImpl };
  }

  it("verifies the load balancer's signature and signer", async () => {
    const { env, sign, fetchImpl } = await albSetup();
    const token = await sign(env.ALB_ARN);
    const principal = await resolvePrincipal(request({ "x-amzn-oidc-data": token }), env, {
      fetchImpl,
    });
    expect(principal).toMatchObject({ subject: "alb-user", email: "presenter@example.test" });
  });

  it("rejects a token signed for a different load balancer, and a missing header", async () => {
    const { env, sign, fetchImpl } = await albSetup();
    const token = await sign(
      "arn:aws:elasticloadbalancing:us-east-1:222222222222:loadbalancer/app/x/y",
    );
    await expectAuthError(
      resolvePrincipal(request({ "x-amzn-oidc-data": token }), env, { fetchImpl }),
      "FORBIDDEN",
    );
    await expectAuthError(resolvePrincipal(request(), env, { fetchImpl }), "UNAUTHENTICATED");
  });
});
