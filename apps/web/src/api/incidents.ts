import type {
  AuditEvent,
  CloudChange,
  CloudService,
  IncidentRecord,
  IncidentTimelineEntry,
  RegisteredRunbook
} from "@enterprise-resilience/contracts";
import { apiRequest } from "./client.js";

export function listIncidents() {
  return apiRequest<IncidentRecord[]>("/incidents");
}

export function getIncident(incidentId: string) {
  return apiRequest<IncidentRecord>(`/incidents/${incidentId}`);
}

export function getIncidentTimeline(incidentId: string) {
  return apiRequest<IncidentTimelineEntry[]>(`/incidents/${incidentId}/timeline`);
}

export function approveIncident(incidentId: string) {
  return apiRequest<IncidentRecord>(`/incidents/${incidentId}/approve`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function rejectIncident(incidentId: string) {
  return apiRequest<IncidentRecord>(`/incidents/${incidentId}/reject`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function escalateIncident(incidentId: string) {
  return apiRequest<IncidentRecord>(`/incidents/${incidentId}/escalate`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function listServices() {
  return apiRequest<CloudService[]>("/services");
}

export function getService(serviceId: string) {
  return apiRequest<CloudService>(`/services/${serviceId}`);
}

export function getServiceChanges(serviceId: string) {
  return apiRequest<CloudChange[]>(`/services/${serviceId}/changes`);
}

export function getServiceIncidents(serviceId: string) {
  return apiRequest<IncidentRecord[]>(`/services/${serviceId}/incidents`);
}

export function getServiceDependencies(serviceId: string) {
  return apiRequest<Array<{
    serviceId: string;
    kind: string;
    description: string;
    cloudProvider?: string;
    health?: CloudService["health"];
  }>>(`/services/${serviceId}/dependencies`);
}

export function getServiceMetrics(serviceId: string) {
  return apiRequest<Array<{
    metricName: string;
    label: string;
    unit: string;
    points: Array<{ timestamp: string; value: number }>;
    latestValue: number;
    delta: number;
    deltaDirection: "up" | "down" | "flat";
    thresholdLabel: string;
    thresholdStatus: "within-threshold" | "warning" | "breached";
    source: "persisted" | "seeded";
  }>>(`/services/${serviceId}/metrics`);
}

export function getServiceApprovalContext(serviceId: string) {
  return apiRequest<{
    state: string;
    approvalPolicy: string;
    requiresHumanApproval: boolean;
    runbookId?: string;
    targetEnvironment?: string;
    incidentId?: string;
  }>(`/services/${serviceId}/approval-context`);
}

export function listRunbooks() {
  return apiRequest<RegisteredRunbook[]>("/runbooks");
}

export function simulateRunbook(runbookId: string, targetService?: string) {
  return apiRequest(`/runbooks/${runbookId}/simulate`, {
    method: "POST",
    body: JSON.stringify({
      dryRun: true,
      targetService
    })
  });
}

export function listAuditEvents(provider?: "aws" | "gcp") {
  const suffix = provider ? `?provider=${provider}` : "";
  return apiRequest<AuditEvent[]>(`/audit/events${suffix}`);
}
