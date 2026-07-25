import "reflect-metadata";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { AwsConfigService } from "../dist/cloud-adapters/aws-config.service.js";
import { AwsOperationsAdapter } from "../dist/cloud-adapters/providers/aws-operations.adapter.js";
import { seedServices } from "@enterprise-resilience/contracts";

class FakeStoreService {
  async getService(serviceId) {
    return structuredClone(seedServices).find((service) => service.serviceId === serviceId);
  }
}

describe("aws adapter guardrails", () => {
  test("fails simulation when target service is outside the allowed map", async () => {
    process.env.AWS_ECS_ALLOWED_TARGETS = JSON.stringify([
      {
        serviceId: "checkout-api",
        clusterArn: "arn:aws:ecs:eu-west-1:123456789012:cluster/checkout-production",
        ecsServiceName: "checkout-api",
        region: "eu-west-1",
        minDesiredCount: 2,
        maxDesiredCount: 8,
        scaleStep: 2,
        rollbackRunbookId: "aws-ecs-restore-service-count",
        environments: ["production"]
      }
    ]);

    const adapter = new AwsOperationsAdapter(new FakeStoreService(), new AwsConfigService());
    const result = await adapter.simulateRunbook({
      runbookId: "aws-ecs-scale-service",
      targetService: "payment-routing",
      environment: "production"
    });

    assert.equal(result.status, "failed");
    assert.match(result.summary, /not in the AWS allowed target map/i);
  });

  test("fails simulation when environment is not approved", async () => {
    process.env.AWS_ECS_ALLOWED_TARGETS = JSON.stringify([
      {
        serviceId: "checkout-api",
        clusterArn: "arn:aws:ecs:eu-west-1:123456789012:cluster/checkout-production",
        ecsServiceName: "checkout-api",
        region: "eu-west-1",
        minDesiredCount: 2,
        maxDesiredCount: 8,
        scaleStep: 2,
        rollbackRunbookId: "aws-ecs-restore-service-count",
        environments: ["production"]
      }
    ]);

    const adapter = new AwsOperationsAdapter(new FakeStoreService(), new AwsConfigService());
    const result = await adapter.simulateRunbook({
      runbookId: "aws-ecs-scale-service",
      targetService: "checkout-api",
      environment: "staging"
    });

    assert.equal(result.status, "failed");
    assert.match(result.summary, /environment staging is not approved/i);
  });
});
