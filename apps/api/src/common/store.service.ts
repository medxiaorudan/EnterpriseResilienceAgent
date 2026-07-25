import { Injectable } from "@nestjs/common";
import {
  type ApprovalRecord,
  type AuditEvent,
  type CloudService,
  type CreateIncidentInput,
  type IncidentRecord,
  type IncidentStatus,
  type IncidentTimelineEntry,
  type VerificationResult,
  seedAuditEvents,
  seedIncidents,
  seedRunbooks,
  seedServices
} from "@enterprise-resilience/contracts";
import { randomUUID } from "node:crypto";

@Injectable()
export class StoreService {
  private readonly services: CloudService[] = structuredClone(seedServices);
  private readonly incidents: IncidentRecord[] = structuredClone(seedIncidents);
  private readonly runbooks = structuredClone(seedRunbooks);
  private readonly auditEvents: AuditEvent[] = structuredClone(seedAuditEvents);

  listServices() {
    return this.services;
  }

  getService(serviceId: string) {
    return this.services.find((service) => service.serviceId === serviceId);
  }

  listIncidents() {
    return this.incidents;
  }

  getIncident(incidentId: string) {
    return this.incidents.find((incident) => incident.incidentId === incidentId);
  }

  createIncident(input: CreateIncidentInput) {
    const service = this.getService(input.primaryService);
    if (!service) {
      return undefined;
    }

    const timestamp = new Date().toISOString();
    const incident: IncidentRecord = {
      incidentId: `INC-${new Date().getUTCFullYear()}-${String(this.incidents.length + 43).padStart(4, "0")}`,
      title: input.title,
      summary: input.summary,
      severity: input.severity,
      primaryService: service.serviceId,
      ownerTeam: service.ownerTeam,
      customerImpact: `${service.businessJourney} is degraded and customer errors are increasing.`,
      businessImpact: `${service.businessJourney} is at risk due to a new signal: ${input.trigger}.`,
      cloudProviders: [service.cloudProvider, ...service.dependencies.map((dependency) => this.getService(dependency.serviceId)?.cloudProvider).filter(Boolean)] as IncidentRecord["cloudProviders"],
      status: "DETECTED",
      confidenceSummary: "Low confidence: initial signal created and awaiting correlation.",
      createdAt: timestamp,
      updatedAt: timestamp,
      hypotheses: [],
      evidence: [],
      proposals: [],
      timeline: [
        {
          eventId: randomUUID(),
          timestamp,
          title: "Incident detected",
          detail: input.trigger,
          status: "DETECTED"
        }
      ],
      approvals: []
    };

    this.incidents.unshift(incident);
    this.recordAudit({
      incidentId: incident.incidentId,
      actor: "incident-service",
      category: "incident",
      summary: "Incident created",
      detail: input.summary
    });
    return incident;
  }

  updateIncident(incident: IncidentRecord) {
    incident.updatedAt = new Date().toISOString();
    return incident;
  }

  transitionIncident(incidentId: string, status: IncidentStatus, title: string, detail: string) {
    const incident = this.getIncident(incidentId);
    if (!incident) {
      return undefined;
    }

    incident.status = status;
    incident.updatedAt = new Date().toISOString();

    const timelineEntry: IncidentTimelineEntry = {
      eventId: randomUUID(),
      timestamp: incident.updatedAt,
      title,
      detail,
      status
    };

    incident.timeline.push(timelineEntry);
    return { incident, timelineEntry };
  }

  addApproval(incidentId: string, approval: Omit<ApprovalRecord, "approvalId" | "timestamp"> & Partial<Pick<ApprovalRecord, "timestamp">>) {
    const incident = this.getIncident(incidentId);
    if (!incident) {
      return undefined;
    }

    const approvalRecord: ApprovalRecord = {
      approvalId: randomUUID(),
      timestamp: approval.timestamp ?? new Date().toISOString(),
      incidentId,
      decision: approval.decision,
      actor: approval.actor,
      comment: approval.comment
    };

    incident.approvals.push(approvalRecord);
    incident.updatedAt = approvalRecord.timestamp;
    return approvalRecord;
  }

  setVerification(incidentId: string, verification: VerificationResult) {
    const incident = this.getIncident(incidentId);
    if (!incident) {
      return undefined;
    }

    incident.latestVerification = verification;
    incident.updatedAt = verification.timestamp;
    return verification;
  }

  listRunbooks() {
    return this.runbooks;
  }

  getRunbook(runbookId: string) {
    return this.runbooks.find((runbook) => runbook.runbookId === runbookId);
  }

  listAuditEvents() {
    return this.auditEvents.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  }

  listAuditEventsForIncident(incidentId: string) {
    return this.listAuditEvents().filter((event) => event.incidentId === incidentId);
  }

  listAuditEventsForExecution(executionId: string) {
    return this.listAuditEvents().filter((event) => event.executionId === executionId);
  }

  recordAudit(event: Omit<AuditEvent, "auditId" | "timestamp"> & Partial<Pick<AuditEvent, "timestamp">>) {
    const record: AuditEvent = {
      auditId: randomUUID(),
      timestamp: event.timestamp ?? new Date().toISOString(),
      ...event
    };
    this.auditEvents.push(record);
    return record;
  }
}
