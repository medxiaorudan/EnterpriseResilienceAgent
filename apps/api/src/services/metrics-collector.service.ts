import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CloudAdaptersService } from "../cloud-adapters/cloud-adapters.service.js";
import { StoreService } from "../common/store.service.js";
import { fallbackMetricValue, getMetricDefinitions } from "./metric-policy.js";

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

        for (const metric of metrics) {
          const result = await adapter.getMetrics({
            serviceId: service.serviceId,
            metricName: metric.metricName,
            timeRange: { start, end },
            statistic: metric.metricName.includes("latency") ? "p95" : "avg"
          });

          await this.store.appendMetricSample({
            serviceId: service.serviceId,
            metricName: metric.metricName,
            unit: metric.unit,
            value: result[0]?.value ?? fallbackMetricValue(service.health, metric.metricName),
            timestamp: result[0]?.timestamp ?? now.toISOString()
          });
        }
      }
    } catch (error) {
      this.logger.error("Metric polling failed", error instanceof Error ? error.stack : undefined);
    } finally {
      this.isCollecting = false;
    }
  }
}
