import { createServer, type IncomingMessage } from "node:http";
import { Buffer } from "node:buffer";
import { validateMcpHttpAuth } from "./http-auth.js";
import { mcpHttpHandler } from "./server.js";

const port = Number(process.env.ERA_MCP_HTTP_PORT ?? 3101);
const host = process.env.ERA_MCP_HTTP_HOST ?? "0.0.0.0";
const basePath = process.env.ERA_MCP_HTTP_PATH ?? "/mcp";
const allowUnauthenticated = process.env.ERA_MCP_HTTP_ALLOW_UNAUTHENTICATED === "true";
const bearerToken = process.env.ERA_MCP_HTTP_BEARER_TOKEN;

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
    const pathname = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`).pathname;

    if (pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "streamable-http", path: basePath }));
      return;
    }

    if (!pathname.startsWith(basePath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: `Not found. Use ${basePath} for MCP traffic.` }));
      return;
    }

    const authResult = validateMcpHttpAuth(req.headers.authorization, {
      expectedToken: bearerToken,
      allowUnauthenticated
    });
    if (!authResult.ok) {
      res.writeHead(authResult.statusCode, {
        "Content-Type": "application/json",
        ...authResult.headers
      });
      res.end(JSON.stringify(authResult.body));
      return;
    }

    const response = await mcpHttpHandler.fetch(await toRequest(req));

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
    `Enterprise Resilience Agent MCP HTTP listening on http://${host}:${port}${basePath} (${allowUnauthenticated ? "unauthenticated" : "bearer-protected"})`
  );
});
