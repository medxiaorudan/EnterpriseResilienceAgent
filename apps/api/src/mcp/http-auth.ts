import type { AuthInfo } from "@modelcontextprotocol/server";
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface HttpOidcOptions {
  issuer: string;
  audience: string;
  jwksJson?: string;
  jwksUrl?: string;
  userIdClaim?: string;
  userNameClaim?: string;
  roleClaim?: string;
  roleMapJson?: string;
  defaultRole?: string;
}

export interface HttpAuthOptions {
  expectedToken?: string;
  allowUnauthenticated?: boolean;
  oidc?: HttpOidcOptions;
}

export interface HttpAuthResult {
  ok: true;
  authInfo?: AuthInfo;
  identity?: {
    userId: string;
    role: string;
    source: "unauthenticated" | "bearer" | "oidc";
  };
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

  return jwtVerify(token, jwks, {
    issuer: oidc.issuer,
    audience: oidc.audience
  });
}

function readStringClaim(payload: JWTPayload, claimName: string) {
  const value = payload[claimName];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringListClaim(payload: JWTPayload, claimName: string) {
  const value = payload[claimName];

  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  return [];
}

function parseRoleMap(roleMapJson: string | undefined) {
  if (!roleMapJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(roleMapJson) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
      )
    );
  } catch {
    throw new Error("ERA_MCP_OIDC_ROLE_MAP_JSON must be valid JSON.");
  }
}

function buildScopes(payload: JWTPayload) {
  const scopeClaims = new Set<string>();

  for (const scope of readStringListClaim(payload, "scope")) {
    scopeClaims.add(scope);
  }

  for (const scope of readStringListClaim(payload, "scp")) {
    scopeClaims.add(scope);
  }

  return [...scopeClaims];
}

function resolveOidcIdentity(payload: JWTPayload, oidc: HttpOidcOptions) {
  const roleMap = parseRoleMap(oidc.roleMapJson);
  const roleClaim = oidc.roleClaim ?? "roles";
  const configuredUserIdClaim = oidc.userIdClaim ?? "sub";
  const configuredUserNameClaim = oidc.userNameClaim ?? "preferred_username";
  const resolvedUserId =
    readStringClaim(payload, configuredUserNameClaim) ??
    readStringClaim(payload, configuredUserIdClaim) ??
    readStringClaim(payload, "email") ??
    "oidc.user";

  const requestedRoles = readStringListClaim(payload, roleClaim);
  const mappedRole =
    requestedRoles.map((value) => roleMap[value] ?? value).find((value) => typeof value === "string" && value.length > 0) ??
    oidc.defaultRole ??
    "viewer";

  return {
    userId: resolvedUserId,
    role: mappedRole,
    scopes: buildScopes(payload),
    clientId:
      readStringClaim(payload, "azp") ??
      readStringClaim(payload, "client_id") ??
      resolvedUserId
  };
}

export async function validateMcpHttpAuth(
  authorizationHeader: string | undefined,
  options: HttpAuthOptions
): Promise<HttpAuthResult | HttpAuthFailure> {
  if (options.allowUnauthenticated) {
    return {
      ok: true,
      identity: {
        userId: "anonymous",
        role: "viewer",
        source: "unauthenticated"
      }
    };
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
      const verification = await verifyOidcToken(token, options.oidc);
      const identity = resolveOidcIdentity(verification.payload, options.oidc);

      return {
        ok: true,
        identity: {
          userId: identity.userId,
          role: identity.role,
          source: "oidc"
        },
        authInfo: {
          token,
          clientId: identity.clientId,
          scopes: identity.scopes,
          expiresAt: verification.payload.exp,
          extra: {
            eraUserId: identity.userId,
            eraRole: identity.role,
            eraSource: "oidc",
            claims: verification.payload
          }
        }
      };
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
