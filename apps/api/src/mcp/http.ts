import { createServer, type IncomingMessage } from "node:http";
import { Buffer } from "node:buffer";
import { oauthMetadataResponse, type AuthMetadataOptions } from "@modelcontextprotocol/server";
import { validateMcpHttpAuth } from "./http-auth.js";
import { mcpHttpHandler } from "./server.js";

const port = Number(process.env.ERA_MCP_HTTP_PORT ?? 3101);
const host = process.env.ERA_MCP_HTTP_HOST ?? "0.0.0.0";
const basePath = process.env.ERA_MCP_HTTP_PATH ?? "/mcp";
const allowUnauthenticated = process.env.ERA_MCP_HTTP_ALLOW_UNAUTHENTICATED === "true";
const bearerToken = process.env.ERA_MCP_HTTP_BEARER_TOKEN;
const oidcIssuer = process.env.ERA_MCP_OIDC_ISSUER;
const oidcAudience = process.env.ERA_MCP_OIDC_AUDIENCE;
const oidcJwksUrl = process.env.ERA_MCP_OIDC_JWKS_URL;
const oidcJwksJson = process.env.ERA_MCP_OIDC_JWKS_JSON;
const mcpPublicUrl = process.env.ERA_MCP_PUBLIC_URL;
const oidcAuthorizationEndpoint = process.env.ERA_MCP_OIDC_AUTHORIZATION_ENDPOINT;
const oidcTokenEndpoint = process.env.ERA_MCP_OIDC_TOKEN_ENDPOINT;
const oidcRegistrationEndpoint = process.env.ERA_MCP_OIDC_REGISTRATION_ENDPOINT;
const oidcScopes = process.env.ERA_MCP_OIDC_SCOPES_SUPPORTED?.split(",").map((item) => item.trim()).filter(Boolean);
const allowInsecureIssuer = process.env.ERA_MCP_OIDC_ALLOW_INSECURE_ISSUER_URL === "true";

async function toRequest(req: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  const originHost = req.headers.host ?? `${host}:${port}`;
  const url = new URL(req.url ?? "/", `http://${originHost}`);
  const headers: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.push([key, item]);
      }
      continue;
    }

    headers.push([key, value]);
  }

  return new Request(url, {
    method: req.method,
    headers: new Headers(headers),
    body: body && !["GET", "HEAD"].includes(req.method ?? "GET") ? body : undefined,
    ...(body && !["GET", "HEAD"].includes(req.method ?? "GET")
      ? ({ duplex: "half" } as RequestInit & { duplex: "half" })
      : {})
  });
}

createServer(async (req, res) => {
  try {
    const request = await toRequest(req);
    const pathname = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`).pathname;

    if (pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "streamable-http", path: basePath }));
      return;
    }

    const metadataOptions = buildMetadataOptions();
    if (metadataOptions) {
      const metadataResponse = oauthMetadataResponse(request, metadataOptions);
      if (metadataResponse) {
        res.writeHead(metadataResponse.status, Object.fromEntries(metadataResponse.headers.entries()));
        const bodyBuffer = Buffer.from(await metadataResponse.arrayBuffer());
        res.end(bodyBuffer);
        return;
      }
    }

    if (!pathname.startsWith(basePath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: `Not found. Use ${basePath} for MCP traffic.` }));
      return;
    }

    const authResult = await validateMcpHttpAuth(req.headers.authorization, {
      expectedToken: bearerToken,
      allowUnauthenticated,
      oidc:
        oidcIssuer && oidcAudience
          ? {
              issuer: oidcIssuer,
              audience: oidcAudience,
              jwksUrl: oidcJwksUrl,
              jwksJson: oidcJwksJson
            }
          : undefined
    });
    if (!authResult.ok) {
      res.writeHead(authResult.statusCode, {
        "Content-Type": "application/json",
        ...authResult.headers
      });
      res.end(JSON.stringify(authResult.body));
      return;
    }

    const response = await mcpHttpHandler.fetch(request);

    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (!response.body) {
      res.end();
      return;
    }

    const bodyBuffer = Buffer.from(await response.arrayBuffer());
    res.end(bodyBuffer);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        message: error instanceof Error ? error.message : "Unknown MCP HTTP server error."
      })
    );
  }
}).listen(port, host, () => {
  console.log(
    `Enterprise Resilience Agent MCP HTTP listening on http://${host}:${port}${basePath} (${allowUnauthenticated ? "unauthenticated" : oidcIssuer ? "oidc-protected" : "bearer-protected"})`
  );
});

function buildMetadataOptions(): AuthMetadataOptions | undefined {
  if (
    !mcpPublicUrl ||
    !oidcIssuer ||
    !oidcAuthorizationEndpoint ||
    !oidcTokenEndpoint ||
    !oidcJwksUrl
  ) {
    return undefined;
  }

  return {
    resourceServerUrl: new URL(mcpPublicUrl),
    oauthMetadata: {
      issuer: oidcIssuer,
      authorization_endpoint: oidcAuthorizationEndpoint,
      token_endpoint: oidcTokenEndpoint,
      jwks_uri: oidcJwksUrl,
      registration_endpoint: oidcRegistrationEndpoint
    } as never,
    scopesSupported: oidcScopes,
    resourceName: "Enterprise Resilience Agent MCP",
    serviceDocumentationUrl: new URL(mcpPublicUrl),
    dangerouslyAllowInsecureIssuerUrl: allowInsecureIssuer
  };
}
