import type { MetricQuery, MetricResult } from "@enterprise-resilience/contracts";

/**
 * Shapes a demo-mode metric reading, for use when live execution is off or no
 * live target is configured.
 *
 * This exists because the AWS and GCP adapters built this identical result shape
 * from their own per-provider value tables. Only the shaping is shared: the
 * values, the service guards, the log text and every real SDK call stay in their
 * own adapter, because those are the parts that should diverge as real provider
 * support lands.
 */
export function syntheticMetricResult(
  query: MetricQuery,
  values: Record<string, number>
): MetricResult[] {
  return [
    {
      metricName: query.metricName,
      value: values[query.metricName] ?? 0,
      unit: query.metricName.includes("rate") ? "percent" : "count",
      timestamp: new Date().toISOString()
    }
  ];
}
