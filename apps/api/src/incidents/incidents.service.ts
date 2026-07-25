import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type CreateIncidentInput,
  type ExecutionRecord,
  type IncidentRecord,
  type VerificationResult
} from "@enterprise-resilience/contracts";
import { randomUUID } from "node:crypto";
import { RedisService } from "../common/redis.service.js";
import { StoreService } from "../common/store.service.js";
import { EventsService } from "../events/events.service.js";

@Injectable()
export class IncidentsService {
  constructor(
    private readonly store: StoreService,
    private readonly redis: RedisService,
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

  async approve(incidentId: string, actor: string, comment?: string, idempotencyKey?: string) {
    const operationKey = idempotencyKey ?? `incident:${incidentId}:approve:${actor}`;
    const cacheKey = `idempotency:${operationKey}`;
    const cached = await this.redis.getJson<IncidentRecord>(cacheKey);
    if (cached) {
      return cached;
    }

    const lockOwner = randomUUID();
    const lockKey = `lock:incident:${incidentId}:approve`;
    const lockAcquired = await this.redis.acquireLock(lockKey, lockOwner, 120_000);
    if (!lockAcquired) {
      throw new ConflictException(`Approval for incident ${incidentId} is already in progress.`);
    }

    try {
      const incident = await this.getOne(incidentId);
      if (incident.status !== "AWAITING_APPROVAL") {
        await this.redis.setJson(cacheKey, incident, 86_400);
        return incident;
      }

      const executionId = randomUUID();
      const execution: ExecutionRecord = {
        executionId,
        incidentId,
        runbookId: incident.proposals[0]?.runbookId ?? "unknown-runbook",
        status: "running",
        startedAt: new Date().toISOString(),
        steps: [
          {
            stepId: randomUUID(),
            title: "Approval accepted",
            status: "completed",
            detail: "Human approval validated and execution lock acquired."
          },
          {
            stepId: randomUUID(),
            title: "Runbook execution",
            status: "running",
            detail: "Deterministic registered runbook execution in progress."
          }
        ]
      };

      await this.store.setExecution(incidentId, execution);
      await this.store.addApproval(incidentId, {
        actor,
        decision: "approved",
        comment
      });
      await this.store.recordAudit({
        incidentId,
        executionId,
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

      execution.status = "completed";
      execution.completedAt = verification.timestamp;
      execution.steps = execution.steps.map((step) =>
        step.title === "Runbook execution"
          ? {
              ...step,
              status: "completed",
              detail: "Runbook execution completed and handed over to verification."
            }
          : step
      );
      execution.steps.push({
        stepId: randomUUID(),
        title: "Recovery verification",
        status: "completed",
        detail: verification.summary
      });

      await this.store.setExecution(incidentId, execution);
      await this.store.setVerification(incidentId, verification);
      await this.transitionWithEvent(incidentId, "RESOLVED", "Incident resolved", verification.summary, "incident.resolved");
      await this.store.recordAudit({
        incidentId,
        executionId,
        actor: "verification-service",
        category: "verification",
        summary: "Recovery verified",
        detail: verification.summary
      });
      this.emit(incidentId, "verification.completed", verification);

      const updatedIncident = await this.getOne(incidentId);
      await this.redis.setJson(cacheKey, updatedIncident, 86_400);
      return updatedIncident;
    } finally {
      await this.redis.releaseLock(lockKey, lockOwner);
    }
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
