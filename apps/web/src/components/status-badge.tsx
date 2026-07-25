import { Badge } from "@enterprise-resilience/ui";
import type { IncidentRecord, ServiceHealth } from "@enterprise-resilience/contracts";

export function IncidentStatusBadge({ status }: { status: IncidentRecord["status"] }) {
  const tone =
    status === "RESOLVED"
      ? "good"
      : status === "ESCALATED"
        ? "danger"
        : status === "AWAITING_APPROVAL" || status === "VERIFYING"
          ? "warning"
          : "default";

  return <Badge tone={tone}>{status.replaceAll("_", " ")}</Badge>;
}

export function HealthBadge({ health }: { health: ServiceHealth["status"] }) {
  const tone = health === "healthy" ? "good" : health === "critical" ? "danger" : "warning";
  return <Badge tone={tone}>{health}</Badge>;
}
