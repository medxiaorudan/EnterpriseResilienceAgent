import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  type CreateIncidentInput,
  type ExecutionRecord,
  type IncidentRecord,
  type VerificationResult
} from "@enterprise-resilience/contracts";
import { randomUUID } from "node:crypto";
import { CloudAdaptersService } from "../cloud-adapters/cloud-adapters.service.js";
import { RedisService } from "../common/redis.service.js";
import { StoreService } from "../common/store.service.js";
import { EventsService } from "../events/events.service.js";

@Injectable()
export class IncidentsService {
  constructor(
    private readonly store: StoreService,
    private readonly redis: RedisService,
    private readonly cloudAdapters: CloudAdaptersService,
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

  async approve(
    incidentId: string,
    actor: string,
    comment?: string,
    idempotencyKey?: string,
    dryRun = false
  ) {
    const operationKey = idempotencyKey ?? `incident:${incidentId}:approve:${actor}:${dryRun ? "dry-run" : "live"}`;
    const cacheKey = `idempotency:${operationKey}`;
    const cached = await this.readCachedApproval(cacheKey);
    if (cached) {
      return cached;
    }

    const lockOwner = randomUUID();
    const lockKey = `lock:incident:${incidentId}:approve`;
    const lockAcquired = await this.acquireApprovalLock(lockKey, lockOwner);
    if (!lockAcquired) {
      throw new ConflictException(`Approval for incident ${incidentId} is already in progress.`);
    }

    try {
      const incident = await this.getOne(incidentId);
      if (incident.status !== "AWAITING_APPROVAL") {
        await this.cacheApprovalResult(cacheKey, incident);
        return incident;
      }

      const executionId = randomUUID();
      const proposal = incident.proposals[0];
      const adapter = this.cloudAdapters.getAdapter(proposal?.cloudProvider ?? "aws");
      const executionResult = await adapter.executeRunbook({
        executionId,
        incidentId,
        runbookId: proposal?.runbookId ?? "unknown-runbook",
        targetService: proposal?.targetService ?? incident.primaryService,
        environment: proposal?.targetEnvironment ?? "production",
        dryRun
      });
      const execution: ExecutionRecord = {
        executionId,
        incidentId,
        runbookId: proposal?.runbookId ?? "unknown-runbook",
        status: executionResult.status === "completed" ? "completed" : "failed",
        startedAt: new Date().toISOString(),
        steps: [
          {
            stepId: randomUUID(),
            title: "Approval accepted",
            status: "completed",
            detail: dryRun
              ? "Human approval validated for dry-run validation and execution lock acquired."
              : "Human approval validated and execution lock acquired."
          },
          ...executionResult.steps
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

      const verification: VerificationResult = dryRun
        ? {
            verificationId: randomUUID(),
            incidentId,
            outcome: "NO_CHANGE",
            summary: "Dry-run completed. AWS target and scale decision were validated without changing infrastructure.",
            checks: [
              {
                name: "target_validation",
                status: "passed",
                detail: "Approved ECS target mapping and policy bounds confirmed."
              },
              {
                name: "execution_mode",
                status: "warning",
                detail: "No infrastructure changes were applied because dry-run mode is enabled."
              }
            ],
            timestamp: new Date().toISOString()
          }
        : await adapter.verifyRecovery({
            incidentId,
            targetService: proposal?.targetService ?? incident.primaryService,
            environment: proposal?.targetEnvironment ?? "production",
            checks: proposal?.verificationChecks ?? []
          });

      execution.status = verification.outcome === "RECOVERED" || verification.outcome === "NO_CHANGE" ? "completed" : "failed";
      execution.completedAt = verification.timestamp;
      execution.steps.push({
        stepId: randomUUID(),
        title: "Recovery verification",
        status:
          verification.outcome === "RECOVERED" || verification.outcome === "NO_CHANGE"
            ? "completed"
            : "failed",
        detail: verification.summary
      });

      await this.store.setExecution(incidentId, execution);
      await this.store.setVerification(incidentId, verification);
      await this.transitionWithEvent(
        incidentId,
        dryRun ? "AWAITING_APPROVAL" : "RESOLVED",
        dryRun ? "Dry-run completed" : "Incident resolved",
        verification.summary,
        dryRun ? "runbook.dry_run_completed" : "incident.resolved"
      );
      await this.store.recordAudit({
        incidentId,
        executionId,
        actor: "verification-service",
        category: "verification",
        summary: "Recovery verified",
        detail: verification.summary
      });
      this.emit(incidentId, dryRun ? "runbook.dry_run_completed" : "verification.completed", verification);

      const updatedIncident = await this.getOne(incidentId);
      await this.cacheApprovalResult(cacheKey, updatedIncident);
      return updatedIncident;
    } finally {
      await this.releaseApprovalLock(lockKey, lockOwner);
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

  private async readCachedApproval(cacheKey: string) {
    try {
      return await this.redis.getJson<IncidentRecord>(cacheKey);
    } catch {
      throw new ServiceUnavailableException("Redis is unavailable for approval idempotency checks.");
    }
  }

  private async acquireApprovalLock(lockKey: string, lockOwner: string) {
    try {
      return await this.redis.acquireLock(lockKey, lockOwner, 120_000);
    } catch {
      throw new ServiceUnavailableException("Redis is unavailable for execution locking.");
    }
  }

  private async cacheApprovalResult(cacheKey: string, incident: IncidentRecord) {
    try {
      await this.redis.setJson(cacheKey, incident, 86_400);
    } catch {
      throw new ServiceUnavailableException("Redis is unavailable for approval result caching.");
    }
  }

  private async releaseApprovalLock(lockKey: string, lockOwner: string) {
    try {
      await this.redis.releaseLock(lockKey, lockOwner);
    } catch {
      // Failing to release an already-expiring lock should not corrupt the approval outcome.
    }
  }
}
