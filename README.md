# Enterprise Resilience Agent

Enterprise Resilience Agent helps teams understand service problems, choose the safest recovery action, get the right approval, and keep a clear record of what happened.

It is designed to be easy to explain to non-technical users:

- something is going wrong
- the system explains the impact in plain language
- it recommends the safest next step
- a person approves or escalates
- the platform records the result

![System overview](https://github.com/user-attachments/assets/c1dd3aec-a5bf-4640-93fb-37ed1cfe2341)

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

### User access modes not yet packaged in this repo

- Downloadable desktop tool

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

This is included in the repository as a stdio MCP server.

Typical usage:

1. Start the API.
2. Run the MCP server with `npm run start:mcp`.
3. Point your MCP host to the example config in [.vscode/mcp.json.example](/Users/rudan/Documents/hobby_projects/EnterpriseResilienceAgent/.vscode/mcp.json.example).

The MCP server exposes incident, approval, runbook, audit, service, session, and platform-status tools.

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
