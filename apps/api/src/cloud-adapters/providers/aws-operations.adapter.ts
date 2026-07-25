import { Injectable, NotFoundException } from "@nestjs/common";
import {
  type ApprovedExecutionRequest,
  type CloudChange,
  type CloudOperationsAdapter,
  type CostQuery,
  type CostSignal,
  type ExecutionResult,
  type LogQuery,
  type LogResult,
  type MetricQuery,
  type MetricResult,
  type RollbackRequest,
  type RollbackResult,
  type RunbookSimulationRequest,
  type SecurityFinding,
  type SecurityQuery,
  type ServiceHealth,
  type SimulationResult,
  type TimeRange,
  type VerificationRequest,
  type VerificationResult
} from "@enterprise-resilience/contracts";
import { randomUUID } from "node:crypto";
import { StoreService } from "../../common/store.service.js";

@Injectable()
export class AwsOperationsAdapter implements CloudOperationsAdapter {
  readonly provider = "aws" as const;

  constructor(private readonly store: StoreService) {}

  async getServiceHealth(serviceId: string): Promise<ServiceHealth> {
    const service = await this.store.getService(serviceId);
    if (!service || service.cloudProvider !== "aws") {
      throw new NotFoundException(`AWS service ${serviceId} not found.`);
    }
    return service.health;
  }

  async getRecentChanges(serviceId: string, _timeRange: TimeRange): Promise<CloudChange[]> {
    const service = await this.store.getService(serviceId);
    if (!service || service.cloudProvider !== "aws") {
      throw new NotFoundException(`AWS service ${serviceId} not found.`);
    }
    return service.recentChanges;
  }

  async getMetrics(query: MetricQuery): Promise<MetricResult[]> {
    if (query.serviceId !== "checkout-api") {
      return [];
    }

    const timestamp = new Date().toISOString();
    const syntheticMetrics: Record<string, number> = {
      queue_depth: 920,
      cpu_utilization: 91,
      checkout_success_rate: 91.2,
      p95_latency_ms: 2650
    };

    const value = syntheticMetrics[query.metricName] ?? 0;
    return [
      {
        metricName: query.metricName,
        value,
        unit: query.metricName.includes("rate") ? "percent" : "count",
        timestamp
      }
    ];
  }

  async queryLogs(_query: LogQuery): Promise<LogResult[]> {
    return [
      {
        timestamp: new Date().toISOString(),
        message: "ECS service saturation detected; desired count remains at baseline.",
        source: "cloudwatch:/ecs/checkout-api"
      }
    ];
  }

  async getSecurityFindings(_query: SecurityQuery): Promise<SecurityFinding[]> {
    return [];
  }

  async getCostSignals(_query: CostQuery): Promise<CostSignal[]> {
    return [
      {
        signalId: randomUUID(),
        estimatedCostPerHour: 0.6,
        summary: "Temporary ECS scale-out remains within the approved FinOps envelope."
      }
    ];
  }

  async simulateRunbook(request: RunbookSimulationRequest): Promise<SimulationResult> {
    if (request.runbookId !== "aws-ecs-scale-service" || request.targetService !== "checkout-api") {
      return {
        simulationId: randomUUID(),
        provider: "aws",
        status: "failed",
        summary: "Simulation not available for this AWS runbook/target combination.",
        checks: ["Runbook target mismatch"]
      };
    }

    return {
      simulationId: randomUUID(),
      provider: "aws",
      status: "passed",
      summary: "ECS desired count can be increased from 5 to 7 within approved bounds.",
      checks: [
        "Desired count is below the approved ceiling",
        "Database remains healthy",
        "Payment routing dependency remains healthy"
      ]
    };
  }

  async executeRunbook(request: ApprovedExecutionRequest): Promise<ExecutionResult> {
    return {
      executionId: request.executionId,
      provider: "aws",
      status: "completed",
      summary: "Scaled ECS desired count from 5 to 7 for checkout-api.",
      steps: [
        {
          stepId: randomUUID(),
          title: "Validate target",
          status: "completed",
          detail: "Confirmed checkout-api is an approved ECS target."
        },
        {
          stepId: randomUUID(),
          title: "Assume short-lived role",
          status: "completed",
          detail: "Bounded execution role assumed for AWS ECS scale action."
        },
        {
          stepId: randomUUID(),
          title: "Increase desired count",
          status: "completed",
          detail: "Updated desired count from 5 to 7 within policy limits."
        }
      ]
    };
  }

  async verifyRecovery(request: VerificationRequest): Promise<VerificationResult> {
    return {
      verificationId: randomUUID(),
      incidentId: request.incidentId,
      outcome: "RECOVERED",
      summary: "Checkout success recovered above 99.5% and queue depth is decreasing.",
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
          name: "queue_depth",
          status: "passed",
          detail: "Queue depth is decreasing for the last 5 minutes."
        }
      ],
      timestamp: new Date().toISOString()
    };
  }

  async rollback(request: RollbackRequest): Promise<RollbackResult> {
    return {
      executionId: request.executionId,
      provider: "aws",
      status: "completed",
      summary: "Restored ECS desired count to the previous baseline."
    };
  }
}
