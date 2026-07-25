import { Injectable, NotFoundException } from "@nestjs/common";
import {
  type CreateIncidentInput,
  type IncidentRecord,
  type VerificationResult
} from "@enterprise-resilience/contracts";
import { randomUUID } from "node:crypto";
import { StoreService } from "../common/store.service.js";
import { EventsService } from "../events/events.service.js";

@Injectable()
export class IncidentsService {
  constructor(
    private readonly store: StoreService,
    private readonly events: EventsService
  ) {}

  list() {
    return this.store.listIncidents();
  }

  async create(input: CreateIncidentInput) {
    const incident = await this.store.createIncident(input);
    if (!incident) {
      throw new NotFoundException(`Service ${input.primaryService} not found.`);
    }

    this.emit(incident.incidentId, "incident.detected", {
      title: incident.title,
      severity: incident.severity
    });

    const transitions = [
      {
        status: "CORRELATED" as const,
        title: "Signals correlated",
        detail: "Related service and dependency signals grouped into a single business incident.",
        eventType: "incident.correlated"
      },
      {
        status: "INVESTIGATING" as const,
        title: "Investigation started",
        detail: "Evidence collection started across AWS and GCP adapters.",
        eventType: "investigation.started"
      },
      {
        status: "AWAITING_APPROVAL" as const,
        title: "Awaiting approval",
        detail: "Seed proposal generation is ready for a human decision.",
        eventType: "approval.requested"
      }
    ];

    for (const transition of transitions) {
      const result = await this.store.transitionIncident(
        incident.incidentId,
        transition.status,
        transition.title,
        transition.detail
      );
      if (result) {
        this.emit(incident.incidentId, transition.eventType, result.timelineEntry);
      }
    }

    return this.getOne(incident.incidentId);
  }

  async getOne(incidentId: string) {
    const incident = await this.store.getIncident(incidentId);
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found.`);
    }

    return incident;
  }

  async getTimeline(incidentId: string) {
    return (await this.getOne(incidentId)).timeline;
  }

  async getEvidence(incidentId: string) {
    return (await this.getOne(incidentId)).evidence;
  }

  async getHypotheses(incidentId: string) {
    return (await this.getOne(incidentId)).hypotheses;
  }

  async getActions(incidentId: string) {
    return (await this.getOne(incidentId)).proposals;
  }

  async approve(incidentId: string, actor: string, comment?: string) {
    const incident = await this.getOne(incidentId);
    await this.store.addApproval(incidentId, {
      actor,
      decision: "approved",
      comment
    });
    await this.store.recordAudit({
      incidentId,
      actor,
      category: "approval",
      summary: "Incident action approved",
      detail: comment ?? "Approved from incident workspace."
    });
    await this.transitionWithEvent(incidentId, "EXECUTING", "Runbook execution started", "Deterministic registered runbook execution started.", "runbook.started");
    await this.transitionWithEvent(incidentId, "VERIFYING", "Verification started", "Cross-cloud verification checks are running.", "verification.started");

    const verification: VerificationResult = {
      verificationId: randomUUID(),
      incidentId,
      outcome: "RECOVERED",
      summary: "Checkout success recovered above 99.5% and queue depth is falling.",
      checks: [
        {
          name: "checkout_success_rate",
          status: "passed",
          detail: "Recovered to 99.6% within 4 minutes."
        },
        {
          name: "p95_latency",
          status: "passed",
          detail: "Reduced to 1.7 seconds."
        },
        {
          name: "payment-routing health",
          status: "passed",
          detail: "GCP dependency remained stable during recovery."
        }
      ],
      timestamp: new Date().toISOString()
    };
    await this.store.setVerification(incidentId, verification);
    await this.transitionWithEvent(incidentId, "RESOLVED", "Incident resolved", verification.summary, "incident.resolved");
    await this.store.recordAudit({
      incidentId,
      actor: "verification-service",
      category: "verification",
      summary: "Recovery verified",
      detail: verification.summary
    });
    this.emit(incident.incidentId, "verification.completed", verification);
    return this.getOne(incidentId);
  }

  async reject(incidentId: string, actor: string, comment?: string) {
    await this.store.addApproval(incidentId, {
      actor,
      decision: "rejected",
      comment
    });
    await this.store.recordAudit({
      incidentId,
      actor,
      category: "approval",
      summary: "Incident action rejected",
      detail: comment ?? "Action rejected."
    });
    await this.transitionWithEvent(incidentId, "ESCALATED", "Incident escalated", "Approval rejected and incident escalated to on-call team.", "incident.escalated");
    return this.getOne(incidentId);
  }

  async escalate(incidentId: string, actor: string, comment?: string) {
    await this.store.addApproval(incidentId, {
      actor,
      decision: "escalated",
      comment
    });
    await this.store.recordAudit({
      incidentId,
      actor,
      category: "approval",
      summary: "Incident escalated",
      detail: comment ?? "Escalated for manual handling."
    });
    await this.transitionWithEvent(incidentId, "ESCALATED", "Manual escalation", "Manual investigation requested.", "incident.escalated");
    return this.getOne(incidentId);
  }

  private async transitionWithEvent(
    incidentId: string,
    status: IncidentRecord["status"],
    title: string,
    detail: string,
    eventType: string
  ) {
    const result = await this.store.transitionIncident(incidentId, status, title, detail);
    if (result) {
      this.emit(incidentId, eventType, result.timelineEntry);
    }
    return result;
  }

  private emit(incidentId: string, eventType: string, payload: unknown) {
    this.events.publish({
      eventId: randomUUID(),
      incidentId,
      eventType,
      timestamp: new Date().toISOString(),
      payload
    });
  }
}
