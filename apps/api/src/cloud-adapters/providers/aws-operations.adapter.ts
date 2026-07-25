import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  CloudWatchClient,
  GetMetricDataCommand
} from "@aws-sdk/client-cloudwatch";
import {
  DescribeServicesCommand,
  ECSClient,
  UpdateServiceCommand
} from "@aws-sdk/client-ecs";
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
import { AwsConfigService } from "../aws-config.service.js";

@Injectable()
export class AwsOperationsAdapter implements CloudOperationsAdapter {
  readonly provider = "aws" as const;

  constructor(
    private readonly store: StoreService,
    private readonly awsConfig: AwsConfigService
  ) {}

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
    const liveTarget = this.awsConfig.getTarget(query.serviceId);
    if (this.awsConfig.isLiveExecutionEnabled() && liveTarget) {
      return this.getLiveMetrics(query, liveTarget.region);
    }

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
    const guardrails = this.validateExecutionGuardrails({
      runbookId: request.runbookId,
      targetService: request.targetService,
      environment: request.environment
    });

    if (!guardrails.allowed) {
      return {
        simulationId: randomUUID(),
        provider: "aws",
        status: "failed",
        summary: guardrails.reason,
        checks: [guardrails.reason]
      };
    }

    if (request.dryRun && this.awsConfig.isLiveExecutionEnabled()) {
      const preview = await this.previewLiveScaleOut(guardrails.target);
      return {
        simulationId: randomUUID(),
        provider: "aws",
        status: "passed",
        summary: `Dry-run validated AWS connectivity and would scale ${request.targetService} from ${preview.currentDesiredCount} to ${preview.nextDesiredCount}.`,
        checks: [
          "AWS target mapping validated",
          "Current desired count read from ECS",
          "Proposed scale change remains within approved bounds"
        ],
        proposedChange: {
          field: "desiredCount",
          currentValue: preview.currentDesiredCount,
          nextValue: preview.nextDesiredCount
        }
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
    const guardrails = this.validateExecutionGuardrails({
      runbookId: request.runbookId,
      targetService: request.targetService,
      environment: request.environment
    });
    if (!guardrails.allowed) {
      throw new BadRequestException(guardrails.reason);
    }

    if (this.awsConfig.isLiveExecutionEnabled()) {
      if (request.dryRun) {
        const preview = await this.previewLiveScaleOut(guardrails.target);
        return {
          executionId: request.executionId,
          provider: "aws",
          status: "completed",
          summary: `Dry-run only: validated that ${request.targetService} would scale from ${preview.currentDesiredCount} to ${preview.nextDesiredCount}.`,
          steps: [
            {
              stepId: randomUUID(),
              title: "Validate target",
              status: "completed",
              detail: `Confirmed ${request.targetService} is mapped to ${guardrails.target.ecsServiceName} in ${guardrails.target.region}.`
            },
            {
              stepId: randomUUID(),
              title: "Read current ECS state",
              status: "completed",
              detail: `Read desired count ${preview.currentDesiredCount} from ECS.`
            },
            {
              stepId: randomUUID(),
              title: "Preview desired count change",
              status: "completed",
              detail: `Would update desired count to ${preview.nextDesiredCount}; no infrastructure changes were applied.`
            }
          ]
        };
      }
      return this.executeLiveScaleOut(request, guardrails.target);
    }

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

  private validateExecutionGuardrails(input: {
    runbookId: string;
    targetService: string;
    environment: string;
  }) {
    const target = this.awsConfig.getTarget(input.targetService);
    if (!target) {
      return {
        allowed: false,
        reason: `Service ${input.targetService} is not in the AWS allowed target map.`
      } as const;
    }

    if (input.runbookId !== "aws-ecs-scale-service") {
      return {
        allowed: false,
        reason: `Runbook ${input.runbookId} is not approved for the AWS ECS scale path.`
      } as const;
    }

    if (!target.environments.includes(input.environment)) {
      return {
        allowed: false,
        reason: `Environment ${input.environment} is not approved for service ${input.targetService}.`
      } as const;
    }

    if (!target.rollbackRunbookId) {
      return {
        allowed: false,
        reason: `Rollback runbook is required for service ${input.targetService}.`
      } as const;
    }

    if (target.scaleStep <= 0 || target.maxDesiredCount <= target.minDesiredCount) {
      return {
        allowed: false,
        reason: `Scale bounds are invalid for service ${input.targetService}.`
      } as const;
    }

    return {
      allowed: true,
      target
    } as const;
  }

  private async executeLiveScaleOut(
    request: ApprovedExecutionRequest,
    target: {
      clusterArn: string;
      ecsServiceName: string;
      region: string;
      minDesiredCount: number;
      maxDesiredCount: number;
      scaleStep: number;
    }
  ): Promise<ExecutionResult> {
    const { ecsClient, currentDesiredCount, nextDesiredCount } = await this.describeScaleOutPlan(target);

    try {
      await ecsClient.send(
        new UpdateServiceCommand({
          cluster: target.clusterArn,
          service: target.ecsServiceName,
          desiredCount: nextDesiredCount
        })
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        `AWS ECS update failed for ${target.ecsServiceName}: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }

    return {
      executionId: request.executionId,
      provider: "aws",
      status: "completed",
      summary: `Scaled ECS desired count from ${currentDesiredCount} to ${nextDesiredCount} for ${request.targetService}.`,
      steps: [
        {
          stepId: randomUUID(),
          title: "Validate target",
          status: "completed",
          detail: `Confirmed ${request.targetService} is mapped to ${target.ecsServiceName} in ${target.region}.`
        },
        {
          stepId: randomUUID(),
          title: "Assume short-lived role",
          status: "completed",
          detail: this.awsConfig.getRoleArn()
            ? `Configured execution role ${this.awsConfig.getRoleArn()} for bounded ECS action.`
            : "Using ambient AWS credentials for bounded ECS action."
        },
        {
          stepId: randomUUID(),
          title: "Increase desired count",
          status: "completed",
          detail: `Updated desired count from ${currentDesiredCount} to ${nextDesiredCount}.`
        }
      ]
    };
  }

  private async previewLiveScaleOut(target: {
    clusterArn: string;
    ecsServiceName: string;
    region: string;
    minDesiredCount: number;
    maxDesiredCount: number;
    scaleStep: number;
  }) {
    const { currentDesiredCount, nextDesiredCount } = await this.describeScaleOutPlan(target);
    return { currentDesiredCount, nextDesiredCount };
  }

  private async describeScaleOutPlan(target: {
    clusterArn: string;
    ecsServiceName: string;
    region: string;
    minDesiredCount: number;
    maxDesiredCount: number;
    scaleStep: number;
  }) {
    const ecsClient = new ECSClient({
      region: target.region
    });

    const describeResponse = await ecsClient.send(
      new DescribeServicesCommand({
        cluster: target.clusterArn,
        services: [target.ecsServiceName]
      })
    );
    const service = describeResponse.services?.[0];
    if (!service) {
      throw new NotFoundException(`ECS service ${target.ecsServiceName} not found in cluster ${target.clusterArn}.`);
    }

    const currentDesiredCount = service.desiredCount ?? target.minDesiredCount;
    const nextDesiredCount = Math.min(currentDesiredCount + target.scaleStep, target.maxDesiredCount);

    if (nextDesiredCount <= currentDesiredCount) {
      throw new BadRequestException(
        `ECS desired count ${currentDesiredCount} is already at or above the approved ceiling ${target.maxDesiredCount}.`
      );
    }

    return { ecsClient, currentDesiredCount, nextDesiredCount };
  }

  private async getLiveMetrics(query: MetricQuery, region: string): Promise<MetricResult[]> {
    const cloudWatchClient = new CloudWatchClient({ region });
    const response = await cloudWatchClient.send(
      new GetMetricDataCommand({
        StartTime: new Date(query.timeRange.start),
        EndTime: new Date(query.timeRange.end),
        MetricDataQueries: [
          {
            Id: "metricquery1",
            MetricStat: {
              Metric: {
                Namespace: "AWS/ECS",
                MetricName: this.toCloudWatchMetricName(query.metricName),
                Dimensions: [
                  {
                    Name: "ServiceName",
                    Value: query.serviceId
                  }
                ]
              },
              Period: 60,
              Stat: this.toCloudWatchStatistic(query.statistic)
            }
          }
        ]
      })
    );

    const points = response.MetricDataResults?.[0];
    const latestValue = points?.Values?.[0];
    const latestTimestamp = points?.Timestamps?.[0];

    if (latestValue === undefined || !latestTimestamp) {
      return [];
    }

    return [
      {
        metricName: query.metricName,
        value: latestValue,
        unit: points?.StatusCode === "Complete" ? "count" : "unknown",
        timestamp: latestTimestamp.toISOString()
      }
    ];
  }

  private toCloudWatchStatistic(statistic?: MetricQuery["statistic"]) {
    switch (statistic) {
      case "sum":
        return "Sum";
      case "min":
        return "Minimum";
      case "max":
        return "Maximum";
      case "p95":
        return "p95";
      case "avg":
      default:
        return "Average";
    }
  }

  private toCloudWatchMetricName(metricName: string) {
    switch (metricName) {
      case "cpu_utilization":
        return "CPUUtilization";
      case "queue_depth":
        return "PendingTaskCount";
      default:
        return metricName;
    }
  }
}
