import { Injectable } from "@nestjs/common";
import type { PlatformStatusSummary } from "@enterprise-resilience/contracts";
import { AwsConfigService } from "../cloud-adapters/aws-config.service.js";

@Injectable()
export class PlatformService {
  constructor(private readonly awsConfig: AwsConfigService) {}

  getStatus(): PlatformStatusSummary {
    const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:5173";
    const apiBaseUrl = process.env.API_PUBLIC_URL ?? "http://localhost:3000/api";
    const databaseUrl = process.env.DATABASE_URL;
    const redisUrl = process.env.REDIS_URL;
    const awsLiveExecution = this.awsConfig.isLiveExecutionEnabled();
    const deploymentMode = process.env.DEPLOYMENT_MODE ?? "cloud-ready";

    return {
      productName: "Enterprise Resilience Agent",
      deploymentMode: deploymentMode === "local" || deploymentMode === "container" ? deploymentMode : "cloud-ready",
      environmentName: process.env.APP_ENVIRONMENT ?? "demo",
      apiBasePath: "/api",
      generatedAt: new Date().toISOString(),
      components: [
        {
          name: "Operations dashboard",
          kind: "ui",
          status: "ready",
          summary: "Primary screen for business users, service owners, and approvers.",
          url: `${appBaseUrl}/overview`
        },
        {
          name: "Resilience API",
          kind: "api",
          status: "ready",
          summary: "Backend API for incidents, runbooks, approvals, MLOps, and LLMOps.",
          url: apiBaseUrl
        },
        {
          name: "Postgres persistence",
          kind: "database",
          status: databaseUrl ? "ready" : "configuration-needed",
          summary: databaseUrl
            ? "Configured for incidents, approvals, runbooks, and audit history."
            : "Set DATABASE_URL to persist incidents and audit history."
        },
        {
          name: "Redis guardrails",
          kind: "cache",
          status: redisUrl ? "ready" : "configuration-needed",
          summary: redisUrl
            ? "Configured for idempotency control and approval execution locks."
            : "Set REDIS_URL to enable idempotency control and execution locking."
        },
        {
          name: "AWS execution adapter",
          kind: "cloud-adapter",
          status: awsLiveExecution ? "ready" : "disabled",
          summary: awsLiveExecution
            ? "Live ECS dry-run and bounded execution are enabled for approved targets."
            : "Running in safe simulation mode until AWS_ECS_LIVE_EXECUTION=true."
        },
        {
          name: "User guide",
          kind: "documentation",
          status: "ready",
          summary: "Business-friendly handbook for approval, recovery, MLOps, and LLMOps.",
          url: "docs/user-guide.md"
        }
      ],
      accessLinks: [
        {
          label: "Executive overview",
          audience: "business",
          path: "/overview",
          summary: "Use this to understand customer impact, active incidents, and approvals."
        },
        {
          label: "Approval queue",
          audience: "business",
          path: "/approvals",
          summary: "Use this to approve, reject, or escalate the safest proposed action."
        },
        {
          label: "Incident and audit trail",
          audience: "audit",
          path: "/audit",
          summary: "Use this to review who approved what, when it ran, and the outcome."
        },
        {
          label: "API entry point",
          audience: "engineering",
          path: "/api",
          summary: "Use this for integrations, platform automation, and deployment checks."
        }
      ],
      nextSteps: [
        "Set APP_BASE_URL and API_PUBLIC_URL for the real environment.",
        "Configure DATABASE_URL and REDIS_URL before production use.",
        "Keep AWS live execution off until allowed targets and execution role are verified."
      ]
    };
  }
}
