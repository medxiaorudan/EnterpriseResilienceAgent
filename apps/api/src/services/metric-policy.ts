import type { CloudProvider, ServiceHealth, StoredMetricSample } from "@enterprise-resilience/contracts";

export type MetricDefinition = {
  metricName: string;
  label: string;
  unit: string;
  max: number;
  warningThreshold: number;
  breachThreshold: number;
  betterDirection: "lower" | "higher";
};

const METRIC_DEFINITIONS: Record<CloudProvider, MetricDefinition[]> = {
  aws: [
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
  ],
  gcp: [
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
  ]
};

export function getMetricDefinitions(provider: CloudProvider) {
  return METRIC_DEFINITIONS[provider];
}

export function getThresholdLabel(metric: MetricDefinition) {
  if (metric.betterDirection === "lower") {
    return `Warn above ${metric.warningThreshold}${metric.unit}`;
  }

  return `Warn below ${metric.warningThreshold} ${metric.unit}`;
}

export function getThresholdStatus(metric: MetricDefinition, value: number) {
  if (metric.betterDirection === "lower") {
    if (value >= metric.breachThreshold) {
      return "breached" as const;
    }
    if (value >= metric.warningThreshold) {
      return "warning" as const;
    }
    return "within-threshold" as const;
  }

  if (value <= metric.breachThreshold) {
    return "breached" as const;
  }
  if (value <= metric.warningThreshold) {
    return "warning" as const;
  }
  return "within-threshold" as const;
}

export function fallbackMetricValue(health: ServiceHealth, metricName: string) {
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

export function ensureMinimumSamples(
  samples: StoredMetricSample[],
  max: number,
  health: ServiceHealth
) {
  if (samples.length >= 6) {
    return samples;
  }

  const latest = samples[samples.length - 1];
  if (!latest) {
    return samples;
  }

  const currentValue = latest.value;
  const now = new Date(latest.timestamp);
  const severityFactor = health.status === "critical" ? 1.35 : health.status === "degraded" ? 1.15 : 0.9;
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
