import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { validateMcpHttpAuth } from "../dist/mcp/http-auth.js";

describe("mcp http auth", () => {
  test("rejects requests when token config is missing", () => {
    const result = validateMcpHttpAuth(undefined, {
      expectedToken: undefined,
      allowUnauthenticated: false
    });

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 503);
    assert.match(result.body.message, /not configured/i);
  });

  test("rejects requests without authorization header", () => {
    const result = validateMcpHttpAuth(undefined, {
      expectedToken: "secret-token",
      allowUnauthenticated: false
    });

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.body.message, /missing authorization/i);
  });

  test("rejects requests with wrong bearer token", () => {
    const result = validateMcpHttpAuth("Bearer wrong-token", {
      expectedToken: "secret-token",
      allowUnauthenticated: false
    });

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 401);
    assert.match(result.body.message, /invalid bearer token/i);
  });

  test("accepts requests with correct bearer token", () => {
    const result = validateMcpHttpAuth("Bearer secret-token", {
      expectedToken: "secret-token",
      allowUnauthenticated: false
    });

    assert.deepEqual(result, { ok: true });
  });

  test("accepts requests when unauthenticated mode is explicitly allowed", () => {
    const result = validateMcpHttpAuth(undefined, {
      expectedToken: undefined,
      allowUnauthenticated: true
    });

    assert.deepEqual(result, { ok: true });
  });
});
