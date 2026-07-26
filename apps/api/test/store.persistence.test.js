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
      audit_events: new Map(),
      metric_history: new Map(),
      target_alert_states: new Map(),
      alert_channel_states: new Map(),
      alert_dead_letters: new Map()
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

    if (sql === "select count(*)::text as count from metric_history") {
      return this.result([{ count: String(this.tables.metric_history.size) }]);
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

    if (sql.startsWith("insert into metric_history")) {
      const [sampleId, serviceId, metricName, createdAt, payload] = values;
      this.tables.metric_history.set(sampleId, {
        sample_id: sampleId,
        service_id: serviceId,
        metric_name: metricName,
        created_at: createdAt,
        payload: JSON.parse(payload)
      });
      return this.result([]);
    }

    if (sql.startsWith("insert into target_alert_states")) {
      const [alertKey, provider, targetService, state, updatedAt, payload] = values;
      this.tables.target_alert_states.set(alertKey, {
        alert_key: alertKey,
        provider,
        target_service: targetService,
        state,
        updated_at: updatedAt,
        payload: JSON.parse(payload)
      });
      return this.result([]);
    }

    if (sql.startsWith("insert into alert_channel_states")) {
      const [channelName, enabled, updatedAt, payload] = values;
      this.tables.alert_channel_states.set(channelName, {
        channel_name: channelName,
        enabled,
        updated_at: updatedAt,
        payload: JSON.parse(payload)
      });
      return this.result([]);
    }

    if (sql.startsWith("insert into alert_dead_letters")) {
      const [deadLetterId, channelName, provider, targetService, createdAt, payload] = values;
      this.tables.alert_dead_letters.set(deadLetterId, {
        dead_letter_id: deadLetterId,
        channel_name: channelName,
        provider,
        target_service: targetService,
        created_at: createdAt,
        resolved_at: JSON.parse(payload).resolvedAt ?? null,
        payload: JSON.parse(payload)
      });
      return this.result([]);
    }

    if (sql.startsWith("delete from metric_history")) {
      const [serviceId, metricName] = values;
      const matches = [...this.tables.metric_history.values()]
        .filter((row) => row.service_id === serviceId && row.metric_name === metricName)
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));

      for (const row of matches.slice(12)) {
        this.tables.metric_history.delete(row.sample_id);
      }
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

    if (sql === "select payload from target_alert_states where provider = $1 and target_service = $2") {
      const row = [...this.tables.target_alert_states.values()].find(
        (entry) => entry.provider === values[0] && entry.target_service === values[1]
      );
      return this.result(row ? [{ payload: row.payload }] : []);
    }

    if (sql === "select payload from alert_channel_states order by channel_name asc") {
      return this.result(
        [...this.tables.alert_channel_states.values()]
          .sort((left, right) => left.channel_name.localeCompare(right.channel_name))
          .map((row) => ({ payload: row.payload }))
      );
    }

    if (sql === "select payload from alert_channel_states where channel_name = $1") {
      const row = this.tables.alert_channel_states.get(values[0]);
      return this.result(row ? [{ payload: row.payload }] : []);
    }

    if (sql === "select payload from alert_dead_letters order by created_at desc") {
      return this.result(
        [...this.tables.alert_dead_letters.values()]
          .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
          .map((row) => ({ payload: row.payload }))
      );
    }

    if (
      sql ===
      "select channel_name, count(*)::text as count from alert_dead_letters where resolved_at is null group by channel_name"
    ) {
      const counts = new Map();
      for (const row of this.tables.alert_dead_letters.values()) {
        if (row.resolved_at) {
          continue;
        }
        counts.set(row.channel_name, (counts.get(row.channel_name) ?? 0) + 1);
      }

      return this.result(
        [...counts.entries()].map(([channel_name, count]) => ({
          channel_name,
          count: String(count)
        }))
      );
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

    if (
      sql ===
      "select payload from ( select payload, row_number() over ( partition by metric_name order by created_at desc ) as row_rank from metric_history where service_id = $1 and metric_name = any($2::text[]) ) ranked where row_rank <= $3 order by (payload->>'metricname') asc, created_at asc"
    ) {
      const [serviceId, metricNames, limitPerMetric] = values;
      const allowed = new Set(metricNames ?? []);
      const rows = [];

      for (const metricName of [...allowed].sort()) {
        const samples = [...this.tables.metric_history.values()]
          .filter((row) => row.service_id === serviceId && row.metric_name === metricName)
          .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
          .slice(0, limitPerMetric)
          .reverse()
          .map((row) => ({ payload: row.payload }));
        rows.push(...samples);
      }

      return this.result(rows);
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
    const metricHistory = await store.listMetricHistory("checkout-api", ["queue_depth"], 6);

    assert.equal(services.length, seedServices.length);
    assert.equal(runbooks.length, seedRunbooks.length);
    assert.equal(incidents.length, seedIncidents.length);
    assert.equal(auditEvents.length, seedAuditEvents.length);
    assert.equal(metricHistory.get("queue_depth")?.length, 6);
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

  test("persists and retains recent metric history per service and metric", async () => {
    const store = new StoreService(new FakePostgresService());
    await store.onModuleInit();

    for (let index = 0; index < 8; index += 1) {
      await store.appendMetricSample({
        serviceId: "checkout-api",
        metricName: "queue_depth",
        unit: "count",
        value: 900 + index,
        timestamp: `2026-07-26T23:${String(index).padStart(2, "0")}:00.000Z`
      });
    }

    const history = await store.listMetricHistory("checkout-api", ["queue_depth"], 6);
    const points = history.get("queue_depth") ?? [];

    assert.equal(points.length, 6);
    assert.equal(points[0].value, 902);
    assert.equal(points[5].value, 907);
  });

  test("persists target alert state records", async () => {
    const store = new StoreService(new FakePostgresService());
    await store.onModuleInit();

    await store.saveTargetAlertState({
      alertKey: "gcp:payment-routing",
      provider: "gcp",
      targetService: "payment-routing",
      state: "breached",
      summary: "Request error rate stayed breached.",
      lastCollectedAt: "2026-07-26T22:10:00.000Z",
      breachedMetrics: ["Request error rate"],
      acknowledgedAt: "2026-07-26T22:12:00.000Z",
      acknowledgedBy: "Morgan Manager",
      incidentId: "INC-2026-0042",
      updatedAt: "2026-07-26T22:12:00.000Z"
    });

    const alert = await store.getTargetAlertState("gcp", "payment-routing");

    assert.equal(alert?.state, "breached");
    assert.equal(alert?.acknowledgedBy, "Morgan Manager");
    assert.equal(alert?.incidentId, "INC-2026-0042");
  });

  test("persists alert channel state and dead-letter counters", async () => {
    const store = new StoreService(new FakePostgresService());
    await store.onModuleInit();

    await store.saveAlertChannelState({
      channelName: "primary-webhook",
      enabled: false,
      mutedUntil: "2026-07-26T23:30:00.000Z",
      updatedAt: "2026-07-26T23:00:00.000Z"
    });
    await store.createAlertDeadLetter({
      deadLetterId: "dead-letter-1",
      channelName: "primary-webhook",
      provider: "aws",
      targetService: "checkout-api",
      eventType: "auto-escalated",
      payloadSummary: "Checkout sustained breach",
      error: "Webhook returned 500",
      createdAt: "2026-07-26T23:05:00.000Z"
    });

    const channelState = await store.getAlertChannelState("primary-webhook");
    const deadLetters = await store.listAlertDeadLetters();
    const pendingCounts = await store.countPendingAlertDeadLettersByChannel();

    assert.equal(channelState?.enabled, false);
    assert.equal(channelState?.mutedUntil, "2026-07-26T23:30:00.000Z");
    assert.equal(deadLetters.length, 1);
    assert.equal(deadLetters[0].channelName, "primary-webhook");
    assert.equal(pendingCounts.get("primary-webhook"), 1);
  });
});
