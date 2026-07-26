import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import type { AuthSession, IncidentRecord, PlatformStatusSummary } from "@enterprise-resilience/contracts";
import { z } from "zod";

const apiBaseUrl = (process.env.ERA_API_URL ?? "http://127.0.0.1:3000/api").replace(/\/$/, "");
const userId = process.env.ERA_MCP_USER_ID ?? "manager.demo";
const role = process.env.ERA_MCP_ROLE ?? "incident-manager";

type ApiErrorShape = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};

function describeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "x-era-user": userId,
      "x-era-role": role,
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    let detail = `API request failed with status ${response.status}.`;

    try {
      const body = (await response.json()) as ApiErrorShape;
      const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
      detail = message ?? body.error ?? detail;
    } catch {
      // Keep the default message for non-JSON failures.
    }

    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

async function safeTool<T>(work: () => Promise<T>, formatter?: (value: T) => string) {
  try {
    const result = await work();
    return {
      content: [
        {
          type: "text" as const,
          text: formatter ? formatter(result) : describeJson(result)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: error instanceof Error ? error.message : "Unknown MCP tool error."
        }
      ],
      isError: true
    };
  }
}

function formatIncidentList(incidents: IncidentRecord[]) {
  if (incidents.length === 0) {
    return "No incidents found.";
  }

  return incidents
    .map(
      (incident) =>
        `${incident.incidentId} | ${incident.severity} | ${incident.status} | ${incident.title} | ${incident.businessImpact}`
    )
    .join("\n");
}

function formatPlatformStatus(status: PlatformStatusSummary) {
  const components = status.components
    .map((component) => `- ${component.name}: ${component.status} — ${component.summary}`)
    .join("\n");
  const nextSteps = status.nextSteps.map((step) => `- ${step}`).join("\n");

  return [
    `${status.productName} (${status.environmentName})`,
    `Deployment mode: ${status.deploymentMode}`,
    `API path: ${status.apiBasePath}`,
    "",
    "Components:",
    components,
    "",
    "Next steps:",
    nextSteps
  ].join("\n");
}

serveStdio(() => {
  const server = new McpServer(
    { name: "enterprise-resilience-agent", version: "0.1.0" },
    {
      instructions:
        "Use these tools to inspect incidents, approvals, runbooks, audit history, and platform readiness. Read incident details before approving or escalating. Approval tools act as the configured MCP role."
    }
  );

  server.registerTool(
    "get_platform_status",
    {
      title: "Get Platform Status",
      description: "Show deployment readiness, component health, and the best entry points for users.",
      annotations: { readOnlyHint: true }
    },
    async () => safeTool(() => apiRequest<PlatformStatusSummary>("/platform/status"), formatPlatformStatus)
  );

  server.registerTool(
    "get_auth_session",
    {
      title: "Get Auth Session",
      description: "Show which user and role the MCP server is currently using against the API.",
      annotations: { readOnlyHint: true }
    },
    async () =>
      safeTool(() => apiRequest<AuthSession>("/auth/session"), (session) =>
        `${session.displayName} (${session.role}) via ${session.source}`
      )
  );

  server.registerTool(
    "list_demo_users",
    {
      title: "List Demo Users",
      description: "List the demo users and roles available for UI or MCP role configuration.",
      annotations: { readOnlyHint: true }
    },
    async () => safeTool(() => apiRequest("/auth/users"))
  );

  server.registerTool(
    "list_incidents",
    {
      title: "List Incidents",
      description: "List incidents across the platform, optionally filtering by status or severity.",
      inputSchema: z.object({
        status: z.string().optional(),
        severity: z.string().optional()
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ status, severity }) =>
      safeTool(async () => {
        const incidents = await apiRequest<IncidentRecord[]>("/incidents");
        return incidents.filter(
          (incident) =>
            (!status || incident.status === status) &&
            (!severity || incident.severity === severity)
        );
      }, formatIncidentList)
  );

  server.registerTool(
    "get_incident",
    {
      title: "Get Incident",
      description: "Get full incident details including evidence, hypotheses, proposals, and verification.",
      inputSchema: z.object({
        incidentId: z.string()
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ incidentId }) => safeTool(() => apiRequest(`/incidents/${incidentId}`))
  );

  server.registerTool(
    "approve_incident",
    {
      title: "Approve Incident Action",
      description: "Approve the current recommended action for an incident. Can run as dry-run for safe validation.",
      inputSchema: z.object({
        incidentId: z.string(),
        comment: z.string().optional(),
        dryRun: z.boolean().optional(),
        idempotencyKey: z.string().optional()
      }),
      annotations: { destructiveHint: true, readOnlyHint: false, idempotentHint: false }
    },
    async ({ incidentId, comment, dryRun, idempotencyKey }) =>
      safeTool(() =>
        apiRequest(`/incidents/${incidentId}/approve`, {
          method: "POST",
          body: JSON.stringify({ comment, dryRun, idempotencyKey })
        })
      )
  );

  server.registerTool(
    "reject_incident",
    {
      title: "Reject Incident Action",
      description: "Reject the proposed remediation for an incident.",
      inputSchema: z.object({
        incidentId: z.string(),
        comment: z.string().optional()
      }),
      annotations: { destructiveHint: true, readOnlyHint: false, idempotentHint: false }
    },
    async ({ incidentId, comment }) =>
      safeTool(() =>
        apiRequest(`/incidents/${incidentId}/reject`, {
          method: "POST",
          body: JSON.stringify({ comment })
        })
      )
  );

  server.registerTool(
    "escalate_incident",
    {
      title: "Escalate Incident",
      description: "Escalate an incident when the proposal is too risky or unclear.",
      inputSchema: z.object({
        incidentId: z.string(),
        comment: z.string().optional()
      }),
      annotations: { destructiveHint: true, readOnlyHint: false, idempotentHint: false }
    },
    async ({ incidentId, comment }) =>
      safeTool(() =>
        apiRequest(`/incidents/${incidentId}/escalate`, {
          method: "POST",
          body: JSON.stringify({ comment })
        })
      )
  );

  server.registerTool(
    "list_runbooks",
    {
      title: "List Runbooks",
      description: "List the currently registered recovery runbooks.",
      annotations: { readOnlyHint: true }
    },
    async () => safeTool(() => apiRequest("/runbooks"))
  );

  server.registerTool(
    "simulate_runbook",
    {
      title: "Simulate Runbook",
      description: "Simulate a runbook without applying real changes.",
      inputSchema: z.object({
        runbookId: z.string(),
        dryRun: z.boolean().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async ({ runbookId, dryRun }) =>
      safeTool(() =>
        apiRequest(`/runbooks/${runbookId}/simulate`, {
          method: "POST",
          body: JSON.stringify({ dryRun })
        })
      )
  );

  server.registerTool(
    "list_audit_events",
    {
      title: "List Audit Events",
      description: "List audit events globally or for one incident.",
      inputSchema: z.object({
        incidentId: z.string().optional()
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ incidentId }) =>
      safeTool(() =>
        apiRequest(incidentId ? `/audit/incidents/${incidentId}` : "/audit/events")
      )
  );

  server.registerTool(
    "list_services",
    {
      title: "List Services",
      description: "List the protected services and their current health summaries.",
      annotations: { readOnlyHint: true }
    },
    async () => safeTool(() => apiRequest("/services"))
  );

  return server;
});
