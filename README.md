# Enterprise Resilience Agent

A multicloud resilience platform that helps enterprise systems detect failures, explain impact, propose safe remediation, and recover through audited, policy-controlled runbooks.
<img width="1693" height="929" alt="call_p64zxYJxIxlYuvFKdrM6HGVA" src="https://github.com/user-attachments/assets/c1dd3aec-a5bf-4640-93fb-37ed1cfe2341" />

## Workspace

```text
apps/
  api/      NestJS API with Postgres persistence, seeded incident data, and SSE
  web/      React + Vite frontend for overview, incidents, approvals, runbooks, and audit
packages/
  contracts/ Shared TypeScript contracts and seeded demo data
  ui/        Reusable React UI primitives
runbooks/    Sample AWS and GCP registered runbooks
policies/    Sample OPA policies for approval, cost, security, blast radius, and cloud scope
docs/        User-facing documentation
```

## First Slice

This repository now contains the first runnable product slice from the engineering plan:

- Shared incident, service, runbook, approval, execution, audit, and SSE event contracts
- A NestJS API structure aligned with the planned module boundaries
- A React dashboard with incident list/detail flows and live event streaming
- Seed data for an AWS checkout service with a GCP dependency
- Registered AWS and GCP runbook examples and policy stubs
- Postgres-backed persistence for incidents, services, approvals, runbooks, and audit events
- Redis-backed idempotency caching and approval/execution locking
- MLOps capability profile with explicit PyTorch and TensorFlow support
- LLMOps capability profile for model providers, prompt/eval governance, and agent safety controls
- AWS execution contract with allowed-target mapping, scale bounds, rollback requirement, and feature-flagged live ECS mode

## Intended Commands

After installing dependencies:

```bash
docker compose up -d postgres
docker compose up -d redis
npm install
npm run dev:api
npm run dev:web
```

The API reads Postgres and Redis connection settings from `.env`/environment variables. A starter configuration is in [.env.example](/Users/rudan/Documents/hobby_projects/EnterpriseResilienceAgent/.env.example).

## AWS Execution Contract

Real ECS execution is disabled by default. To enable it, set:

```bash
AWS_ECS_LIVE_EXECUTION=true
AWS_EXECUTION_ROLE_ARN=...
AWS_ECS_ALLOWED_TARGETS='[{"serviceId":"checkout-api","clusterArn":"...","ecsServiceName":"checkout-api","region":"eu-west-1","minDesiredCount":2,"maxDesiredCount":8,"scaleStep":2,"rollbackRunbookId":"aws-ecs-restore-service-count","environments":["production"]}]'
```

Guardrails enforced before execution:

- service must appear in `AWS_ECS_ALLOWED_TARGETS`
- environment must be explicitly allowed
- runbook must be `aws-ecs-scale-service`
- rollback runbook must be present
- scale bounds must be valid

If `AWS_ECS_LIVE_EXECUTION` is `false`, the adapter stays in deterministic simulation mode.

## Tool Fit By Layer

| Layer | Best-fit tools | Role |
|---|---|---|
| Telemetry | OpenTelemetry | Emits traces, metrics, and logs from services, agents, APIs, and workers |
| Monitoring | Prometheus + Grafana | Alerting, dashboards, anomaly views, and operational visibility |
| LLM / Agent Observability | LangSmith or Langfuse | Prompt experiments, traces, evals, scoring, cost/latency, and agent debugging |
| Resilience Control Plane | Enterprise Resilience Agent | Incident reasoning, approval, runbooks, execution control, verification, rollback, escalation |

## MLOps And LLMOps Positioning

- **MLOps** in this project covers traditional model lifecycle concerns such as PyTorch/TensorFlow support, model registry, evaluation, rollout strategy, and rollback.
- **LLMOps** in this project covers prompt/version governance, provider routing, tool-call tracing, LLM evaluation, safety controls, and production agent observability.
- Prometheus, Grafana, OpenTelemetry, LangSmith, and Langfuse are complementary systems around this platform, not substitutes for the resilience control plane itself.

## LLMOps API

The API now exposes LLMOps capability metadata:

- `GET /api/llmops/profile`
- `GET /api/llmops/providers`
- `GET /api/llmops/tool-layer-fit`
