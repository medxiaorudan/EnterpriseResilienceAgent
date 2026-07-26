export interface HttpAuthOptions {
  expectedToken?: string;
  allowUnauthenticated?: boolean;
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

export function validateMcpHttpAuth(
  authorizationHeader: string | undefined,
  options: HttpAuthOptions
): HttpAuthResult | HttpAuthFailure {
  if (options.allowUnauthenticated) {
    return { ok: true };
  }

  if (!options.expectedToken) {
    return {
      ok: false,
      statusCode: 503,
      body: {
        message:
          "ERA_MCP_HTTP_BEARER_TOKEN is not configured. Set it or explicitly allow unauthenticated HTTP MCP access."
      },
      headers: {}
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

  const expectedValue = `Bearer ${options.expectedToken}`;
  if (authorizationHeader !== expectedValue) {
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
