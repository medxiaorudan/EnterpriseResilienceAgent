import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { CloudProvider, TargetAlertStateRecord } from "@enterprise-resilience/contracts";
import { CloudAdaptersService } from "../cloud-adapters/cloud-adapters.service.js";
import { StoreService } from "../common/store.service.js";
import { fallbackMetricValue, getMetricDefinitions, getThresholdStatus } from "./metric-policy.js";

@Injectable()
export class MetricsCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsCollectorService.name);
  private timer?: NodeJS.Timeout;
  private isCollecting = false;

  constructor(
    private readonly store: StoreService,
    private readonly cloudAdapters: CloudAdaptersService
  ) {}

  onModuleInit() {
    const intervalMs = Number(process.env.METRIC_POLL_INTERVAL_MS ?? "300000");
    const enabled = process.env.METRIC_POLLING_ENABLED !== "false";

    if (!enabled || intervalMs <= 0) {
      return;
    }

    this.timer = setInterval(() => {
      void this.collectAllTargets();
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async collectAllTargets() {
    if (this.isCollecting) {
      return;
    }

    this.isCollecting = true;
    try {
      const services = await this.store.listServices();
      const now = new Date();
      const start = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
      const end = now.toISOString();

      for (const service of services) {
        const adapter = this.cloudAdapters.getAdapter(service.cloudProvider);
        const metrics = getMetricDefinitions(service.cloudProvider);
        const alertSnapshots: Array<{ label: string; state: "normal" | "warning" | "breached" }> = [];
        let lastCollectedAt = now.toISOString();

        for (const metric of metrics) {
          const result = await adapter.getMetrics({
            serviceId: service.serviceId,
            metricName: metric.metricName,
            timeRange: { start, end },
            statistic: metric.metricName.includes("latency") ? "p95" : "avg"
          });

          const sample = await this.store.appendMetricSample({
            serviceId: service.serviceId,
            metricName: metric.metricName,
            unit: metric.unit,
            value: result[0]?.value ?? fallbackMetricValue(service.health, metric.metricName),
            timestamp: result[0]?.timestamp ?? now.toISOString()
          });
          lastCollectedAt = sample.timestamp;

          const recentSamples = await this.store.listMetricHistory(service.serviceId, [metric.metricName], 3);
          const statuses = (recentSamples.get(metric.metricName) ?? []).map((entry) =>
            getThresholdStatus(metric, entry.value)
          );
          const state =
            statuses.length === 3 && statuses.every((status) => status === "breached")
              ? "breached"
            : statuses.length === 3 && statuses.every((status) => status !== "within-threshold")
              ? "warning"
            : "normal";
          alertSnapshots.push({
            label: metric.label,
            state
          });
        }

        await this.syncAlertState(service.cloudProvider, service.serviceId, lastCollectedAt, alertSnapshots);
      }
    } catch (error) {
      this.logger.error("Metric polling failed", error instanceof Error ? error.stack : undefined);
    } finally {
      this.isCollecting = false;
    }
  }

  private async syncAlertState(
    provider: CloudProvider,
    targetService: string,
    lastCollectedAt: string,
    alertSnapshots: Array<{ label: string; state: "normal" | "warning" | "breached" }>
  ) {
    const breachedMetrics = alertSnapshots.filter((metric) => metric.state === "breached").map((metric) => metric.label);
    const warningMetrics = alertSnapshots
      .filter((metric) => metric.state === "warning")
      .map((metric) => metric.label);

    const nextState = breachedMetrics.length > 0 ? "breached" : warningMetrics.length > 0 ? "warning" : "normal";
    const summary =
      nextState === "breached"
        ? `${breachedMetrics.join(", ")} stayed breached across the last 3 samples.`
        : nextState === "warning"
          ? `${warningMetrics.join(", ")} stayed elevated across the last 3 samples.`
          : "Recent samples remain within policy thresholds.";
    const alertKey = `${provider}:${targetService}`;
    const previous = await this.store.getTargetAlertState(provider, targetService);
    const record: TargetAlertStateRecord = {
      alertKey,
      provider,
      targetService,
      state: nextState,
      summary,
      lastCollectedAt,
      breachedMetrics: nextState === "breached" ? breachedMetrics : warningMetrics,
      acknowledgedAt: previous?.state === nextState ? previous.acknowledgedAt : undefined,
      acknowledgedBy: previous?.state === nextState ? previous.acknowledgedBy : undefined,
      incidentId: previous?.incidentId,
      updatedAt: lastCollectedAt
    };

    await this.store.saveTargetAlertState(record);

    if (previous?.state !== nextState && (nextState === "warning" || nextState === "breached")) {
      await this.store.recordAudit({
        actor: "metric-collector",
        provider,
        targetService,
        incidentId: previous?.incidentId,
        category: "policy",
        summary: "Target alert state changed",
        detail: `${targetService} moved from ${previous?.state ?? "unknown"} to ${nextState}: ${summary}`
      });
    }
  }
}
