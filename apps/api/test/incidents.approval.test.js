import "reflect-metadata";
import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { seedIncidents, seedRunbooks, seedServices } from "@enterprise-resilience/contracts";
import { AppModule } from "../dist/app.module.js";
import { RedisService } from "../dist/common/redis.service.js";
import { StoreService } from "../dist/common/store.service.js";

class FakeStoreService {
  constructor(seed = seedIncidents) {
    this.incidents = new Map();
    this.auditEvents = [];
    this.runbooks = new Map();
    this.services = new Map();
    this.metricHistory = new Map();
    for (const incident of structuredClone(seed)) {
      this.incidents.set(incident.incidentId, incident);
    }
    for (const runbook of structuredClone(seedRunbooks)) {
      this.runbooks.set(runbook.runbookId, runbook);
    }
    for (const service of structuredClone(seedServices)) {
      this.services.set(service.serviceId, service);
    }
  }

  async listServices() {
    return [...this.services.values()];
  }

  async getService(serviceId) {
    return this.services.get(serviceId);
  }

  async listMetricHistory(serviceId, metricNames, limitPerMetric = 6) {
    const history = new Map();
    for (const metricName of metricNames) {
      const entries = (this.metricHistory.get(`${serviceId}:${metricName}`) ?? []).slice(-limitPerMetric);
      history.set(metricName, entries);
    }
    return history;
  }

  async appendMetricSample(sample) {
    const record = {
      sampleId: sample.sampleId ?? randomUUID(),
      ...sample
    };
    const key = `${record.serviceId}:${record.metricName}`;
    const entries = this.metricHistory.get(key) ?? [];
    entries.push(record);
    this.metricHistory.set(key, entries.slice(-12));
    return record;
  }

  async listIncidents() {
    return [...this.incidents.values()];
  }

  async getIncident(incidentId) {
    return this.incidents.get(incidentId);
  }

  async createIncident() {
    throw new Error("Not implemented for this test suite.");
  }

  async updateIncident(incident) {
    this.incidents.set(incident.incidentId, incident);
    return incident;
  }

  async transitionIncident(incidentId, status, title, detail) {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      return undefined;
    }

    const timelineEntry = {
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      title,
      detail,
      status
    };

    incident.status = status;
    incident.updatedAt = timelineEntry.timestamp;
    incident.timeline.push(timelineEntry);
    this.incidents.set(incidentId, incident);
    return { incident, timelineEntry };
  }

  async addApproval(incidentId, approval) {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      return undefined;
    }

    const record = {
      approvalId: randomUUID(),
      incidentId,
      actor: approval.actor,
      decision: approval.decision,
      comment: approval.comment,
      timestamp: approval.timestamp ?? new Date().toISOString()
    };
    incident.approvals.push(record);
    incident.updatedAt = record.timestamp;
    this.incidents.set(incidentId, incident);
    return record;
  }

  async setExecution(incidentId, execution) {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      return undefined;
    }

    incident.latestExecution = execution;
    incident.updatedAt = execution.completedAt ?? execution.startedAt;
    this.incidents.set(incidentId, incident);
    return execution;
  }

  async setVerification(incidentId, verification) {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      return undefined;
    }

    incident.latestVerification = verification;
    incident.updatedAt = verification.timestamp;
    this.incidents.set(incidentId, incident);
    return verification;
  }

  async recordAudit(event) {
    const record = {
      auditId: randomUUID(),
      timestamp: event.timestamp ?? new Date().toISOString(),
      ...event
    };
    this.auditEvents.push(record);
    return record;
  }

  async listRunbooks() {
    return [...this.runbooks.values()];
  }

  async getRunbook(runbookId) {
    return this.runbooks.get(runbookId);
  }

  async listAuditEvents() {
    return this.auditEvents;
  }

  async listAuditEventsByProvider(provider) {
    return this.auditEvents.filter((event) => event.provider === provider);
  }

  async listAuditEventsForIncident(incidentId) {
    return this.auditEvents.filter((event) => event.incidentId === incidentId);
  }

  async listAuditEventsForExecution(executionId) {
    return this.auditEvents.filter((event) => event.executionId === executionId);
  }
}

class FakeRedisService {
  constructor() {
    this.cache = new Map();
    this.locks = new Map();
    this.failOnGet = false;
    this.failOnAcquire = false;
    this.failOnSet = false;
    this.rejectLock = false;
  }

  async getJson(key) {
    if (this.failOnGet) {
      throw new Error("redis unavailable");
    }
    const raw = this.cache.get(key);
    return raw ? JSON.parse(raw) : undefined;
  }

  async setJson(key, value) {
    if (this.failOnSet) {
      throw new Error("redis unavailable");
    }
    this.cache.set(key, JSON.stringify(value));
  }

  async acquireLock(key, owner) {
    if (this.failOnAcquire) {
      throw new Error("redis unavailable");
    }
    if (this.rejectLock || this.locks.has(key)) {
      return false;
    }
    this.locks.set(key, owner);
    return true;
  }

  async releaseLock(key, owner) {
    if (this.locks.get(key) === owner) {
      this.locks.delete(key);
    }
  }
}

describe("incident approval API", () => {
  let app;
  let fakeStore;
  let fakeRedis;
const incidentId = "INC-2026-0042";
const managerHeaders = {
  "x-era-user": "manager.demo",
  "x-era-role": "incident-manager"
};

  beforeEach(async () => {
    fakeStore = new FakeStoreService();
    fakeRedis = new FakeRedisService();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(StoreService)
      .useValue(fakeStore)
      .overrideProvider(RedisService)
      .useValue(fakeRedis)
      .compile();

    app = moduleRef.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("api");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  test("approves once and returns cached result for the same idempotency key", async () => {
    const idempotencyKey = "approval-key-1";

    const first = await app.inject({
      method: "POST",
      url: `/api/incidents/${incidentId}/approve`,
      headers: managerHeaders,
      payload: {
        idempotencyKey
      }
    });
    const firstBody = first.json();

    assert.equal(first.statusCode, 201);
    assert.equal(firstBody.status, "RESOLVED");
    assert.equal(firstBody.approvals.length, 1);
    assert.ok(firstBody.latestExecution.executionId);
    assert.deepEqual(
      firstBody.latestExecution.steps.slice(1, 4).map((step) => step.title),
      ["Validate target", "Assume short-lived role", "Increase desired count"]
    );

    const second = await app.inject({
      method: "POST",
      url: `/api/incidents/${incidentId}/approve`,
      headers: managerHeaders,
      payload: {
        idempotencyKey
      }
    });
    const secondBody = second.json();

    assert.equal(second.statusCode, 201);
    assert.equal(secondBody.latestExecution.executionId, firstBody.latestExecution.executionId);
    assert.equal(secondBody.approvals.length, 1);
  });

  test("returns 409 when the approval lock cannot be acquired", async () => {
    fakeRedis.rejectLock = true;

    const response = await app.inject({
      method: "POST",
      url: `/api/incidents/${incidentId}/approve`,
      headers: managerHeaders,
      payload: {
        idempotencyKey: "lock-conflict"
      }
    });
    const body = response.json();

    assert.equal(response.statusCode, 409);
    assert.match(body.message, /already in progress/i);
  });

  test("returns 503 when redis is unavailable during idempotency checks", async () => {
    fakeRedis.failOnGet = true;

    const response = await app.inject({
      method: "POST",
      url: `/api/incidents/${incidentId}/approve`,
      headers: managerHeaders,
      payload: {
        idempotencyKey: "redis-down"
      }
    });
    const body = response.json();

    assert.equal(response.statusCode, 503);
    assert.match(body.message, /Redis is unavailable/i);
  });

  test("supports dry-run approval without resolving the incident", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/incidents/${incidentId}/approve`,
      headers: managerHeaders,
      payload: {
        idempotencyKey: "dry-run-1",
        dryRun: true
      }
    });
    const body = response.json();

    assert.equal(response.statusCode, 201);
    assert.equal(body.status, "AWAITING_APPROVAL");
    assert.equal(body.latestVerification.outcome, "NO_CHANGE");
    assert.match(body.latestVerification.summary, /Dry-run completed/i);
  });

  test("routes approval execution through the GCP adapter when the proposal targets GCP", async () => {
    const incident = await fakeStore.getIncident(incidentId);
    incident.proposals = [
      {
        actionId: "shift-payment-routing",
        runbookId: "gcp-cloud-run-shift-revision",
        runbookVersion: "2.1.0",
        cloudProvider: "gcp",
        targetService: "payment-routing",
        targetEnvironment: "production",
        reason: "Cloud Run revision rollback is the safest cross-cloud recovery step.",
        riskLevel: "medium",
        confidenceLevel: "medium",
        expectedResult: "Restore payment routing health while keeping checkout stable.",
        estimatedCostPerHour: 0.25,
        maximumDurationMinutes: 20,
        preconditions: ["Previous healthy revision is available"],
        verificationChecks: ["GCP request error rate normalizes", "AWS checkout success rate recovers"],
        rollbackRunbookId: "gcp-cloud-run-shift-revision",
        approvalPolicy: "human-review-required"
      }
    ];
    await fakeStore.updateIncident(incident);

    const response = await app.inject({
      method: "POST",
      url: `/api/incidents/${incidentId}/approve`,
      headers: managerHeaders,
      payload: {
        idempotencyKey: "gcp-approval-1"
      }
    });
    const body = response.json();

    assert.equal(response.statusCode, 201);
    assert.equal(body.status, "RESOLVED");
    assert.equal(body.latestExecution.steps[1].title, "Validate target");
    assert.equal(body.latestExecution.steps[3].title, "Shift traffic to previous revision");
    assert.match(body.latestExecution.steps[3].detail, /previous revision/i);
    assert.match(body.latestVerification.summary, /request errors normalized/i);
  });

  test("blocks approval when the current role is read-only", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/incidents/${incidentId}/approve`,
      headers: {
        "x-era-user": "viewer.demo",
        "x-era-role": "viewer"
      },
      payload: {
        idempotencyKey: "viewer-block"
      }
    });
    const body = response.json();

    assert.equal(response.statusCode, 403);
    assert.match(body.message, /required roles/i);
  });

  test("returns the default demo session when auth headers are absent", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/session"
    });
    const body = response.json();

    assert.equal(response.statusCode, 200);
    assert.equal(body.userId, "manager.demo");
    assert.equal(body.role, "incident-manager");
    assert.equal(body.source, "demo-default");
  });

  test("records provider-tagged audit history for dry-runs and filters it by provider", async () => {
    const simulateResponse = await app.inject({
      method: "POST",
      url: "/api/runbooks/gcp-cloud-run-shift-revision/simulate",
      headers: managerHeaders,
      payload: {
        dryRun: true,
        targetService: "payment-routing"
      }
    });
    const simulation = simulateResponse.json();

    assert.equal(simulateResponse.statusCode, 201);
    assert.equal(simulation.provider, "gcp");
    assert.equal(simulation.status, "passed");

    const auditResponse = await app.inject({
      method: "GET",
      url: "/api/audit/events?provider=gcp",
      headers: managerHeaders
    });
    const body = auditResponse.json();

    assert.equal(auditResponse.statusCode, 200);
    assert.equal(body[0].provider, "gcp");
    assert.equal(body[0].targetService, "payment-routing");
    assert.equal(body[0].runbookId, "gcp-cloud-run-shift-revision");
    assert.match(body[0].summary, /runbook simulation passed/i);
  });

  test("exposes target activity history and last successful live action in platform status", async () => {
    const incident = await fakeStore.getIncident(incidentId);
    incident.proposals = [
      {
        actionId: "shift-payment-routing",
        runbookId: "gcp-cloud-run-shift-revision",
        runbookVersion: "2.1.0",
        cloudProvider: "gcp",
        targetService: "payment-routing",
        targetEnvironment: "production",
        reason: "Cloud Run revision rollback is the safest cross-cloud recovery step.",
        riskLevel: "medium",
        confidenceLevel: "medium",
        expectedResult: "Restore payment routing health while keeping checkout stable.",
        estimatedCostPerHour: 0.25,
        maximumDurationMinutes: 20,
        preconditions: ["Previous healthy revision is available"],
        verificationChecks: ["GCP request error rate normalizes", "AWS checkout success rate recovers"],
        rollbackRunbookId: "gcp-cloud-run-shift-revision",
        approvalPolicy: "human-review-required"
      }
    ];
    await fakeStore.updateIncident(incident);

    await app.inject({
      method: "POST",
      url: "/api/runbooks/gcp-cloud-run-shift-revision/simulate",
      headers: managerHeaders,
      payload: {
        dryRun: true,
        targetService: "payment-routing"
      }
    });

    await app.inject({
      method: "POST",
      url: `/api/incidents/${incidentId}/approve`,
      headers: managerHeaders,
      payload: {
        idempotencyKey: "gcp-platform-history"
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/platform/status",
      headers: managerHeaders
    });
    const body = response.json();
    const gcpTarget = body.providerTargets.find((target) => target.provider === "gcp");

    assert.equal(response.statusCode, 200);
    assert.equal(gcpTarget.targetService, "payment-routing");
    assert.equal(gcpTarget.latestSimulation.status, "passed");
    assert.ok(gcpTarget.recentActivity.length >= 2);
    assert.equal(gcpTarget.recentActivity[0].kind, "simulation");
    assert.equal(gcpTarget.recentActivity.some((item) => item.kind === "verification"), true);
    assert.match(gcpTarget.lastSuccessfulLiveAction.summary, /request errors normalized/i);
  });

  test("runs rollback for a platform target and records incident-linked rollback activity", async () => {
    const incident = await fakeStore.getIncident(incidentId);
    incident.proposals = [
      {
        actionId: "shift-payment-routing",
        runbookId: "gcp-cloud-run-shift-revision",
        runbookVersion: "2.1.0",
        cloudProvider: "gcp",
        targetService: "payment-routing",
        targetEnvironment: "production",
        reason: "Cloud Run revision rollback is the safest cross-cloud recovery step.",
        riskLevel: "medium",
        confidenceLevel: "medium",
        expectedResult: "Restore payment routing health while keeping checkout stable.",
        estimatedCostPerHour: 0.25,
        maximumDurationMinutes: 20,
        preconditions: ["Previous healthy revision is available"],
        verificationChecks: ["GCP request error rate normalizes", "AWS checkout success rate recovers"],
        rollbackRunbookId: "gcp-cloud-run-shift-revision",
        approvalPolicy: "human-review-required"
      }
    ];
    await fakeStore.updateIncident(incident);

    const rollbackResponse = await app.inject({
      method: "POST",
      url: "/api/platform/targets/gcp/payment-routing/rollback",
      headers: managerHeaders
    });
    const rollbackBody = rollbackResponse.json();

    assert.equal(rollbackResponse.statusCode, 201);
    assert.equal(rollbackBody.provider, "gcp");
    assert.match(rollbackBody.summary, /restored cloud run traffic/i);

    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/platform/status",
      headers: managerHeaders
    });
    const statusBody = statusResponse.json();
    const gcpTarget = statusBody.providerTargets.find((target) => target.provider === "gcp");
    const rollbackActivity = gcpTarget.recentActivity.find((item) => item.kind === "rollback");

    assert.equal(statusResponse.statusCode, 200);
    assert.equal(rollbackActivity.incidentId, incidentId);
    assert.match(rollbackActivity.summary, /restored cloud run traffic/i);
  });

  test("exposes service approval context and metric trends for a target service", async () => {
    const incident = await fakeStore.getIncident(incidentId);
    incident.proposals = [
      {
        actionId: "shift-payment-routing",
        runbookId: "gcp-cloud-run-shift-revision",
        runbookVersion: "2.1.0",
        cloudProvider: "gcp",
        targetService: "payment-routing",
        targetEnvironment: "production",
        reason: "Cloud Run revision rollback is the safest cross-cloud recovery step.",
        riskLevel: "medium",
        confidenceLevel: "medium",
        expectedResult: "Restore payment routing health while keeping checkout stable.",
        estimatedCostPerHour: 0.25,
        maximumDurationMinutes: 20,
        preconditions: ["Previous healthy revision is available"],
        verificationChecks: ["GCP request error rate normalizes", "AWS checkout success rate recovers"],
        rollbackRunbookId: "gcp-cloud-run-shift-revision",
        approvalPolicy: "human-review-required"
      }
    ];
    await fakeStore.updateIncident(incident);

    const approvalResponse = await app.inject({
      method: "GET",
      url: "/api/services/payment-routing/approval-context",
      headers: managerHeaders
    });
    const approvalBody = approvalResponse.json();

    assert.equal(approvalResponse.statusCode, 200);
    assert.equal(approvalBody.state, "AWAITING_APPROVAL");
    assert.equal(approvalBody.approvalPolicy, "human-review-required");
    assert.equal(approvalBody.requiresHumanApproval, true);
    assert.equal(approvalBody.runbookId, "gcp-cloud-run-shift-revision");
    assert.equal(approvalBody.targetEnvironment, "production");
    assert.equal(approvalBody.incidentId, incidentId);

    const metricsResponse = await app.inject({
      method: "GET",
      url: "/api/services/payment-routing/metrics",
      headers: managerHeaders
    });
    const metricsBody = metricsResponse.json();

    assert.equal(metricsResponse.statusCode, 200);
    assert.equal(metricsBody.length, 3);
    assert.equal(metricsBody[0].points.length, 6);
    assert.equal(typeof metricsBody[0].points[0].value, "number");
  });
});
