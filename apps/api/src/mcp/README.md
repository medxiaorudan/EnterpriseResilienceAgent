# MCP Server

This directory contains a stdio MCP server that wraps the Enterprise Resilience Agent REST API.

It is intended for MCP hosts such as VS Code, Claude Code, or any client that can launch a stdio MCP server.

It also includes a streamable HTTP entrypoint for remote MCP clients.

## Required environment

- `ERA_API_URL`
  Example: `http://127.0.0.1:3000/api`
- `ERA_MCP_USER_ID`
  Example: `manager.demo`
- `ERA_MCP_ROLE`
  Example: `incident-manager`
- `ERA_MCP_HTTP_PORT`
  Example: `3101`
- `ERA_MCP_HTTP_HOST`
  Example: `0.0.0.0`
- `ERA_MCP_HTTP_PATH`
  Example: `/mcp`
- `ERA_MCP_HTTP_BEARER_TOKEN`
  Example: `change-this-long-random-token`

Optional:

- `ERA_MCP_HTTP_ALLOW_UNAUTHENTICATED`
  Example: `false`

If not set, the server defaults to:

- `ERA_API_URL=http://127.0.0.1:3000/api`
- `ERA_MCP_USER_ID=manager.demo`
- `ERA_MCP_ROLE=incident-manager`
- `ERA_MCP_HTTP_PORT=3101`
- `ERA_MCP_HTTP_HOST=0.0.0.0`
- `ERA_MCP_HTTP_PATH=/mcp`

For remote HTTP MCP clients, bearer auth is expected by default.

Example request header:

```text
Authorization: Bearer change-this-long-random-token
```

Only set `ERA_MCP_HTTP_ALLOW_UNAUTHENTICATED=true` for local testing on a trusted machine.
