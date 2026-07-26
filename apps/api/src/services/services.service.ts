import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  CloudChange,
  IncidentRecord,
  ServiceHealth,
  ServiceMetricTrend
} from "@enterprise-resilience/contracts";
import { CloudAdaptersService } from "../cloud-adapters/cloud-adapters.service.js";
import { StoreService } from "../common/store.service.js";

@Injectable()
export class ServicesService {
  constructor(
    private readonly store: StoreService,
    private readonly cloudAdapters: CloudAdaptersService
  ) {}

  list() {
    return this.store.listServices();
  }

  async getOne(serviceId: string) {
    const service = await this.store.getService(serviceId);
    if (!service) {
      throw new NotFoundException(`Service ${serviceId} not found.`);
    }

    return service;
  }

  async getHealth(serviceId: string) {
    return (await this.getOne(serviceId)).health;
  }

  async getDependencies(serviceId: string) {
    const service = await this.getOne(serviceId);

    return Promise.all(
      service.dependencies.map(async (dependency) => {
        const target = await this.store.getService(dependency.serviceId);
        return {
          ...dependency,
          cloudProvider: target?.cloudProvider,
          health: target?.health
        };
      })
    );
  }

  async getIncidents(serviceId: string) {
    return (await this.store.listIncidents()).filter((incident) => incident.primaryService === serviceId);
  }

  async getChanges(serviceId: string) {
    return (await this.getOne(serviceId)).recentChanges;
  }

  async getMetricTrends(serviceId: string): Promise<ServiceMetricTrend[]> {
    const service = await this.getOne(serviceId);
    const adapter = this.cloudAdapters.getAdapter(service.cloudProvider);
    const now = new Date();
    const start = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const end = now.toISOString();

    const metricDefinitions =
      service.cloudProvider === "aws"
        ? [
            { metricName: "queue_depth", label: "Queue depth", unit: "count", max: 1200 },
            { metricName: "cpu_utilization", label: "CPU utilization", unit: "%", max: 100 },
            { metricName: "p95_latency_ms", label: "Latency p95", unit: "ms", max: 3000 }
          ]
        : [
            { metricName: "request_error_rate", label: "Request error rate", unit: "%", max: 5 },
            { metricName: "request_latency_p95_ms", label: "Latency p95", unit: "ms", max: 1000 },
            { metricName: "revision_health_score", label: "Revision health", unit: "score", max: 100 }
          ];

    const baseSeries = await Promise.all(
      metricDefinitions.map(async (metric) => {
        const result = await adapter.getMetrics({
          serviceId,
          metricName: metric.metricName,
          timeRange: { start, end },
          statistic: metric.metricName.includes("latency") ? "p95" : "avg"
        });

        const latestValue = result[0]?.value ?? this.fallbackMetricValue(service.health, metric.metricName);
        return {
          metricName: metric.metricName,
          label: metric.label,
          unit: metric.unit,
          points: this.buildSyntheticTrend(latestValue, metric.max, service.health, now)
        } satisfies ServiceMetricTrend;
      })
    );

    return baseSeries;
  }

  async getApprovalContext(serviceId: string) {
    const incidents = await this.store.listIncidents();
    const matching = incidents.find(
      (incident) =>
        incident.primaryService === serviceId ||
        incident.proposals.some((proposal) => proposal.targetService === serviceId)
    );

    const proposal = matching?.proposals.find((item) => item.targetService === serviceId) ?? matching?.proposals[0];

    return {
      state: matching?.status ?? "NO_ACTIVE_PROPOSAL",
      approvalPolicy: proposal?.approvalPolicy ?? "not-applicable",
      requiresHumanApproval:
        proposal?.approvalPolicy !== undefined
          ? proposal.approvalPolicy !== "automatic-within-approved-range"
          : false,
      runbookId: proposal?.runbookId,
      targetEnvironment: proposal?.targetEnvironment,
      incidentId: matching?.incidentId
    };
  }

  private fallbackMetricValue(health: ServiceHealth, metricName: string) {
    const map: Record<string, number> = {
      queue_depth: health.saturation * 10,
      cpu_utilization: health.saturation,
      p95_latency_ms: health.latencyP95Ms,
      request_error_rate: health.errorRate,
      request_latency_p95_ms: health.latencyP95Ms,
      revision_health_score: Math.max(0, 100 - health.errorRate * 10)
    };

    return map[metricName] ?? 0;
  }

  private buildSyntheticTrend(currentValue: number, max: number, health: ServiceHealth, now: Date) {
    const severityFactor =
      health.status === "critical" ? 1.35 : health.status === "degraded" ? 1.15 : 0.9;

    return Array.from({ length: 6 }, (_, index) => {
      const step = 5 - index;
      const timestamp = new Date(now.getTime() - step * 5 * 60 * 1000).toISOString();
      const multiplier = 1 - (5 - index) * 0.05 * severityFactor;
      const value = Math.max(0, Math.min(max, Number((currentValue * multiplier).toFixed(2))));

      return {
        timestamp,
        value
      };
    });
  }
}
