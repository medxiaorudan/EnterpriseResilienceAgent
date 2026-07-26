import "reflect-metadata";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { GcpConfigService } from "../dist/cloud-adapters/gcp-config.service.js";
import { GcpOperationsAdapter } from "../dist/cloud-adapters/providers/gcp-operations.adapter.js";
import { seedServices } from "@enterprise-resilience/contracts";

class FakeStoreService {
  async getService(serviceId) {
    return structuredClone(seedServices).find((service) => service.serviceId === serviceId);
  }
}

describe("gcp adapter guardrails", () => {
  test("fails simulation when target service is outside the allowed map", async () => {
    process.env.GCP_CLOUD_RUN_ALLOWED_TARGETS = JSON.stringify([
      {
        serviceId: "payment-routing",
        projectId: "enterprise-resilience-prod",
        serviceName: "payment-routing",
        region: "europe-west1",
        shiftPercent: 100,
        previousRevision: "payment-routing-r219",
        rollbackRunbookId: "gcp-cloud-run-shift-revision",
        environments: ["production"]
      }
    ]);

    const adapter = new GcpOperationsAdapter(new FakeStoreService(), new GcpConfigService());
    const result = await adapter.simulateRunbook({
      runbookId: "gcp-cloud-run-shift-revision",
      targetService: "checkout-api",
      environment: "production"
    });

    assert.equal(result.status, "failed");
    assert.match(result.summary, /not in the GCP allowed target map/i);
  });

  test("fails simulation when environment is not approved", async () => {
    process.env.GCP_CLOUD_RUN_ALLOWED_TARGETS = JSON.stringify([
      {
        serviceId: "payment-routing",
        projectId: "enterprise-resilience-prod",
        serviceName: "payment-routing",
        region: "europe-west1",
        shiftPercent: 100,
        previousRevision: "payment-routing-r219",
        rollbackRunbookId: "gcp-cloud-run-shift-revision",
        environments: ["production"]
      }
    ]);

    const adapter = new GcpOperationsAdapter(new FakeStoreService(), new GcpConfigService());
    const result = await adapter.simulateRunbook({
      runbookId: "gcp-cloud-run-shift-revision",
      targetService: "payment-routing",
      environment: "staging"
    });

    assert.equal(result.status, "failed");
    assert.match(result.summary, /environment staging is not approved/i);
  });
});
