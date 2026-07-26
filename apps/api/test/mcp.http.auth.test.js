import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { validateMcpHttpAuth } from "../dist/mcp/http-auth.js";

describe("mcp http auth", () => {
  test("rejects requests when token config is missing", async () => {
    const result = await validateMcpHttpAuth("Bearer anything", {
      expectedToken: undefined,
      allowUnauthenticated: false
    });

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 503);
    assert.match(result.body.message, /configure oidc|bearer token/i);
  });

  test("rejects requests without authorization header", async () => {
    const result = await validateMcpHttpAuth(undefined, {
      expectedToken: "secret-token",
      allowUnauthenticated: false
    });

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.body.message, /missing authorization/i);
  });

  test("rejects requests with wrong bearer token", async () => {
    const result = await validateMcpHttpAuth("Bearer wrong-token", {
      expectedToken: "secret-token",
      allowUnauthenticated: false
    });

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.body.message, /invalid bearer token/i);
  });

  test("accepts requests with correct bearer token", async () => {
    const result = await validateMcpHttpAuth("Bearer secret-token", {
      expectedToken: "secret-token",
      allowUnauthenticated: false
    });

    assert.equal(result.ok, true);
    assert.equal(result.authInfo, undefined);
    assert.equal(result.identity, undefined);
  });

  test("accepts requests when unauthenticated mode is explicitly allowed", async () => {
    const result = await validateMcpHttpAuth(undefined, {
      expectedToken: undefined,
      allowUnauthenticated: true
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.identity, {
      userId: "anonymous",
      role: "viewer",
      source: "unauthenticated"
    });
  });

  test("accepts valid OIDC JWT with matching issuer and audience", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-key";

    const token = await new SignJWT({
      sub: "mcp-client",
      preferred_username: "ops.manager",
      roles: ["incident_manager"],
      scope: "mcp.read mcp.write"
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://issuer.example.com")
      .setAudience("enterprise-resilience-mcp")
      .setExpirationTime("2h")
      .setIssuedAt()
      .sign(privateKey);

    const result = await validateMcpHttpAuth(`Bearer ${token}`, {
      allowUnauthenticated: false,
      oidc: {
        issuer: "https://issuer.example.com",
        audience: "enterprise-resilience-mcp",
        jwksJson: JSON.stringify({ keys: [jwk] }),
        roleMapJson: JSON.stringify({
          incident_manager: "incident-manager"
        }),
        defaultRole: "viewer"
      }
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.identity, {
      userId: "ops.manager",
      role: "incident-manager",
      source: "oidc"
    });
    assert.equal(result.authInfo.clientId, "ops.manager");
    assert.deepEqual(result.authInfo.scopes, ["mcp.read", "mcp.write"]);
    assert.equal(result.authInfo.extra.eraUserId, "ops.manager");
    assert.equal(result.authInfo.extra.eraRole, "incident-manager");
  });

  test("rejects OIDC JWT with wrong audience", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-key";

    const token = await new SignJWT({ sub: "mcp-client" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://issuer.example.com")
      .setAudience("wrong-audience")
      .setExpirationTime("2h")
      .setIssuedAt()
      .sign(privateKey);

    const result = await validateMcpHttpAuth(`Bearer ${token}`, {
      allowUnauthenticated: false,
      oidc: {
        issuer: "https://issuer.example.com",
        audience: "enterprise-resilience-mcp",
        jwksJson: JSON.stringify({ keys: [jwk] })
      }
    });

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.body.message, /invalid oidc token/i);
  });
});
