import { Injectable } from "@nestjs/common";

export interface GcpExecutionTarget {
  serviceId: string;
  projectId: string;
  serviceName: string;
  region: string;
  shiftPercent: number;
  previousRevision: string;
  rollbackRunbookId?: string;
  environments: string[];
}

@Injectable()
export class GcpConfigService {
  private readonly targets: Map<string, GcpExecutionTarget>;

  constructor() {
    this.targets = new Map(this.parseTargets().map((target) => [target.serviceId, target]));
  }

  isLiveExecutionEnabled() {
    return process.env.GCP_CLOUD_RUN_LIVE_EXECUTION === "true";
  }

  getServiceAccount() {
    return process.env.GCP_EXECUTION_SERVICE_ACCOUNT;
  }

  getWorkloadIdentityProvider() {
    return process.env.GCP_WORKLOAD_IDENTITY_PROVIDER;
  }

  getTarget(serviceId: string) {
    return this.targets.get(serviceId);
  }

  listTargets() {
    return [...this.targets.values()];
  }

  private parseTargets() {
    const raw = process.env.GCP_CLOUD_RUN_ALLOWED_TARGETS;
    if (!raw) {
      return [
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
      ] satisfies GcpExecutionTarget[];
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed as GcpExecutionTarget[];
    } catch {
      return [];
    }
  }
}
