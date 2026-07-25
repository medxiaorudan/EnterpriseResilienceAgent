import { Injectable } from "@nestjs/common";

export interface AwsExecutionTarget {
  serviceId: string;
  clusterArn: string;
  ecsServiceName: string;
  region: string;
  minDesiredCount: number;
  maxDesiredCount: number;
  scaleStep: number;
  rollbackRunbookId: string;
  environments: string[];
}

@Injectable()
export class AwsConfigService {
  private readonly targets: Map<string, AwsExecutionTarget>;

  constructor() {
    this.targets = new Map(this.parseTargets().map((target) => [target.serviceId, target]));
  }

  isLiveExecutionEnabled() {
    return process.env.AWS_ECS_LIVE_EXECUTION === "true";
  }

  getRoleArn() {
    return process.env.AWS_EXECUTION_ROLE_ARN;
  }

  getExternalId() {
    return process.env.AWS_EXECUTION_EXTERNAL_ID;
  }

  getTarget(serviceId: string) {
    return this.targets.get(serviceId);
  }

  listTargets() {
    return [...this.targets.values()];
  }

  private parseTargets() {
    const raw = process.env.AWS_ECS_ALLOWED_TARGETS;
    if (!raw) {
      return [
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
      ] satisfies AwsExecutionTarget[];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed as AwsExecutionTarget[];
    } catch {
      return [];
    }
  }
}
