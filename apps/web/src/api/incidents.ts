import type {
  AuditEvent,
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

export function listRunbooks() {
  return apiRequest<RegisteredRunbook[]>("/runbooks");
}

export function listAuditEvents() {
  return apiRequest<AuditEvent[]>("/audit/events");
}
