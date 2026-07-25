import "reflect-metadata";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  seedAuditEvents,
  seedIncidents,
  seedRunbooks,
  seedServices
} from "@enterprise-resilience/contracts";
import { StoreService } from "../dist/common/store.service.js";

class FakePostgresService {
  constructor() {
    this.tables = {
      services: new Map(),
      runbooks: new Map(),
      incidents: new Map(),
      approvals: new Map(),
      audit_events: new Map()
    };
  }

  async query(text, values = []) {
    const sql = text.trim().replace(/\s+/g, " ").toLowerCase();

    if (sql.startsWith("create table if not exists")) {
      return this.result([]);
    }

    if (sql === "select count(*)::text as count from services") {
      return this.result([{ count: String(this.tables.services.size) }]);
    }

    if (sql === "select count(*)::text as count from runbooks") {
      return this.result([{ count: String(this.tables.runbooks.size) }]);
    }

    if (sql === "select count(*)::text as count from incidents") {
      return this.result([{ count: String(this.tables.incidents.size) }]);
    }

    if (sql === "select count(*)::text as count from audit_events") {
      return this.result([{ count: String(this.tables.audit_events.size) }]);
    }

    if (sql.startsWith("insert into services")) {
      const [serviceId, updatedAt, payload] = values;
      this.tables.services.set(serviceId, {
        service_id: serviceId,
        updated_at: updatedAt,
        payload: JSON.parse(payload)
      });
      return this.result([]);
    }

    if (sql.startsWith("insert into runbooks")) {
      const [runbookId, version, updatedAt, payload] = values;
      this.tables.runbooks.set(runbookId, {
        runbook_id: runbookId,
        version,
        updated_at: updatedAt,
        payload: JSON.parse(payload)
      });
      return this.result([]);
    }

    if (sql.startsWith("insert into incidents")) {
      const [incidentId, primaryService, severity, status, createdAt, updatedAt, payload] = values;
      this.tables.incidents.set(incidentId, {
        incident_id: incidentId,
        primary_service: primaryService,
        severity,
        status,
        created_at: createdAt,
        updated_at: updatedAt,
        payload: JSON.parse(payload)
      });
      return this.result([]);
    }

    if (sql.startsWith("update incidents set payload")) {
      const [incidentId, payload, updatedAt] = values;
      const existing = this.tables.incidents.get(incidentId);
      this.tables.incidents.set(incidentId, {
        ...existing,
        updated_at: updatedAt,
        payload: JSON.parse(payload)
      });
      return this.result([]);
    }

    if (sql.startsWith("insert into approvals")) {
      const [approvalId, incidentId, createdAt, payload] = values;
      this.tables.approvals.set(approvalId, {
        approval_id: approvalId,
        incident_id: incidentId,
        created_at: createdAt,
        payload: JSON.parse(payload)
      });
      return this.result([]);
    }

    if (sql.startsWith("insert into audit_events")) {
      const [auditId, incidentId, executionId, createdAt, payload] = values;
      this.tables.audit_events.set(auditId, {
        audit_id: auditId,
        incident_id: incidentId,
        execution_id: executionId,
        created_at: createdAt,
        payload: JSON.parse(payload)
      });
      return this.result([]);
    }

    if (sql === "select payload from services order by payload->>'name' asc") {
      return this.result(
        [...this.tables.services.values()]
          .sort((left, right) => left.payload.name.localeCompare(right.payload.name))
          .map((row) => ({ payload: row.payload }))
      );
    }

    if (sql === "select payload from services where service_id = $1") {
      const row = this.tables.services.get(values[0]);
      return this.result(row ? [{ payload: row.payload }] : []);
    }

    if (sql === "select payload from incidents order by updated_at desc") {
      return this.result(
        [...this.tables.incidents.values()]
          .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))
          .map((row) => ({ payload: row.payload }))
      );
    }

    if (sql === "select payload from incidents where incident_id = $1") {
      const row = this.tables.incidents.get(values[0]);
      return this.result(row ? [{ payload: row.payload }] : []);
    }

    if (sql === "select payload from runbooks order by payload->>'title' asc") {
      return this.result(
        [...this.tables.runbooks.values()]
          .sort((left, right) => left.payload.title.localeCompare(right.payload.title))
          .map((row) => ({ payload: row.payload }))
      );
    }

    if (sql === "select payload from runbooks where runbook_id = $1") {
      const row = this.tables.runbooks.get(values[0]);
      return this.result(row ? [{ payload: row.payload }] : []);
    }

    if (sql === "select payload from audit_events order by created_at desc") {
      return this.result(
        [...this.tables.audit_events.values()]
          .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
          .map((row) => ({ payload: row.payload }))
      );
    }

    if (sql === "select payload from audit_events where incident_id = $1 order by created_at desc") {
      return this.result(
        [...this.tables.audit_events.values()]
          .filter((row) => row.incident_id === values[0])
          .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
          .map((row) => ({ payload: row.payload }))
      );
    }

    if (sql === "select payload from audit_events where execution_id = $1 order by created_at desc") {
      return this.result(
        [...this.tables.audit_events.values()]
          .filter((row) => row.execution_id === values[0])
          .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
          .map((row) => ({ payload: row.payload }))
      );
    }

    if (sql === "select incident_id, payload from approvals where incident_id = any($1::text[]) order by created_at asc") {
      const incidentIds = new Set(values[0] ?? []);
      return this.result(
        [...this.tables.approvals.values()]
          .filter((row) => incidentIds.has(row.incident_id))
          .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)))
          .map((row) => ({
            incident_id: row.incident_id,
            payload: row.payload
          }))
      );
    }

    throw new Error(`Unhandled SQL in fake postgres: ${sql}`);
  }

  async transaction(work) {
    return work((text, values) => this.query(text, values));
  }

  result(rows) {
    return {
      command: "SELECT",
      rowCount: rows.length,
      oid: 0,
      rows,
      fields: []
    };
  }
}

describe("store persistence behavior", () => {
  test("bootstraps seed data into an empty database", async () => {
    const store = new StoreService(new FakePostgresService());
    await store.onModuleInit();

    const services = await store.listServices();
    const incidents = await store.listIncidents();
    const runbooks = await store.listRunbooks();
    const auditEvents = await store.listAuditEvents();

    assert.equal(services.length, seedServices.length);
    assert.equal(runbooks.length, seedRunbooks.length);
    assert.equal(incidents.length, seedIncidents.length);
    assert.equal(auditEvents.length, seedAuditEvents.length);
    assert.equal(incidents[0].incidentId, seedIncidents[0].incidentId);
  });

  test("persists new incidents and writes matching incident audit records", async () => {
    const store = new StoreService(new FakePostgresService());
    await store.onModuleInit();

    const created = await store.createIncident({
      title: "Queue backlog warning",
      primaryService: "checkout-api",
      severity: "SEV-3",
      summary: "Checkout queue is growing but customer failures remain limited.",
      trigger: "Queue depth breached the early warning threshold."
    });

    assert.ok(created);

    const persisted = await store.getIncident(created.incidentId);
    const auditEvents = await store.listAuditEventsForIncident(created.incidentId);

    assert.equal(persisted?.incidentId, created.incidentId);
    assert.equal(persisted?.primaryService, "checkout-api");
    assert.equal(persisted?.timeline.length, 1);
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].summary, "Incident created");
  });

  test("persists approval, execution, verification, and execution audit trails", async () => {
    const store = new StoreService(new FakePostgresService());
    await store.onModuleInit();

    const incidentId = seedIncidents[0].incidentId;
    const executionId = "exec-test-001";

    await store.addApproval(incidentId, {
      actor: "business-approver",
      decision: "approved",
      comment: "Proceed with low-risk remediation."
    });

    await store.setExecution(incidentId, {
      executionId,
      incidentId,
      runbookId: "aws-ecs-scale-service",
      status: "completed",
      startedAt: "2026-07-25T09:25:00.000Z",
      completedAt: "2026-07-25T09:28:00.000Z",
      steps: [
        {
          stepId: "step-1",
          title: "Scale service",
          status: "completed",
          detail: "Scaled ECS desired count from 5 to 7."
        }
      ]
    });

    await store.setVerification(incidentId, {
      verificationId: "verify-1",
      incidentId,
      outcome: "RECOVERED",
      summary: "Checkout recovered and queue depth is falling.",
      checks: [
        {
          name: "checkout_success_rate",
          status: "passed",
          detail: "Recovered above 99.5%."
        }
      ],
      timestamp: "2026-07-25T09:29:00.000Z"
    });

    await store.recordAudit({
      incidentId,
      executionId,
      actor: "verification-service",
      category: "verification",
      summary: "Recovery verified",
      detail: "Checkout recovered and queue depth is falling."
    });

    const incident = await store.getIncident(incidentId);
    const executionAudit = await store.listAuditEventsForExecution(executionId);

    assert.equal(incident?.approvals.length, 1);
    assert.equal(incident?.latestExecution?.executionId, executionId);
    assert.equal(incident?.latestVerification?.outcome, "RECOVERED");
    assert.equal(executionAudit.length, 1);
    assert.equal(executionAudit[0].executionId, executionId);
    assert.equal(executionAudit[0].summary, "Recovery verified");
  });
});
