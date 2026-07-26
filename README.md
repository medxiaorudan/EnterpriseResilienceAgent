# Enterprise Resilience Agent

Enterprise Resilience Agent helps teams understand service problems, choose the safest recovery action, get the right approval, and keep a clear record of what happened.

It is designed to be easy to explain to non-technical users:

- something is going wrong
- the system explains the impact in plain language
- it recommends the safest next step
- a person approves or escalates
- the platform records the result

https://github.com/user-attachments/assets/863e7649-18e2-4826-9c6c-35a7f3be2718

## What This Project Does

The project acts as a resilience control center for service incidents.

- It watches business-critical services
- It groups related technical signals into one incident
- It explains customer and business impact
- It proposes approved recovery actions
- It keeps people in control of important changes
- It verifies whether the recovery actually helped
- It stores an audit trail for later review

## Supported Operations

The current product slice supports these operation groups.

### 1. Incident Operations

- Detect and create incidents
- View incident details
- View incident timelines
- Review evidence and likely causes
- See recommended remediation actions

### 2. Approval Operations

- Approve a proposed action
- Reject a proposed action
- Escalate an incident to the next owner
- Keep human approval in the loop for sensitive changes

### 3. Runbook Operations

- View registered runbooks
- Simulate selected runbooks
- Execute approved low-risk runbooks
- Support dry-run validation before live execution

### 4. Recovery Verification Operations

- Check whether the service recovered
- Mark incidents as resolved, unchanged, or escalated
- Record execution and verification results

### 5. Audit Operations

- View audit records
- Review who approved what
- Review execution and verification history

### 6. Platform Operations

- View dashboard health and access entry points
- Check database, Redis, and adapter readiness
- Run in safe simulation mode by default

## Supported Environment Scope

### Cloud support

- Multicloud-ready structure
- Seeded AWS and GCP examples

### Data and control services

- Postgres for persistent records
- Redis for idempotency and execution locking

### User access modes available today

- Web dashboard
- REST API
- MCP server
- Downloadable desktop operator app

## How Non-Technical Users Should Use It

Start with the web dashboard.

### Main pages

- `/overview`
  Best for business users who want the big picture
- `/approvals`
  Best for people who need to approve, reject, or escalate actions
- `/audit`
  Best for review, governance, and history
- `/platform`
  Best for checking whether the system is fully connected and ready

### Normal workflow

1. Open the overview page.
2. Select the incident that needs attention.
3. Read the business impact and recommended action.
4. Approve, reject, or escalate.
5. Review the outcome and audit trail.

For a full business-facing guide, read [docs/user-guide.md](/Users/rudan/Documents/hobby_projects/EnterpriseResilienceAgent/docs/user-guide.md).

## How To Configure And Use The Agent

### Option 1. Use the dashboard

This is the easiest and recommended way for most users.

1. Deploy the project.
2. Open the dashboard in a browser.
3. Use the pages listed above.

### Option 2. Use the API

This is best for engineering teams and internal integrations.

Common API entry points:

- `GET /api/platform/status`
- `GET /api/incidents`
- `GET /api/runbooks`
- `GET /api/audit/events`

### Option 3. Use through an MCP server

This is included in the repository as:

- a stdio MCP server
- a streamable HTTP MCP server for remote clients

Typical usage:

1. Start the API.
2. Run the MCP server with `npm run start:mcp`.
3. Point your MCP host to the example config in [.vscode/mcp.json.example](/Users/rudan/Documents/hobby_projects/EnterpriseResilienceAgent/.vscode/mcp.json.example).

The MCP server exposes incident, approval, runbook, audit, service, session, and platform-status tools.

### Option 4. Use the downloadable operator app

This is included as an Electron desktop shell for the web dashboard.

Typical usage:

1. Start the API and web app, or deploy the dashboard remotely.
2. Run `npm run start:operator` for a local desktop session.
3. Enter the dashboard URL in the connection window.
4. The operator app opens the dashboard in a dedicated desktop window.

## Quick Configuration

The project needs these main settings:

- `DATABASE_URL`
- `REDIS_URL`
- `APP_BASE_URL`
- `API_PUBLIC_URL`
- `AWS_ECS_LIVE_EXECUTION`

Starter values are available in [.env.example](/Users/rudan/Documents/hobby_projects/EnterpriseResilienceAgent/.env.example).

Important:

- Keep `AWS_ECS_LIVE_EXECUTION=false` until you are ready for bounded live actions
- Use Postgres and Redis before production use
- Set public URLs correctly so the dashboard and API links work as expected
- For remote MCP with OIDC, map token claims to agent roles with `ERA_MCP_OIDC_ROLE_CLAIM`, `ERA_MCP_OIDC_ROLE_MAP_JSON`, and `ERA_MCP_OIDC_DEFAULT_ROLE`
- For packaged desktop auto-updates, set `ERA_OPERATOR_UPDATE_URL` at build time; `ERA_OPERATOR_AUTO_UPDATE_URL` is an optional runtime override

## How To Run It

### Local development

```bash
docker compose up -d postgres
docker compose up -d redis
npm install
npm run dev:api
npm run dev:web
```

### Production-style container run

```bash
docker compose -f docker-compose.prod.yml --env-file .env up --build -d
```

After that, open:

- `http://localhost:8080/overview`
- `http://localhost:8080/platform`

## Deployment Guides

- Ubuntu server deployment: [DEPLOYMENT_UBUNTU.md](/Users/rudan/Documents/hobby_projects/EnterpriseResilienceAgent/DEPLOYMENT_UBUNTU.md)

## MCP Quick Start

1. Start the API with `npm run dev:api`
2. Start the MCP server with `npm run start:mcp`
3. Configure your MCP host using [.vscode/mcp.json.example](/Users/rudan/Documents/hobby_projects/EnterpriseResilienceAgent/.vscode/mcp.json.example)
4. Use the MCP tools:
   `get_platform_status`, `list_incidents`, `get_incident`, `approve_incident`, `reject_incident`, `escalate_incident`, `list_runbooks`, `simulate_runbook`, `list_audit_events`, `list_services`

For remote MCP clients:

1. Start the API with `npm run dev:api`
2. Start the HTTP MCP server with `npm run start:mcp:http`
3. Prefer OIDC by setting `ERA_MCP_OIDC_ISSUER`, `ERA_MCP_OIDC_AUDIENCE`, and `ERA_MCP_OIDC_JWKS_URL`
4. Map your identity provider claims to platform roles with `ERA_MCP_OIDC_USER_NAME_CLAIM`, `ERA_MCP_OIDC_ROLE_CLAIM`, and `ERA_MCP_OIDC_ROLE_MAP_JSON`
5. Set `ERA_MCP_OIDC_DEFAULT_ROLE=viewer` or another safe fallback role
6. Or set `ERA_MCP_HTTP_BEARER_TOKEN` as a simpler fallback
7. Point the client at `http://YOUR_HOST:3101/mcp`
8. Send `Authorization: Bearer YOUR_TOKEN`
9. Check health at `http://YOUR_HOST:3101/healthz`

The HTTP MCP server can also expose OAuth discovery metadata when these are configured:

- `ERA_MCP_PUBLIC_URL`
- `ERA_MCP_OIDC_AUTHORIZATION_ENDPOINT`
- `ERA_MCP_OIDC_TOKEN_ENDPOINT`

That enables:

- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource/...`

## Operator App Quick Start

1. Start the dashboard locally with `npm run dev:web` or deploy it remotely
2. Run `npm run start:operator`
3. Enter a dashboard URL such as `http://127.0.0.1:5173/overview` or `https://ops.example.com/overview`
4. To build downloadable packages, run `npm run build:operator`
5. To publish update-ready packages, set `ERA_OPERATOR_UPDATE_URL=https://downloads.example.com/operator` and run `npm run publish:operator`
6. Signed macOS and Windows builds use the normal Electron Builder signing credentials you provide in the build environment

## Project Structure

```text
apps/
  api/      Backend API
  web/      Browser dashboard
packages/
  contracts/ Shared data contracts and seeded demo data
  ui/        Reusable UI components
runbooks/    Registered recovery procedures
policies/    Policy stubs for approval, cost, security, and scope
docs/
  user-guide.md
```
