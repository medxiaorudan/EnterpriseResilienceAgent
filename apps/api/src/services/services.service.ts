import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  ServiceHealth,
  ServiceMetricTrend,
  StoredMetricSample
} from "@enterprise-resilience/contracts";
import { CloudAdaptersService } from "../cloud-adapters/cloud-adapters.service.js";
import { StoreService } from "../common/store.service.js";

type MetricDefinition = {
  metricName: string;
  label: string;
  unit: string;
  max: number;
  warningThreshold: number;
  breachThreshold: number;
  betterDirection: "lower" | "higher";
};

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

    const metricDefinitions = this.getMetricDefinitions(service.cloudProvider);

    const liveSamples = await Promise.all(
      metricDefinitions.map(async (metric) => {
        const result = await adapter.getMetrics({
          serviceId,
          metricName: metric.metricName,
          timeRange: { start, end },
          statistic: metric.metricName.includes("latency") ? "p95" : "avg"
        });

        const latestValue = result[0]?.value ?? this.fallbackMetricValue(service.health, metric.metricName);
        return this.store.appendMetricSample({
          serviceId,
          metricName: metric.metricName,
          unit: metric.unit,
          value: latestValue,
          timestamp: result[0]?.timestamp ?? now.toISOString()
        });
      })
    );

    const persistedHistory = await this.store.listMetricHistory(
      serviceId,
      metricDefinitions.map((metric) => metric.metricName),
      6
    );

    return metricDefinitions.map((metric, index) => {
      const rawSamples = persistedHistory.get(metric.metricName) ?? [liveSamples[index]];
      return this.toTrend(
        metric,
        this.ensureMinimumSamples(rawSamples, metric.max, service.health),
        rawSamples.length >= 6 ? "persisted" : "seeded"
      );
    });
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

  private getMetricDefinitions(provider: "aws" | "gcp"): MetricDefinition[] {
    return provider === "aws"
      ? [
          {
            metricName: "queue_depth",
            label: "Queue depth",
            unit: "count",
            max: 1200,
            warningThreshold: 850,
            breachThreshold: 1000,
            betterDirection: "lower"
          },
          {
            metricName: "cpu_utilization",
            label: "CPU utilization",
            unit: "%",
            max: 100,
            warningThreshold: 75,
            breachThreshold: 90,
            betterDirection: "lower"
          },
          {
            metricName: "p95_latency_ms",
            label: "Latency p95",
            unit: "ms",
            max: 3000,
            warningThreshold: 1800,
            breachThreshold: 2500,
            betterDirection: "lower"
          }
        ]
      : [
          {
            metricName: "request_error_rate",
            label: "Request error rate",
            unit: "%",
            max: 5,
            warningThreshold: 0.8,
            breachThreshold: 1.5,
            betterDirection: "lower"
          },
          {
            metricName: "request_latency_p95_ms",
            label: "Latency p95",
            unit: "ms",
            max: 1000,
            warningThreshold: 550,
            breachThreshold: 800,
            betterDirection: "lower"
          },
          {
            metricName: "revision_health_score",
            label: "Revision health",
            unit: "score",
            max: 100,
            warningThreshold: 95,
            breachThreshold: 90,
            betterDirection: "higher"
          }
        ];
  }

  private toTrend(
    metric: MetricDefinition,
    samples: StoredMetricSample[],
    source: ServiceMetricTrend["source"]
  ): ServiceMetricTrend {
    const points = samples.map((sample) => ({
      timestamp: sample.timestamp,
      value: sample.value
    }));
    const latestValue = points[points.length - 1]?.value ?? 0;
    const baselineValue = points[0]?.value ?? latestValue;
    const delta = Number((latestValue - baselineValue).toFixed(2));
    const thresholdStatus = this.getThresholdStatus(metric, latestValue);

    return {
      metricName: metric.metricName,
      label: metric.label,
      unit: metric.unit,
      points,
      latestValue,
      delta,
      deltaDirection: delta === 0 ? "flat" : delta > 0 ? "up" : "down",
      thresholdLabel: this.getThresholdLabel(metric),
      thresholdStatus,
      source
    };
  }

  private ensureMinimumSamples(samples: StoredMetricSample[], max: number, health: ServiceHealth) {
    if (samples.length >= 6) {
      return samples;
    }

    const latest = samples[samples.length - 1];
    if (!latest) {
      return samples;
    }

    const currentValue = latest.value;
    const now = new Date(latest.timestamp);
    const severityFactor =
      health.status === "critical" ? 1.35 : health.status === "degraded" ? 1.15 : 0.9;
    const synthetic = Array.from({ length: 6 - samples.length }, (_, index) => {
      const step = 6 - samples.length - index;
      const timestamp = new Date(now.getTime() - step * 5 * 60 * 1000).toISOString();
      const multiplier = 1 - step * 0.05 * severityFactor;
      const value = Math.max(0, Math.min(max, Number((currentValue * multiplier).toFixed(2))));

      return {
        sampleId: `seed-${latest.metricName}-${index}`,
        serviceId: latest.serviceId,
        metricName: latest.metricName,
        unit: latest.unit,
        value,
        timestamp
      } satisfies StoredMetricSample;
    });

    return [...synthetic, ...samples];
  }

  private getThresholdLabel(metric: MetricDefinition) {
    if (metric.betterDirection === "lower") {
      return `Warn above ${metric.warningThreshold}${metric.unit}`;
    }

    return `Warn below ${metric.warningThreshold} ${metric.unit}`;
  }

  private getThresholdStatus(metric: MetricDefinition, value: number) {
    if (metric.betterDirection === "lower") {
      if (value >= metric.breachThreshold) {
        return "breached";
      }
      if (value >= metric.warningThreshold) {
        return "warning";
      }
      return "within-threshold";
    }

    if (value <= metric.breachThreshold) {
      return "breached";
    }
    if (value <= metric.warningThreshold) {
      return "warning";
    }
    return "within-threshold";
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
}
