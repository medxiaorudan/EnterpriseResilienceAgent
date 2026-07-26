import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  type ApprovalRecord,
  type AuditEvent,
  type CloudService,
  type CreateIncidentInput,
  type IncidentRecord,
  type IncidentStatus,
  type IncidentTimelineEntry,
  type ExecutionRecord,
  type RegisteredRunbook,
  type VerificationResult,
  seedAuditEvents,
  seedIncidents,
  seedRunbooks,
  seedServices
} from "@enterprise-resilience/contracts";
import { randomUUID } from "node:crypto";
import { PostgresService } from "./postgres.service.js";

type JsonRow<T> = {
  payload: T;
};

@Injectable()
export class StoreService implements OnModuleInit {
  private initPromise?: Promise<void>;

  constructor(private readonly postgres: PostgresService) {}

  async onModuleInit() {
    await this.ensureInitialized();
  }

  async listServices() {
    await this.ensureInitialized();
    const result = await this.postgres.query<JsonRow<CloudService>>(
      "select payload from services order by payload->>'name' asc"
    );
    return result.rows.map((row) => row.payload);
  }

  async getService(serviceId: string) {
    await this.ensureInitialized();
    const result = await this.postgres.query<JsonRow<CloudService>>(
      "select payload from services where service_id = $1",
      [serviceId]
    );
    return result.rows[0]?.payload;
  }

  async listIncidents() {
    await this.ensureInitialized();
    const incidents = await this.postgres.query<JsonRow<IncidentRecord>>(
      "select payload from incidents order by updated_at desc"
    );
    const approvals = await this.listApprovalsByIncidentIds(
      incidents.rows.map((row) => row.payload.incidentId)
    );

    return incidents.rows.map((row) => ({
      ...row.payload,
      approvals: approvals.get(row.payload.incidentId) ?? row.payload.approvals ?? []
    }));
  }

  async getIncident(incidentId: string) {
    await this.ensureInitialized();
    const result = await this.postgres.query<JsonRow<IncidentRecord>>(
      "select payload from incidents where incident_id = $1",
      [incidentId]
    );
    const incident = result.rows[0]?.payload;
    if (!incident) {
      return undefined;
    }

    const approvals = await this.listApprovalsByIncidentIds([incidentId]);
    return {
      ...incident,
      approvals: approvals.get(incidentId) ?? incident.approvals ?? []
    };
  }

  async createIncident(input: CreateIncidentInput) {
    const service = await this.getService(input.primaryService);
    if (!service) {
      return undefined;
    }

    const existingCount = await this.postgres.query<{ count: string }>(
      "select count(*)::text as count from incidents"
    );
    const timestamp = new Date().toISOString();
    const incident: IncidentRecord = {
      incidentId: `INC-${new Date().getUTCFullYear()}-${String(Number(existingCount.rows[0]?.count ?? "0") + 43).padStart(4, "0")}`,
      title: input.title,
      summary: input.summary,
      severity: input.severity,
      primaryService: service.serviceId,
      ownerTeam: service.ownerTeam,
      customerImpact: `${service.businessJourney} is degraded and customer errors are increasing.`,
      businessImpact: `${service.businessJourney} is at risk due to a new signal: ${input.trigger}.`,
      cloudProviders: [
        service.cloudProvider,
        ...(
          await Promise.all(
            service.dependencies.map(async (dependency) => (await this.getService(dependency.serviceId))?.cloudProvider)
          )
        ).filter(Boolean)
      ] as IncidentRecord["cloudProviders"],
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

    await this.saveIncident(incident);
    await this.recordAudit({
      incidentId: incident.incidentId,
      actor: "incident-service",
      category: "incident",
      summary: "Incident created",
      detail: input.summary
    });
    return incident;
  }

  async updateIncident(incident: IncidentRecord) {
    incident.updatedAt = new Date().toISOString();
    await this.saveIncident(incident);
    return incident;
  }

  async transitionIncident(incidentId: string, status: IncidentStatus, title: string, detail: string) {
    const incident = await this.getIncident(incidentId);
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
    await this.saveIncident(incident);
    return { incident, timelineEntry };
  }

  async addApproval(
    incidentId: string,
    approval: Omit<ApprovalRecord, "approvalId" | "timestamp" | "incidentId"> &
      Partial<Pick<ApprovalRecord, "timestamp">>
  ) {
    const incident = await this.getIncident(incidentId);
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

    incident.approvals = [...incident.approvals, approvalRecord];
    incident.updatedAt = approvalRecord.timestamp;

    await this.postgres.transaction(async (query) => {
      await query(
        "insert into approvals (approval_id, incident_id, created_at, payload) values ($1, $2, $3, $4::jsonb)",
        [approvalRecord.approvalId, incidentId, approvalRecord.timestamp, JSON.stringify(approvalRecord)]
      );
      await query(
        "update incidents set payload = $2::jsonb, updated_at = $3 where incident_id = $1",
        [incidentId, JSON.stringify(incident), approvalRecord.timestamp]
      );
    });

    return approvalRecord;
  }

  async setVerification(incidentId: string, verification: VerificationResult) {
    const incident = await this.getIncident(incidentId);
    if (!incident) {
      return undefined;
    }

    incident.latestVerification = verification;
    incident.updatedAt = verification.timestamp;
    await this.saveIncident(incident);
    return verification;
  }

  async setExecution(incidentId: string, execution: ExecutionRecord) {
    const incident = await this.getIncident(incidentId);
    if (!incident) {
      return undefined;
    }

    incident.latestExecution = execution;
    incident.updatedAt = execution.completedAt ?? execution.startedAt;
    await this.saveIncident(incident);
    return execution;
  }

  async listRunbooks() {
    await this.ensureInitialized();
    const result = await this.postgres.query<JsonRow<RegisteredRunbook>>(
      "select payload from runbooks order by payload->>'title' asc"
    );
    return result.rows.map((row) => row.payload);
  }

  async getRunbook(runbookId: string) {
    await this.ensureInitialized();
    const result = await this.postgres.query<JsonRow<RegisteredRunbook>>(
      "select payload from runbooks where runbook_id = $1",
      [runbookId]
    );
    return result.rows[0]?.payload;
  }

  async listAuditEvents() {
    await this.ensureInitialized();
    const result = await this.postgres.query<JsonRow<AuditEvent>>(
      "select payload from audit_events order by created_at desc"
    );
    return result.rows.map((row) => row.payload);
  }

  async listAuditEventsByProvider(provider: AuditEvent["provider"]) {
    await this.ensureInitialized();
    const result = await this.postgres.query<JsonRow<AuditEvent>>(
      "select payload from audit_events where payload->>'provider' = $1 order by created_at desc",
      [provider]
    );
    return result.rows.map((row) => row.payload);
  }

  async listAuditEventsForIncident(incidentId: string) {
    await this.ensureInitialized();
    const result = await this.postgres.query<JsonRow<AuditEvent>>(
      "select payload from audit_events where incident_id = $1 order by created_at desc",
      [incidentId]
    );
    return result.rows.map((row) => row.payload);
  }

  async listAuditEventsForExecution(executionId: string) {
    await this.ensureInitialized();
    const result = await this.postgres.query<JsonRow<AuditEvent>>(
      "select payload from audit_events where execution_id = $1 order by created_at desc",
      [executionId]
    );
    return result.rows.map((row) => row.payload);
  }

  async recordAudit(event: Omit<AuditEvent, "auditId" | "timestamp"> & Partial<Pick<AuditEvent, "timestamp">>) {
    await this.ensureInitialized();
    const record: AuditEvent = {
      auditId: randomUUID(),
      timestamp: event.timestamp ?? new Date().toISOString(),
      ...event
    };
    await this.postgres.query(
      "insert into audit_events (audit_id, incident_id, execution_id, created_at, payload) values ($1, $2, $3, $4, $5::jsonb)",
      [record.auditId, record.incidentId ?? null, record.executionId ?? null, record.timestamp, JSON.stringify(record)]
    );
    return record;
  }

  private async ensureInitialized() {
    this.initPromise ??= this.initialize();
    await this.initPromise;
  }

  private async initialize() {
    await this.postgres.query(`
      create table if not exists services (
        service_id text primary key,
        updated_at timestamptz not null,
        payload jsonb not null
      );

      create table if not exists runbooks (
        runbook_id text primary key,
        version text not null,
        updated_at timestamptz not null,
        payload jsonb not null
      );

      create table if not exists incidents (
        incident_id text primary key,
        primary_service text not null,
        severity text not null,
        status text not null,
        created_at timestamptz not null,
        updated_at timestamptz not null,
        payload jsonb not null
      );

      create table if not exists approvals (
        approval_id text primary key,
        incident_id text not null references incidents(incident_id) on delete cascade,
        created_at timestamptz not null,
        payload jsonb not null
      );

      create table if not exists audit_events (
        audit_id text primary key,
        incident_id text null,
        execution_id text null,
        created_at timestamptz not null,
        payload jsonb not null
      );

      create index if not exists idx_incidents_updated_at on incidents(updated_at desc);
      create index if not exists idx_approvals_incident_created_at on approvals(incident_id, created_at desc);
      create index if not exists idx_audit_events_incident_created_at on audit_events(incident_id, created_at desc);
      create index if not exists idx_audit_events_execution_created_at on audit_events(execution_id, created_at desc);
    `);

    await this.seedServices();
    await this.seedRunbooks();
    await this.seedIncidents();
    await this.seedAuditEvents();
  }

  private async seedServices() {
    const result = await this.postgres.query<{ count: string }>("select count(*)::text as count from services");
    if (Number(result.rows[0]?.count ?? "0") > 0) {
      return;
    }

    await this.postgres.transaction(async (query) => {
      for (const service of seedServices) {
        await query(
          "insert into services (service_id, updated_at, payload) values ($1, $2, $3::jsonb)",
          [service.serviceId, service.health.lastUpdatedAt, JSON.stringify(service)]
        );
      }
    });
  }

  private async seedRunbooks() {
    const result = await this.postgres.query<{ count: string }>("select count(*)::text as count from runbooks");
    if (Number(result.rows[0]?.count ?? "0") > 0) {
      return;
    }

    await this.postgres.transaction(async (query) => {
      for (const runbook of seedRunbooks) {
        await query(
          "insert into runbooks (runbook_id, version, updated_at, payload) values ($1, $2, $3, $4::jsonb)",
          [runbook.runbookId, runbook.version, new Date().toISOString(), JSON.stringify(runbook)]
        );
      }
    });
  }

  private async seedIncidents() {
    const result = await this.postgres.query<{ count: string }>("select count(*)::text as count from incidents");
    if (Number(result.rows[0]?.count ?? "0") > 0) {
      return;
    }

    await this.postgres.transaction(async (query) => {
      for (const incident of seedIncidents) {
        await query(
          "insert into incidents (incident_id, primary_service, severity, status, created_at, updated_at, payload) values ($1, $2, $3, $4, $5, $6, $7::jsonb)",
          [
            incident.incidentId,
            incident.primaryService,
            incident.severity,
            incident.status,
            incident.createdAt,
            incident.updatedAt,
            JSON.stringify(incident)
          ]
        );

        for (const approval of incident.approvals) {
          await query(
            "insert into approvals (approval_id, incident_id, created_at, payload) values ($1, $2, $3, $4::jsonb)",
            [approval.approvalId, approval.incidentId, approval.timestamp, JSON.stringify(approval)]
          );
        }
      }
    });
  }

  private async seedAuditEvents() {
    const result = await this.postgres.query<{ count: string }>("select count(*)::text as count from audit_events");
    if (Number(result.rows[0]?.count ?? "0") > 0) {
      return;
    }

    await this.postgres.transaction(async (query) => {
      for (const event of seedAuditEvents) {
        await query(
          "insert into audit_events (audit_id, incident_id, execution_id, created_at, payload) values ($1, $2, $3, $4, $5::jsonb)",
          [event.auditId, event.incidentId ?? null, event.executionId ?? null, event.timestamp, JSON.stringify(event)]
        );
      }
    });
  }

  private async listApprovalsByIncidentIds(incidentIds: string[]) {
    if (incidentIds.length === 0) {
      return new Map<string, ApprovalRecord[]>();
    }

    const result = await this.postgres.query<{ incident_id: string; payload: ApprovalRecord }>(
      "select incident_id, payload from approvals where incident_id = any($1::text[]) order by created_at asc",
      [incidentIds]
    );

    const approvals = new Map<string, ApprovalRecord[]>();
    for (const row of result.rows) {
      const list = approvals.get(row.incident_id) ?? [];
      list.push(row.payload);
      approvals.set(row.incident_id, list);
    }
    return approvals;
  }

  private async saveIncident(incident: IncidentRecord) {
    await this.ensureInitialized();
    await this.postgres.query(
      `
        insert into incidents (incident_id, primary_service, severity, status, created_at, updated_at, payload)
        values ($1, $2, $3, $4, $5, $6, $7::jsonb)
        on conflict (incident_id) do update set
          primary_service = excluded.primary_service,
          severity = excluded.severity,
          status = excluded.status,
          updated_at = excluded.updated_at,
          payload = excluded.payload
      `,
      [
        incident.incidentId,
        incident.primaryService,
        incident.severity,
        incident.status,
        incident.createdAt,
        incident.updatedAt,
        JSON.stringify(incident)
      ]
    );
  }
}
