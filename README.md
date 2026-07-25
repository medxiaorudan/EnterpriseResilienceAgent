# Enterprise Resilience Agent

A multicloud resilience platform that helps enterprise systems detect failures, explain impact, propose safe remediation, and recover through audited, policy-controlled runbooks.

## Workspace

```text
apps/
  api/      NestJS API with in-memory MVP incident orchestration and SSE
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

## Intended Commands

After installing dependencies:

```bash
npm install
npm run dev:api
npm run dev:web
```
