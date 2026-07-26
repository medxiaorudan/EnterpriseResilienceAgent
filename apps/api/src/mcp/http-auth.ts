import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from "jose";

export interface HttpOidcOptions {
  issuer: string;
  audience: string;
  jwksJson?: string;
  jwksUrl?: string;
}

export interface HttpAuthOptions {
  expectedToken?: string;
  allowUnauthenticated?: boolean;
  oidc?: HttpOidcOptions;
}

export interface HttpAuthResult {
  ok: true;
}

export interface HttpAuthFailure {
  ok: false;
  statusCode: number;
  body: {
    message: string;
  };
  headers: Record<string, string>;
}

function extractBearerToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader) {
    return undefined;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return undefined;
  }

  return token;
}

async function verifyOidcToken(token: string, oidc: HttpOidcOptions) {
  const jwks = oidc.jwksJson
    ? createLocalJWKSet(JSON.parse(oidc.jwksJson))
    : oidc.jwksUrl
      ? createRemoteJWKSet(new URL(oidc.jwksUrl))
      : undefined;

  if (!jwks) {
    throw new Error("OIDC validation requires ERA_MCP_OIDC_JWKS_URL or ERA_MCP_OIDC_JWKS_JSON.");
  }

  await jwtVerify(token, jwks, {
    issuer: oidc.issuer,
    audience: oidc.audience
  });
}

export async function validateMcpHttpAuth(
  authorizationHeader: string | undefined,
  options: HttpAuthOptions
): Promise<HttpAuthResult | HttpAuthFailure> {
  if (options.allowUnauthenticated) {
    return { ok: true };
  }

  if (!authorizationHeader) {
    return {
      ok: false,
      statusCode: 401,
      body: {
        message: "Missing Authorization header."
      },
      headers: {
        "WWW-Authenticate": 'Bearer realm="enterprise-resilience-agent-mcp"'
      }
    };
  }

  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return {
      ok: false,
      statusCode: 401,
      body: {
        message: "Invalid Authorization header format."
      },
      headers: {
        "WWW-Authenticate": 'Bearer realm="enterprise-resilience-agent-mcp", error="invalid_token"'
      }
    };
  }

  if (options.oidc) {
    try {
      await verifyOidcToken(token, options.oidc);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        statusCode: 401,
        body: {
          message: error instanceof Error ? `Invalid OIDC token: ${error.message}` : "Invalid OIDC token."
        },
        headers: {
          "WWW-Authenticate": 'Bearer realm="enterprise-resilience-agent-mcp", error="invalid_token"'
        }
      };
    }
  }

  if (!options.expectedToken) {
    return {
      ok: false,
      statusCode: 503,
      body: {
        message:
          "Configure OIDC or set ERA_MCP_HTTP_BEARER_TOKEN. The HTTP MCP endpoint will not run open by default."
      },
      headers: {}
    };
  }

  const expectedValue = options.expectedToken;
  if (token !== expectedValue) {
    return {
      ok: false,
      statusCode: 401,
      body: {
        message: "Invalid bearer token."
      },
      headers: {
        "WWW-Authenticate": 'Bearer realm="enterprise-resilience-agent-mcp", error="invalid_token"'
      }
    };
  }

  return { ok: true };
}
