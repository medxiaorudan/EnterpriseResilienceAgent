# MCP Server

This directory contains a stdio MCP server that wraps the Enterprise Resilience Agent REST API.

It is intended for MCP hosts such as VS Code, Claude Code, or any client that can launch a stdio MCP server.

## Required environment

- `ERA_API_URL`
  Example: `http://127.0.0.1:3000/api`
- `ERA_MCP_USER_ID`
  Example: `manager.demo`
- `ERA_MCP_ROLE`
  Example: `incident-manager`

If not set, the server defaults to:

- `ERA_API_URL=http://127.0.0.1:3000/api`
- `ERA_MCP_USER_ID=manager.demo`
- `ERA_MCP_ROLE=incident-manager`
