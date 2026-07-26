import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  ServiceMetricTrend,
  StoredMetricSample
} from "@enterprise-resilience/contracts";
import { CloudAdaptersService } from "../cloud-adapters/cloud-adapters.service.js";
import { StoreService } from "../common/store.service.js";
import {
  ensureMinimumSamples,
  fallbackMetricValue,
  getMetricDefinitions,
  getThresholdLabel,
  getThresholdStatus,
  type MetricDefinition
} from "./metric-policy.js";

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

    const metricDefinitions = getMetricDefinitions(service.cloudProvider);

    const liveSamples = await Promise.all(
      metricDefinitions.map(async (metric) => {
        const result = await adapter.getMetrics({
          serviceId,
          metricName: metric.metricName,
          timeRange: { start, end },
          statistic: metric.metricName.includes("latency") ? "p95" : "avg"
        });

        const latestValue = result[0]?.value ?? fallbackMetricValue(service.health, metric.metricName);
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
        ensureMinimumSamples(rawSamples, metric.max, service.health),
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
    const thresholdStatus = getThresholdStatus(metric, latestValue);

    return {
      metricName: metric.metricName,
      label: metric.label,
      unit: metric.unit,
      points,
      latestValue,
      delta,
      deltaDirection: delta === 0 ? "flat" : delta > 0 ? "up" : "down",
      thresholdLabel: getThresholdLabel(metric),
      thresholdStatus,
      source
    };
  }
}
